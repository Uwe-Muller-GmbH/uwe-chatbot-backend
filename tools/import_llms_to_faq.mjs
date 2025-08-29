import axios from "axios";
import fs from "fs";

// load from llms.txt
const LLMS_URLS = (process.env.LLMS_SOURCES || "").split(",").filter(Boolean);
const BACKEND_URL = process.env.BACKEND_URL;

async function run() {
  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let allFaqs = [];

  for (const url of LLMS_URLS) {
    const res = await axios.get(url);
    // Hier parse deine QAs raus (wie vorher) – Platzhalter:
    const qas = res.data.split("\n\n").map((chunk, i) => ({
      frage: `Info #${i}`,
      antwort: chunk.trim()
    }));
    allFaqs.push(...qas);
  }

  console.log(`📄 ${allFaqs.length} FAQs extrahiert.`);

  try {
    // Versuch: alles in einem Schwung
    await axios.post(BACKEND_URL, allFaqs, { headers: { "Content-Type": "application/json" } });
    console.log("✅ Alles auf einmal importiert.");
  } catch (err) {
    if (err.response?.status === 413) {
      console.warn("⚠️ Payload zu groß – wechsle auf Batches…");

      // in Blöcke von 50 FAQs aufteilen
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

run();
