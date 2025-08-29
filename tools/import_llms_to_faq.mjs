import axios from "axios";

const LLMS_URL = "https://www.baumaschinen-mueller.de/llms.txt";
const BACKEND_URL = "https://uwe-chatbot-backend.onrender.com/api/faq";

async function fetchLLMS() {
  const res = await axios.get(LLMS_URL);
  return res.data.split("\n");
}

function parseLLMS(lines) {
  const faqs = [];
  let current = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // 1) Neue Frage mit Link
    const match = line.match(/^\d+\.\s+\[(.+?)\]\((https?:\/\/[^\)]+)\)/);
    if (match) {
      if (current) faqs.push(current); // vorherige speichern
      current = { frage: match[1], antwort: "Mehr Infos: " + match[2] };
      continue;
    }

    // 2) Beschreibung/Antwort ergänzen
    if (current && !line.startsWith("##")) {
      current.antwort += " " + line;
    }
  }

  if (current) faqs.push(current);
  return faqs;
}

async function pushFAQ(faqs) {
  try {
    const res = await axios.post(BACKEND_URL, faqs, {
      headers: { "Content-Type": "application/json" }
    });
    console.log("✅ FAQ erfolgreich importiert:", res.data);
  } catch (err) {
    console.error("❌ Fehler beim FAQ-Import:", err.response?.data || err.message);
  }
}

(async () => {
  try {
    console.log("🔎 Lade LLMS:", LLMS_URL);
    const lines = await fetchLLMS();
    const faqs = parseLLMS(lines);
    console.log(`📄 ${faqs.length} FAQs extrahiert.`);
    await pushFAQ(faqs);
  } catch (err) {
    console.error("❌ Fehler:", err.message);
  }
})();
