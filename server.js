import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import mysql from 'mysql2/promise';

dotenv.config();
const app = express();
app.use(express.static('public'));

app.use(cors({
  origin: 'https://www.profiausbau.com',
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// 📦 MySQL Verbindung aufbauen
const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
};

// 📍 Testverbindung (einmal beim Start)
mysql.createConnection(dbConfig)
  .then(() => console.log('✅ MySQL-Datenbank verbunden'))
  .catch(err => console.error('❌ MySQL-Verbindung fehlgeschlagen:', err.message));

// 📬 Chat-API
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  // 1️⃣ FAQ aus Datenbank prüfen
  let faqData = [];
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT frage, antwort FROM faq');
    await connection.end();

    faqData = rows;
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

  // 2️⃣ Fallback: OpenAI
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
          'Content-Type': 'application/json'
        }
      }
    );

    const botReply = response.data.choices?.[0]?.message?.content;
    if (!botReply) return res.status(500).json({ error: 'Antwort war leer.' });

    res.json({ reply: botReply });
  } catch (err) {
    console.error('❌ Fehler bei OpenAI:', err.response?.data || err.message);
    res.status(500).json({ error: 'Fehler bei der Kommunikation mit OpenAI.' });
  }
});

// 📤 FAQ abrufen (GET)
app.get('/api/faq', async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute('SELECT * FROM faq');
    await connection.end();

    res.json(rows);
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
    const connection = await mysql.createConnection(dbConfig);
    await connection.execute('DELETE FROM faq');
    for (const item of faqs) {
      await connection.execute(
        'INSERT INTO faq (frage, antwort) VALUES (?, ?)',
        [item.frage, item.antwort]
      );
    }
    await connection.end();
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Fehler beim Speichern der FAQ:', err.message);
    res.status(500).json({ error: 'FAQ konnten nicht gespeichert werden' });
  }
});

// 🔊 Server starten
app.listen(3000, () => {
  console.log('✅ Profiausbau-Chatbot läuft auf Port 3000');
});
