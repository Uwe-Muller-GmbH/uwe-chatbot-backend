import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import Fuse from 'fuse.js';
import axios from 'axios';
import 'dotenv/config';

const app = express();
app.use(express.json());
app.use(express.static('public')); // Admin & Frontend

// CORS (Frontend erlauben)
const FRONTEND_ORIGINS = process.env.FRONTEND_ORIGINS
  ? process.env.FRONTEND_ORIGINS.split(',').map(s => s.trim())
  : ['https://www.baumaschinen-mueller.de'];

app.use(cors({
  origin: FRONTEND_ORIGINS,
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Redis (Upstash)
const UPSTASH_URL = process.env.UPSTASH_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REST_TOKEN;
const UPSTASH_KEY = process.env.UPSTASH_FAQ_KEY || 'faq_uwe_mueller';

// Lokales Fallback
const LOCAL_FAQ_FILE = './faq.json';

let fuse = null;

// === FAQ Laden ===
async function loadFaqData() {
  // 1. Redis
  try {
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      const response = await axios.get(`${UPSTASH_URL}/get/${UPSTASH_KEY}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      const cached = response.data?.result;
      if (cached) {
        // 👇 Wichtig: doppelt parsen, falls String gespeichert
        const parsed = JSON.parse(cached);
        return Array.isArray(parsed) ? parsed : JSON.parse(parsed);
      }
    }
  } catch (err) {
    console.warn('⚠️ Redis read failed:', err.message);
  }

  // 2. Fallback lokal
  try {
    if (fs.existsSync(LOCAL_FAQ_FILE)) {
      const content = fs.readFileSync(path.resolve(LOCAL_FAQ_FILE), 'utf8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('❌ Fehler beim Lesen faq.json:', err.message);
  }

  return [];
}

// === FAQ Speichern ===
async function saveFaqData(faqs) {
  // 1. Redis
  try {
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      await axios.post(`${UPSTASH_URL}/set/${UPSTASH_KEY}`, {
        value: JSON.stringify(faqs),
        expiration: 86400 // 24h
      }, {
        headers: {
          Authorization: `Bearer ${UPSTASH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      });
      return true;
    }
  } catch (err) {
    console.error('❌ Fehler beim Speichern Redis:', err.message);
  }

  // 2. Lokal
  try {
    fs.writeFileSync(LOCAL_FAQ_FILE, JSON.stringify(faqs, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('❌ Fehler beim Schreiben faq.json:', err.message);
  }

  return false;
}

// === Chat-Endpoint ===
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (message === 'ping') return res.json({ reply: 'pong' });

  const faqData = await loadFaqData();
  if (faqData.length) {
    if (!fuse || !fuse._docs || fuse._docs.length !== faqData.length) {
      fuse = new Fuse(faqData, {
        keys: ['frage'],
        threshold: 0.5,
        distance: 100,
        minMatchCharLength: 2
      });
    }

    const result = fuse.search(message);
    if (result.length) {
      return res.json({ reply: result[0].item.antwort });
    }
  }

  // GPT-Fallback
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Du bist der digitale Assistent der Uwe Müller GmbH (Baumaschinen Müller).
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
          'Content-Type': 'application/json'
        }
      }
    );

    const reply = response.data.choices?.[0]?.message?.content;
    res.json({ reply: reply || "Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de" });
  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message);
    res.json({ reply: "Bitte kontaktieren Sie uns direkt 📧 info@baumaschinen-mueller.de" });
  }
});

// === FAQ laden ===
app.get('/api/faq', async (req, res) => {
  try {
    const data = await loadFaqData();
    res.json(data);
  } catch (err) {
    console.error('❌ Fehler beim Laden FAQ:', err.message);
    res.status(500).json({ error: 'FAQ konnte nicht geladen werden.' });
  }
});

// === FAQ speichern ===
app.post('/api/faq', async (req, res) => {
  const faqs = req.body;
  if (!Array.isArray(faqs)) {
    return res.status(400).json({ error: 'Datenformat ungültig' });
  }

  const success = await saveFaqData(faqs);
  fuse = null;
  res.json({ success });
});

// === Cache löschen ===
app.delete('/api/cache', async (req, res) => {
  try {
    if (UPSTASH_URL && UPSTASH_TOKEN) {
      await axios.get(`${UPSTASH_URL}/del/${UPSTASH_KEY}`, {
        headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` }
      });
      console.log('🧹 Redis Cache gelöscht');
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Fehler beim Cache löschen:', err.message);
    res.status(500).json({ success: false, error: 'Cache konnte nicht gelöscht werden' });
  }
});

// === Start Server ===
app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Uwe Müller Chatbot läuft auf Port 3000 (FAQ + GPT Fallback)');
});
