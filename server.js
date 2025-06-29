import express from 'express'
import axios from 'axios'
import dotenv from 'dotenv'
import cors from 'cors'
import pg from 'pg'
import Fuse from 'fuse.js'

dotenv.config()
const app = express()
app.use(express.static('public'))

app.use(cors({
  origin: 'https://www.profiausbau.com',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json())

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
})

app.post('/api/chat', async (req, res) => {
  const { message } = req.body

  let faqData = []
  try {
    const result = await pool.query('SELECT frage, antwort FROM faq')
    faqData = result.rows
  } catch (err) {
    console.warn('⚠️ Fehler beim Laden der FAQ aus DB:', err.message)
  }

  const fuse = new Fuse(faqData, {
    keys: ['frage'],
    threshold: 0.3
  })

  const result = fuse.search(message)
  if (result.length && result[0].score < 0.4) {
    const antwort = result[0].item.antwort

    // ✅ Logging in chat_log (FAQ-Antwort)
    try {
      await pool.query(
        'INSERT INTO chat_log (frage, antwort, quelle) VALUES ($1, $2, $3)',
        [message, antwort, 'faq']
      )
    } catch (logErr) {
      console.warn('⚠️ Konnte Chat-Log (FAQ) nicht speichern:', logErr.message)
    }

    console.log('✅ Antwort aus FAQ:', result[0].item.frage)
    return res.json({ reply: antwort })
  }

  // 🔁 GPT-Fallback
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Du agierst als digitaler Assistent der Profiausbau Aachen GmbH und antwortest im Namen des Unternehmens wie ein Mitarbeiter.

Sprich professionell und freundlich. Sei klar, kurz und informativ. Nutze nur bekannte Inhalte.

Wenn du etwas nicht weißt, bitte höflich um direkte Kontaktaufnahme:
📧 info@profiausbau.com
📞 +49 173 592 37 48`
          },
          {
            role: 'assistant',
            content: 'Willkommen bei Profiausbau Aachen GmbH! 👷‍♂️ Wie kann ich Ihnen helfen?'
          },
          {
            role: 'user',
            content: message
          }
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

    const botReply = response.data.choices?.[0]?.message?.content
    if (!botReply) return res.status(500).json({ error: 'Antwort war leer.' })

    // ✅ Logging in chat_log (GPT-Antwort)
    try {
      await pool.query(
        'INSERT INTO chat_log (frage, antwort, quelle) VALUES ($1, $2, $3)',
        [message, botReply, 'gpt']
      )
    } catch (logErr) {
      console.warn('⚠️ Konnte Chat-Log (GPT) nicht speichern:', logErr.message)
    }

    res.json({ reply: botReply })

  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message)
    res.status(500).json({ error: 'Fehler bei OpenAI' })
  }
})


// 📤 GET: FAQ abrufen
app.get('/api/faq', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM faq')
    res.json(result.rows)
  } catch (err) {
    console.error('❌ Fehler beim Laden der FAQ:', err.message)
    res.status(500).json({ error: 'FAQ konnte nicht geladen werden.' })
  }
})

// 💾 POST: FAQ speichern
app.post('/api/faq', async (req, res) => {
  const faqs = req.body
  if (!Array.isArray(faqs)) {
    return res.status(400).json({ error: 'Datenformat ungültig' })
  }

  try {
    const client = await pool.connect()
    await client.query('BEGIN')
    await client.query('DELETE FROM faq')

    for (const item of faqs) {
      await client.query(
        'INSERT INTO faq (frage, antwort) VALUES ($1, $2)',
        [item.frage, item.antwort]
      )
    }

    await client.query('COMMIT')
    client.release()

    res.json({ success: true })
  } catch (err) {
    console.error('❌ Fehler beim Speichern:', err.message)
    res.status(500).json({ error: 'FAQ konnten nicht gespeichert werden' })
  }
})

// 🔊 Server starten
app.listen(3000, () => {
  console.log('✅ Profiausbau-Chatbot läuft auf Port 3000')
})
