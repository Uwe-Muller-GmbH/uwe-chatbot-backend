import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import Fuse from 'fuse.js'
import axios from 'axios'
import { fileURLToPath } from 'url'

const app = express()
app.use(express.json())
app.use(cors())

// === Pfad zu frontend ermitteln ===
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Frontend statisch ausliefern
app.use(express.static(path.join(__dirname, 'frontend')))

// API bleibt wie gehabt ...
const FAQ_FILE = './faq.json'
let fuse = null

function loadFaqData() {
  try {
    if (fs.existsSync(FAQ_FILE)) {
      const content = fs.readFileSync(path.resolve(FAQ_FILE), 'utf8')
      return JSON.parse(content)
    }
  } catch (err) {
    console.error('❌ Fehler beim Lesen von faq.json:', err.message)
  }
  return []
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body
  if (message === 'ping') return res.json({ reply: 'pong' })

  const faqData = loadFaqData()
  if (faqData.length) {
    if (!fuse || fuse._docs.length !== faqData.length) {
      fuse = new Fuse(faqData, {
        keys: ['frage'],
        threshold: 0.5,
        distance: 100,
        minMatchCharLength: 2
      })
    }
    const result = fuse.search(message)
    if (result.length) {
      return res.json({ reply: result[0].item.antwort })
    }
  }

  // GPT-Fallback (wie gehabt) ...
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Du bist der digitale Assistent der Uwe Müller GmbH (Baumaschinen Müller).
Antworten: professionell, freundlich, kurz und informativ.
Nutze bekannte Inhalte, keine Spekulationen.
Wenn du keine Infos hast, verweise höflich auf Kontakt:
📧 info@baumaschinen-mueller.de
📞 +49 2403 997312`
          },
          { role: 'user', content: message }
        ],
        temperature: 0.6,
        max_tokens: 800
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    )

    const reply = response.data.choices?.[0]?.message?.content
    res.json({ reply: reply || "Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de" })
  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message)
    res.json({ reply: "Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de" })
  }
})

app.get('/api/faq', (req, res) => {
  const data = loadFaqData()
  res.json(data)
})

// Catch-All: index.html zurückgeben
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
})

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Chatbot läuft mit Frontend + FAQ + GPT-Fallback auf Port 3000')
})
