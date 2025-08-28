import express from 'express'
import axios from 'axios'
import 'dotenv/config'
import cors from 'cors'
import pg from 'pg'
import Fuse from 'fuse.js'

const app = express()
app.use(express.static('public'))

app.use(cors({
  origin: 'https://www.profiausbau.com',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))

app.use(express.json({ limit: '10mb' }))

const { Pool } = pg
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

// Redis via Upstash
const UPSTASH_URL = process.env.UPSTASH_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REST_TOKEN

let fuse = null

async function loadFaqData() {
  try {
    const response = await axios.get(`${UPSTASH_URL}/get/faq`, {
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`
      }
    })
    const cached = response.data?.result
    if (cached) return JSON.parse(cached)
  } catch (err) {
    console.warn('⚠️ Redis REST read failed:', err.message)
  }

  const result = await pool.query('SELECT frage, antwort FROM faq')
  const data = result.rows

  try {
    await axios.post(`${UPSTASH_URL}/set/faq`, {
      value: JSON.stringify(data),
      expiration: 300
    }, {
      headers: {
        Authorization: `Bearer ${UPSTASH_TOKEN}`,
        'Content-Type': 'application/json'
      }
    })
  } catch (err) {
    console.warn('⚠️ Redis REST write failed:', err.message)
  }

  return data
}

  app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  // ➤ NEU: Direkt auf Ping reagieren, ohne FAQ/GPT zu laden
  if (message === 'ping') {
    return res.json({ reply: 'pong' }); // schnelle Antwort zur Initialisierung
  }

  // ... hier geht dein bestehender Code weiter ...

  const faqData = await loadFaqData()
    
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
  let antwort = result[0].item.antwort;

  // ✅ Sicherheitsprüfung Geschäftsführer
  if (
    antwort.toLowerCase().includes("geschäftsführer") &&
    !antwort.toLowerCase().includes("leszek damian cieslok")
  ) {
    antwort = "Der Geschäftsführer der Profiausbau Aachen GmbH ist Leszek Damian Cieslok.";
  }

  try {
    await pool.query(
      'INSERT INTO chat_log (frage, antwort, quelle) VALUES ($1, $2, $3)',
      [message, antwort, 'faq']
    );
  } catch (err) {
    console.warn('⚠️ Fehler beim Speichern des Logs (FAQ):', err.message);
  }
  console.log('✅ FAQ-Treffer:', result[0].item.frage);
  return res.json({ reply: antwort });
}


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
          { role: 'assistant', content: 'Willkommen bei Profiausbau Aachen GmbH! 👷‍♂️ Wie kann ich Ihnen helfen?' },
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

    let botReply = response.data.choices?.[0]?.message?.content;

if (!botReply) return res.status(500).json({ error: 'Antwort war leer.' });

// ✅ Sicherheitsprüfung für GPT-Antwort
if (
  botReply.toLowerCase().includes("geschäftsführer") &&
  !botReply.toLowerCase().includes("leszek damian cieslok")
) {
  botReply = "Der Geschäftsführer der Profiausbau Aachen GmbH ist Leszek Damian Cieslok.";
}

    try {
      await pool.query(
        'INSERT INTO chat_log (frage, antwort, quelle) VALUES ($1, $2, $3)',
        [message, botReply, 'gpt']
      )
    } catch (err) {
      console.warn('⚠️ Fehler beim Speichern des Logs (GPT):', err.message)
    }

    res.json({ reply: botReply })
  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message)
    res.status(500).json({ error: 'Fehler bei OpenAI' })
  }
})

app.get('/api/faq', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM faq')
    res.json(result.rows)
  } catch (err) {
    console.error('❌ Fehler beim Laden der FAQ:', err.message)
    res.status(500).json({ error: 'FAQ konnte nicht geladen werden.' })
  }
})

app.get('/api/faq-candidates', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT frage, COUNT(*) AS anzahl
      FROM chat_log
      WHERE quelle = 'gpt'
      GROUP BY frage
      ORDER BY anzahl DESC
      LIMIT 20
    `)
    res.json(result.rows)
  } catch (err) {
    console.error('❌ Fehler bei /api/faq-candidates:', err.message)
    res.status(500).json({ error: 'Fehler beim Laden der Kandidaten' })
  }
})

app.post('/api/faq-add-single', async (req, res) => {
  const { frage, antwort } = req.body

  console.log('📥 Neue FAQ-Kandidat-Anfrage empfangen:')
  console.log('Frage:', frage)
  console.log('Antwort:', antwort)

  if (!frage || !antwort) {
    console.warn('❌ Ungültige Daten: Frage oder Antwort fehlt')
    return res.status(400).json({ error: 'Frage oder Antwort fehlt' })
  }

  try {
    await pool.query(
      'INSERT INTO faq (frage, antwort) VALUES ($1, $2)',
      [frage, antwort]
    )
    console.log('✅ FAQ erfolgreich gespeichert in DB.')

    try {
      await axios.get(`${UPSTASH_URL}/del/faq`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      })
      console.log('🧹 Redis-Cache gelöscht nach Eintrag.')
    } catch (err) {
      console.warn('⚠️ Fehler beim Cache-Löschen (Redis):', err.message)
    }

    res.json({ success: true })
  } catch (err) {
    console.error('❌ Fehler beim Speichern eines FAQ-Eintrags:', err.message)
    res.status(500).json({ error: 'Fehler beim Speichern' })
  }
})

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
  if (!item.frage || !item.antwort) {
    console.warn('⚠️ Ungültiger FAQ-Eintrag übersprungen:', item)
    continue
  }

  try {
    await client.query(
      'INSERT INTO faq (frage, antwort) VALUES ($1, $2) ON CONFLICT (frage) DO NOTHING',
      [item.frage, item.antwort]
    )
  } catch (err) {
    console.warn('⚠️ Fehler bei Eintrag:', item.frage, err.message)
    // kein throw mehr – damit die Schleife nicht abbricht
  }
}


    await client.query('COMMIT')
    client.release()

    try {
      await axios.get(`${UPSTASH_URL}/del/faq`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      })
    } catch (err) {
      console.warn('⚠️ Fehler beim Cache-Löschen (Redis):', err.message)
    }

    fuse = null
    res.json({ success: true })
  } catch (err) {
    console.error('❌ Fehler beim Speichern:', err.message)
    res.status(500).json({ error: 'FAQ konnten nicht gespeichert werden' })
  }
})

app.delete('/api/cache', async (req, res) => {
  try {
    await axios.get(`${UPSTASH_URL}/del/faq`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    })
    console.log('🧹 Redis-Cache gelöscht')
    return res.json({ success: true, message: 'Cache gelöscht' })
  } catch (err) {
    console.error('❌ Fehler beim Cache-Löschen:', err.message)
    return res.status(500).json({ success: false, error: 'Cache konnte nicht gelöscht werden' })
  }
})

app.get('/api/cache-status', async (req, res) => {
  try {
    const response = await axios.get(`${UPSTASH_URL}/get/faq`, {
      headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
    })

    const cached = response.data?.result
    if (cached) {
      return res.json({
        cached: true,
        count: JSON.parse(cached).length
      })
    }

    return res.json({ cached: false })
  } catch (err) {
    console.warn('❌ Fehler beim Cache-Check:', err.message)
    return res.status(500).json({ error: 'Fehler beim Prüfen des Redis-Caches' })
  }
})

app.listen(3000, () => {
  console.log('✅ Profiausbau-Chatbot läuft auf Port 3000 (mit Redis REST Cache)')
})
