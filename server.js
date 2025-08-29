import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import Fuse from 'fuse.js'

const app = express()
app.use(express.json())

// FAQ-Datei (immer lokal)
const FAQ_FILE = './faq.json'
let fuse = null

// Hilfsfunktion: FAQs laden
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

// === API Endpunkte ===

// Chat mit FAQ-Suche
app.post('/api/chat', (req, res) => {
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

  // Keine Treffer → Standardantwort
  res.json({ reply: "Ich konnte dazu leider nichts finden. Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de 📞 +49 2403 997312" })
})

// FAQs ausliefern
app.get('/api/faq', (req, res) => {
  const data = loadFaqData()
  res.json(data)
})

// Server starten
app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Chatbot läuft mit lokaler faq.json auf Port 3000')
})
