import express from 'express'
import axios from 'axios'
import 'dotenv/config'
import cors from 'cors'
import Fuse from 'fuse.js'

const app = express()
app.use(express.static('public'))

// erlaubte Domains für Frontend (ENV steuert es)
const FRONTEND_ORIGINS = process.env.FRONTEND_ORIGINS
  ? process.env.FRONTEND_ORIGINS.split(',').map(s => s.trim())
  : ['https://www.baumaschinen-mueller.de']

app.use(cors({
  origin: FRONTEND_ORIGINS,
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())

// Redis via Upstash
const UPSTASH_URL = process.env.UPSTASH_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REST_TOKEN
const UPSTASH_KEY = process.env.UPSTASH_FAQ_KEY || 'faq_uwe_mueller'

let fuse = null

async function loadFaqData() {
  try {
    const response = await axios.get(`${UPSTASH_URL}/get/${UPSTASH_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    })
    const cached = response.data?.result
    if (cached) return JSON.parse(cached)
  } catch (err) {
    console.warn('⚠️ Redis REST read failed:', err.message)
  }
  return []
}

app.post('/api/chat', async (req, res) => {
  const { message } = req.body

  // ➤ Direkt auf Ping reagieren
  if (message === 'ping') {
    return res.json({ reply: 'pong' })
  }

  const faqData = await loadFaqData()

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
      let antwort = result[0].item.antwort
      console.log('✅ FAQ-Treffer:', result[0].item.frage)
      return res.json({ reply: antwort })
    }
  }

  // Fallback: GPT
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Du agierst als digitaler Assistent der Uwe Müller GmbH (Baumaschinen Müller).
Antworte im Namen des Unternehmens wie ein Mitarbeiter.

Sprich professionell und freundlich. Sei klar, kurz und informativ. Nutze nur bekannte Inhalte.

Wenn du etwas nicht weißt, bitte höflich um direkte Kontaktaufnahme:
📧 info@baumaschinen-mueller.de
📞 +49 2403 997312`
          },
          { role: 'assistant', content: 'Willkommen bei der Uwe Müller GmbH! 👷 Wie kann ich Ihnen helfen?' },
          { role: 'user', content: message }
        ],
        temperature: 0.7,
        max_tokens: 800
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Organization': process.env.OPENAI_ORG_ID
        }
      }
    )

    let botReply = response.data.choices?.[0]?.message?.content
    if (!botReply) return res.status(500).json({ error: 'Antwort war leer.' })

    res.json({ reply: botReply })
  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message)
    res.status(500).json({ error: 'Fehler bei OpenAI' })
  }
})

app.get('/api/faq', async (req, res) => {
  try {
    const data = await loadFaqData()
    res.json(data)
  } catch (err) {
    console.error('❌ Fehler beim Laden der FAQ:', err.message)
    res.status(500).json({ error: 'FAQ konnte nicht geladen werden.' })
  }
})

app.post('/api/faq', async (req, res) => {
  const faqs = req.body
  if (!Array.isArray(faqs)) {
    return res.status(400).json({ error: 'Datenformat ungültig' })
  }

  try {
    await axios.post(`${UPSTASH_URL}/set/${UPSTASH_KEY}`, {
      value: JSON.stringify(faqs),
      expiration: 86400 // 24h
    }, {
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })

    fuse = null
    res.json({ success: true })
  } catch (err) {
    console.error('❌ Fehler beim Speichern der FAQ:', err.message)
    res.status(500).json({ error: 'FAQ konnten nicht gespeichert werden' })
  }
})

app.delete('/api/cache', async (req, res) => {
  try {
    await axios.get(`${UPSTASH_URL}/del/${UPSTASH_KEY}`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    })
    console.log('🧹 Redis-Cache gelöscht')
    return res.json({ success: true, message: 'Cache gelöscht' })
  } catch (err) {
    console.error('❌ Fehler beim Cache-Löschen:', err.message)
    return res.status(500).json({ success: false, error: 'Cache konnte nicht gelöscht werden' })
  }
})

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Uwe Müller Chatbot läuft auf Port 3000 (mit Redis REST Cache)')
})
