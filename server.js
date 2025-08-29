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

// __dirname nachbauen (wegen ES-Modules)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

// === Chat Endpoint ===
const greetings = ["hi", "hallo", "hey", "guten tag", "moin", "servus"]

app.post('/api/chat', async (req, res) => {
  const { message } = req.body
  const normalized = message.toLowerCase().trim()

  if (greetings.includes(normalized)) {
    return res.json({
      reply: "👋 Hallo! Wie kann ich Ihnen helfen?"
    })
  }

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

  // === GPT Fallback ===
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

// === FAQ API ===
app.get('/api/faq', (req, res) => {
  const data = loadFaqData()
  res.json(data)
})

app.post('/api/faq', (req, res) => {
  try {
    fs.writeFileSync(FAQ_FILE, JSON.stringify(req.body, null, 2), 'utf8')
    fuse = null // Cache leeren
    res.json({ success: true })
  } catch (err) {
    console.error("❌ Fehler beim Speichern von FAQ:", err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

// Einzelne FAQ hinzufügen
app.post('/api/faq-add-single', (req, res) => {
  try {
    const { frage, antwort } = req.body
    if (!frage || !antwort) {
      return res.status(400).json({ success: false, error: "Frage oder Antwort fehlt" })
    }

    const data = loadFaqData()
    data.push({ frage, antwort })
    fs.writeFileSync(FAQ_FILE, JSON.stringify(data, null, 2), 'utf8')
    fuse = null
    res.json({ success: true })
  } catch (err) {
    console.error("❌ Fehler beim Hinzufügen:", err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

// Cache löschen
app.delete('/api/cache', (req, res) => {
  fuse = null
  res.json({ success: true })
})

// === Frontend & Admin statisch ausliefern ===
app.use(express.static(path.join(__dirname, 'frontend')))
app.use(express.static(path.join(__dirname, 'public')))

// Chatbot-Seite
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
})

// Admin-Seite
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'))
})

// Catch-All (alle unbekannten Routen → Chatbot)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'))
})

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Chatbot + Admin läuft auf Port 3000')
})
