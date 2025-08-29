import express from 'express'
import axios from 'axios'
import 'dotenv/config'
import cors from 'cors'
import Fuse from 'fuse.js'
import fs from 'fs'
import path from 'path'

const app = express()
app.use(express.static('public'))

app.use(cors({
  origin: 'https://www.baumaschinen-mueller.de',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json({ limit: '10mb' }))

// Redis via Upstash (optional)
const UPSTASH_URL = process.env.UPSTASH_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REST_TOKEN
const UPSTASH_KEY = 'faq_uwe_mueller'

// Lokale Datei
const FAQ_FILE = './faq.json'

let fuse = null

// === Helper: FAQ laden ===
async function loadFaqData() {
  // 1. Redis versuchen
  try {
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      const response = await axios.get(`${UPSTASH_URL}/get/${UPSTASH_KEY}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      })
      const cached = response.data?.result
      if (cached) return JSON.parse(cached)
    }
  } catch (err) {
    console.warn('⚠️ Redis REST read failed:', err.message)
  }

  // 2. Lokale Datei
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

// === Helper: FAQ speichern ===
async function saveFaqData(faqs) {
  // Redis
  try {
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      await axios.post(`${UPSTASH_URL}/set/${UPSTASH_KEY}`, {
        value: JSON.stringify(faqs),
        expiration: 86400
      }, {
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      })
      return true
    }
  } catch (err) {
    console.warn('⚠️ Redis REST write failed:', err.message)
  }

  // Datei
  try {
    fs.writeFileSync(FAQ_FILE, JSON.stringify(faqs, null, 2), 'utf8')
    return true
  } catch (err) {
    console.error('❌ Fehler beim Schreiben von faq.json:', err.message)
    return false
  }
}

// === Chat ===
app.post('/api/chat', async (req, res) => {
  const { message } = req.body

  if (message === 'ping') return res.json({ reply: 'pong' })

  const faqData = await loadFaqData()

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

  // GPT-Fallback
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `Du agierst als digitaler Assistent der Uwe Müller GmbH (Baumaschinen Müller).
Sprich professionell, freundlich und kurz.
Wenn du etwas nicht weißt, bitte höflich um direkte Kontaktaufnahme:
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

    let botReply = response.data.choices?.[0]?.message?.content
    if (!botReply) botReply = "Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de"
    res.json({ reply: botReply })
  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message)
    res.json({ reply: "Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de" })
  }
})

// === FAQ laden ===
app.get('/api/faq', async (req, res) => {
  const data = await loadFaqData()
  res.json(data)
})

// === FAQ speichern (komplette Liste überschreiben) ===
app.post('/api/faq', async (req, res) => {
  const faqs = req.body
  if (!Array.isArray(faqs)) return res.status(400).json({ error: 'Datenformat ungültig' })

  const success = await saveFaqData(faqs)
  fuse = null
  res.json({ success })
})

// === Cache löschen ===
app.delete('/api/cache', async (req, res) => {
  try {
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      await axios.get(`${UPSTASH_URL}/del/${UPSTASH_KEY}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      })
    }
    res.json({ success: true, message: 'Cache gelöscht' })
  } catch (err) {
    console.error('❌ Fehler beim Cache-Löschen:', err.message)
    res.status(500).json({ success: false, error: 'Cache konnte nicht gelöscht werden' })
  }
})

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Uwe Müller Chatbot läuft auf Port 3000 (faq.json + Redis optional)')
})
