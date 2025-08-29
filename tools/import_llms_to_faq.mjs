import axios from "axios";

const LLMS_URLS = (process.env.LLMS_SOURCES || "").split(",").filter(Boolean);
const BACKEND_URL = process.env.BACKEND_URL;

async function run() {
  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let allFaqs = [];

  for (const url of LLMS_URLS) {
    const res = await axios.get(url);
    const chunks = res.data.split("\n\n").map(c => c.trim()).filter(Boolean);

    const qas = chunks.map((chunk, i) => {
      // Titel herausziehen (falls im Block enthalten)
      let titleMatch = chunk.match(/^###\s*\d+\.\s*(.+)$/m); // z. B. "### 5. Wacker Neuson EZ 26"
      let frage = titleMatch
        ? `Informationen zu ${titleMatch[1].trim()}`
        : `Abschnitt #${i + 1}`;

      // Restlicher Text als Antwort
      let antwort = chunk
        .replace(/^###.*$/m, "") // Überschrift raus
        .trim();

      return { frage, antwort };
    });

    console.log(`✅ ${qas.length} FAQs extrahiert von ${url}`);
    allFaqs.push(...qas);
  }

  console.log(`📄 Gesamt: ${allFaqs.length} FAQs`);

  try {
    await axios.post(BACKEND_URL, allFaqs, {
      headers: { "Content-Type": "application/json" },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    console.log("✅ Alles auf einmal importiert.");
  } catch (err) {
    if (err.response?.status === 413) {
      console.warn("⚠️ Payload zu groß – wechsle auf Batches…");

      const batchSize = 50;
      for (let i = 0; i < allFaqs.length; i += batchSize) {
        const batch = allFaqs.slice(i, i + batchSize);
        try {
          await axios.post(BACKEND_URL, batch, {
            headers: { "Content-Type": "application/json" },
          });
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

run();
