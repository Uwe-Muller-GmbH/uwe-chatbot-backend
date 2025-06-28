import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import cors from 'cors';
import fs from 'fs';
import path from 'path';

dotenv.config();
const app = express();

app.use(cors({
  origin: 'https://www.profiausbau.com',
  methods: ['POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;

  // 1️⃣ FAQ-Antwort prüfen
  let faqData = [];
  try {
    const rawFaq = fs.readFileSync(path.resolve('faq.json'), 'utf-8');
    faqData = JSON.parse(rawFaq);
  } catch (err) {
    console.warn('⚠️ FAQ-Datei konnte nicht geladen werden:', err.message);
  }

  const match = faqData.find(f =>
    message.toLowerCase().includes(f.frage.toLowerCase())
  );

  if (match) {
    console.log('✅ Antwort aus FAQ:', match.antwort);
    return res.json({ reply: match.antwort });
  }

  // 2️⃣ Fallback: Anfrage an OpenAI
  try {
    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `Du agierst als digitaler Assistent der Profiausbau Aachen GmbH und antwortest im Namen des Unternehmens wie ein Mitarbeiter.

Sprich in einem professionellen, freundlichen Ton. Deine Antworten sollen informativ, klar und kurzgefasst sein.

Verwende ausschließlich Informationen, die in der bereitgestellten Wissensdatenbank enthalten sind.

Wenn eine Information nicht verfügbar ist, teile dies dem Nutzer höflich mit und empfehle, das Unternehmen direkt zu kontaktieren.

Bevor du eine direkte Kontaktaufnahme empfiehlst, prüfe immer sorgfältig, ob du die Antwort aus dem vorhandenen Wissen ableiten kannst.

Gib keine Informationen, die außerhalb der Wissensbasis liegen. Rate nicht, erfinde nichts.

---

Unternehmen: Profiausbau Aachen GmbH  
Branche: Renovierung und Innenausbau  
Leistungen: Badrenovierung, Trockenbau, Fliesenarbeiten, Komplettlösungen aus einer Hand  
Rolle des Assistenten: Beantwortung von Fragen, Bereitstellung von Informationen, Unterstützung bei Terminbuchungen  
Kontakt:  
📧 E-Mail: info@profiausbau.com  
📞 Telefon: +49 173 592 37 48`
          },
          {
            role: 'assistant',
            content: 'Willkommen bei Profiausbau Aachen GmbH! Wie kann ich Ihnen helfen?'
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

    const botReply = response?.data?.choices?.[0]?.message?.content;
    console.log('🤖 GPT-Antwort:', botReply);

    if (!botReply) {
      return res.status(500).json({
        error: '⚠️ Die OpenAI-Antwort war leer oder unvollständig.',
        details: response.data
      });
    }

    res.json({ reply: botReply });

  } catch (error) {
    console.error('Fehler bei Anfrage an OpenAI:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Fehler bei der Anfrage an OpenAI.',
      details: error.response?.data || error.message
    });
  }
});

app.listen(3000, () => {
  console.log('✅ Profiausbau-Chatbot läuft auf Port 3000');
});
