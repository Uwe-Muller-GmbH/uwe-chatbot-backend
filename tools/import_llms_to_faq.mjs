import axios from "axios";

// ==== Konfiguration ====
// Quelle(n) für LLMS-Dateien (Komma-separiert in GitHub Action setzen)
const LLMS_URLS = (process.env.LLMS_SOURCES || "https://www.baumaschinen-mueller.de/llms.txt")
  .split(",")
  .filter(Boolean);

const BACKEND_URL = process.env.BACKEND_URL || "https://uwe-chatbot-backend.onrender.com/api/faq";

// =======================

// Funktion: LLMS-Datei parsen → [{frage, antwort}]
function parseLlmsText(data) {
  const lines = data.split("\n");
  const faqs = [];
  let currentFrage = null;
  let currentAntwort = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Neue Frage beginnt bei "##"
    if (trimmed.startsWith("##")) {
      if (currentFrage && currentAntwort.length) {
        faqs.push({
          frage: currentFrage,
          antwort: currentAntwort.join(" ").trim(),
        });
      }
      currentFrage = trimmed.replace(/^##+\s*/, ""); // "## " entfernen
      currentAntwort = [];
    } else if (trimmed) {
      currentAntwort.push(trimmed);
    }
  }

  // letzte Frage sichern
  if (currentFrage && currentAntwort.length) {
    faqs.push({
      frage: currentFrage,
      antwort: currentAntwort.join(" ").trim(),
    });
  }

  return faqs;
}

async function run() {
  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let allFaqs = [];

  for (const url of LLMS_URLS) {
    try {
      const res = await axios.get(url);
      const qas = parseLlmsText(res.data);
      console.log(`✅ ${qas.length} FAQs extrahiert von ${url}`);
      allFaqs.push(...qas);
    } catch (err) {
      console.error(`❌ Fehler beim Laden von ${url}:`, err.message);
    }
  }

  console.log(`📄 Gesamt: ${allFaqs.length} FAQs`);

  // ========== Upload ==========
  try {
    await axios.post(BACKEND_URL, allFaqs, { headers: { "Content-Type": "application/json" } });
    console.log("✅ Alles auf einmal importiert.");
  } catch (err) {
    if (err.response?.status === 413) {
      console.warn("⚠️ Payload zu groß – wechsle auf Batches…");

      const batchSize = 50;
      for (let i = 0; i < allFaqs.length; i += batchSize) {
        const batch = allFaqs.slice(i, i + batchSize);
        try {
          await axios.post(BACKEND_URL, batch, { headers: { "Content-Type": "application/json" } });
          console.log(`✅ Batch ${i / batchSize + 1} importiert (${batch.length} FAQs).`);
        } catch (e) {
          console.error("❌ Batch-Import fehlgeschlagen:", e.message);
        }
      }
    } else {
      console.error("❌ Fehler beim FAQ-Import:", err.message);
    }
  }
}

run().catch((err) => {
  console.error("❌ Script-Fehler:", err);
  process.exit(1);
});
