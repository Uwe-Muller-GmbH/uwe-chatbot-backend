import { Pool } from 'pg';
import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();
const app = express();
app.use(express.static('public'));
app.use(cors({
  origin: 'https://www.profiausbau.com',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// 📦 PostgreSQL-Verbindung mit Pool (Supabase)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Supabase verlangt SSL
});

// 📬 Chat-API
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  let faqData = [];
  try {
    const result = await pool.query('SELECT frage, antwort FROM faq');
    faqData = result.rows;
  } catch (err) {
    console.warn('⚠️ Fehler beim Laden der FAQ aus DB:', err.message);
  }

  const match = faqData.find(f =>
    message.toLowerCase().includes(f.frage.toLowerCase())
  );

  if (match) {
    console.log('✅ Antwort aus FAQ:', match.antwort);
    return res.json({ reply: match.antwort });
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
            content: `Du agierst als digitaler Assistent der Profiausbau Aachen GmbH …`
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
          'Content-Type': 'application/json'
        }
      }
    );

    const botReply = response.data.choices?.[0]?.message?.content;
    if (!botReply) return res.status(500).json({ error: 'Antwort war leer.' });

    res.json({ reply: botReply });

  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message);
    res.status(500).json({ error: 'Fehler bei OpenAI' });
  }
});

// 📤 FAQ abrufen (GET)
app.get('/api/faq', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM faq');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'FAQ konnte nicht aus DB geladen werden.' });
  }
});

// 💾 FAQ speichern (POST)
app.post('/api/faq', async (req, res) => {
  const faqs = req.body;
  if (!Array.isArray(faqs)) {
    return res.status(400).json({ error: 'Datenformat ungültig' });
  }

  try {
    const client = await pool.connect();
    await client.query('BEGIN');
    await client.query('DELETE FROM faq');

    for (const item of faqs) {
      await client.query(
        'INSERT INTO faq (frage, antwort) VALUES ($1, $2)',
        [item.frage, item.antwort]
      );
    }

    await client.query('COMMIT');
    client.release();

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Fehler beim Speichern:', err.message);
    res.status(500).json({ error: 'FAQ konnten nicht gespeichert werden' });
  }
});

// 🔊 Server starten
app.listen(3000, () => {
  console.log('✅ Profiausbau-Chatbot läuft auf Port 3000');
});

