import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import Fuse from 'fuse.js'
import axios from 'axios'

const app = express()
app.use(express.json())
app.use(cors())

// Statische Dateien (Frontend & Admin)
app.use('/', express.static('public'))
app.use('/frontend', express.static('frontend'))

const FAQ_FILE = './faq.json'
let fuse = null

// === Hilfsfunktionen ===
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

function saveFaqData(faqs) {
  try {
    fs.writeFileSync(FAQ_FILE, JSON.stringify(faqs, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error('❌ Fehler beim Schreiben von faq.json:', err.message)
    return false
  }
}

// === API ===

// Chat mit FAQ + GPT-Fallback
app.post('/api/chat', async (req, res) => {
  const { message } = req.body
  if (message === 'ping') return res.json({ reply: 'pong' })

  const faqData = loadFaqData()
  if (faqData.length) {
    if (!fuse || !fuse._docs || fuse._docs.length !== faqData.length) {
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

  // GPT-Fallback
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

// FAQs laden
app.get('/api/faq', (req, res) => {
  const data = loadFaqData()
  res.json(data)
})

// FAQs speichern
app.post('/api/faq', (req, res) => {
  const faqs = req.body
  if (!Array.isArray(faqs)) {
    return res.status(400).json({ error: 'Datenformat ungültig' })
  }
  const success = saveFaqData(faqs)
  fuse = null
  res.json({ success })
})

// Cache löschen (nur Fuse-Cache hier)
app.delete('/api/cache', (req, res) => {
  fuse = null
  res.json({ success: true, message: 'Cache gelöscht' })
})

// === Server starten ===
app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Uwe Müller Chatbot läuft auf Port 3000 mit Admin & FAQ')
})
