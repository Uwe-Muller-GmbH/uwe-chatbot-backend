import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import Fuse from 'fuse.js'
import axios from 'axios'
import { fileURLToPath } from 'url'

const app = express()
app.use(express.json())

// ---- CORS: nur erlaubte Origins (füge hier Domains hinzu, falls nötig)
const allowedOrigins = [
  'https://www.baumaschinen-mueller.de',
  // 'https://www.profiausbau.com',
]
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // z.B. curl/Postman
    cb(null, allowedOrigins.includes(origin))
  }
}))

// __dirname für ES-Modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---- Datenverzeichnis (persistente Render Disk)
const DATA_DIR = process.env.DATA_DIR || path.resolve('./data')
fs.mkdirSync(DATA_DIR, { recursive: true })

// Ziel-Dateien (persistente Pfade)
const FAQ_FILE = path.join(DATA_DIR, 'faq.json')
const CATALOG_FILE = path.join(DATA_DIR, 'catalog.json')

// Quell-Dateien (alte Repo-Pfade) – für Migration beim ersten Start
const REPO_FAQ = path.resolve('./faq.json')
const REPO_CATALOG = path.resolve('./catalog.json')

// Atomic Write Helper
function writeJsonAtomic(filePath, dataObj) {
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(dataObj, null, 2), 'utf8')
  fs.renameSync(tmp, filePath)
}

// Erststart-Migration: Nur wenn im DATA_DIR noch nichts liegt
try {
  if (!fs.existsSync(FAQ_FILE) && fs.existsSync(REPO_FAQ)) {
    fs.copyFileSync(REPO_FAQ, FAQ_FILE)
    console.log('⬇️ FAQ migriert →', FAQ_FILE)
  }
  if (!fs.existsSync(CATALOG_FILE) && fs.existsSync(REPO_CATALOG)) {
    fs.copyFileSync(REPO_CATALOG, CATALOG_FILE)
    console.log('⬇️ Catalog migriert →', CATALOG_FILE)
  }
} catch (e) {
  console.warn('⚠️ Migration übersprungen:', e.message)
}

let fuse = null

function loadFaqData() {
  try {
    if (fs.existsSync(FAQ_FILE)) {
      const content = fs.readFileSync(FAQ_FILE, 'utf8')
      return JSON.parse(content)
    }
  } catch (err) {
    console.error('❌ Fehler beim Lesen von FAQ:', err.message)
  }
  return []
}

function loadCatalogData() {
  try {
    if (fs.existsSync(CATALOG_FILE)) {
      const content = fs.readFileSync(CATALOG_FILE, 'utf8')
      return JSON.parse(content)
    }
  } catch (err) {
    console.error('❌ Fehler beim Lesen von Catalog:', err.message)
  }
  return []
}

// === Health Check ===
function healthPayload() {
  const faqData = loadFaqData()
  const catalogData = loadCatalogData()
  return {
    status: (faqData.length || catalogData.length) ? 'ok' : 'warning',
    faqCount: faqData.length,
    catalogCount: catalogData.length,
    timestamp: new Date().toISOString()
  }
}
app.get(['/api/health', '/health'], (req, res) => res.json(healthPayload()))
app.head(['/api/health', '/health'], (req, res) => res.status(200).end())

// === Chat Endpoint ===
const greetings = ["hi","hallo","hey","guten tag","moin","servus","danke","vielen dank"]
const machineKeywords = ["bagger","minibagger","radlader","maschine","maschinen","lader","komatsu","caterpillar","volvo","jcb","kubota","motor"]

app.post('/api/chat', async (req, res) => {
  const { message } = req.body || {}
  const normalized = (message || '').toLowerCase().trim()

  if (normalized === 'ping') return res.json({ reply: 'pong' })

  if (greetings.some(g => normalized === g)) {
    return res.json({ reply: "👋 Hallo! Wie kann ich Ihnen helfen?" })
  }

  const faqData = loadFaqData()
  if (faqData.length) {
    if (!fuse || fuse._docs.length !== faqData.length) {
      fuse = new Fuse(faqData, { keys: ['frage'], threshold: 0.3, distance: 80, minMatchCharLength: 2 })
    }
    const result = fuse.search(message || '')
    if (result.length) {
      return res.json({ reply: result[0].item.antwort })
    }
  }

  if (machineKeywords.some(k => normalized.includes(k))) {
    return res.json({
      reply: "🚜 Wir haben viele Maschinen im Angebot. Bitte melden Sie sich direkt:\n📧 info@baumaschinen-mueller.de\n📞 +49 2403 997312"
    })
  }

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
Wenn es um Maschinen geht, verweise IMMER auf den direkten Kontakt:
📧 info@baumaschinen-mueller.de
📞 +49 2403 997312
Wenn du keine Infos hast, ebenfalls Kontakt angeben.`
          },
          { role: 'user', content: message || '' }
        ],
        temperature: 0.6,
        max_tokens: 500
      },
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' } }
    )

    const reply = response.data.choices?.[0]?.message?.content
    res.json({ reply: reply || "Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de 📞 +49 2403 997312" })
  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message)
    res.json({ reply: "Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de 📞 +49 2403 997312" })
  }
})

// === FAQ API ===
app.get('/api/faq', (req, res) => res.json(loadFaqData()))

app.post('/api/faq', (req, res) => {
  try {
    writeJsonAtomic(FAQ_FILE, req.body || [])
    fuse = null
    res.json({ success: true })
  } catch (err) {
    console.error('❌ Fehler beim Speichern von FAQ:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/faq-add-single', (req, res) => {
  try {
    const { frage, antwort } = req.body || {}
    if (!frage || !antwort) return res.status(400).json({ success: false, error: 'Frage oder Antwort fehlt' })
    const data = loadFaqData()
    data.push({ frage, antwort })
    writeJsonAtomic(FAQ_FILE, data)
    fuse = null
    res.json({ success: true })
  } catch (err) {
    console.error('❌ Fehler beim Hinzufügen:', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

// Cache leeren
app.delete('/api/cache', (req, res) => { fuse = null; res.json({ success: true }) })

// === Catalog API ===
app.get('/api/catalog', (req, res) => res.json(loadCatalogData()))

// Katalog-Datei direkt
app.get('/catalog.json', (req, res) => res.sendFile(CATALOG_FILE))

// Katalog-Download mit Datum
app.get('/download/catalog', (req, res) => {
  const date = new Date().toISOString().split('T')[0]
  res.download(CATALOG_FILE, `catalog-${date}.json`)
})

// === Admin-Frontend (bleibt)
app.use(express.static(path.join(__dirname, 'public')))
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'))
})

// 404 für alles andere (API-only)
app.use((req, res) => res.status(404).json({ error: 'Not found' }))

app.listen(process.env.PORT || 3000, () => {
  console.log('✅ API läuft auf Port', process.env.PORT || 3000)
})
