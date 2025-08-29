import axios from "axios";
import fs from "fs";

// Quellen aus GitHub Actions ENV
const LLMS_URLS = (process.env.LLMS_SOURCES || "")
  .split(",")
  .filter(Boolean);
const BACKEND_URL = process.env.BACKEND_URL || ""; // leer → wir speichern in faq.json
const LOCAL_FILE = "./faq.json";

async function run() {
  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let allFaqs = [];

  for (const url of LLMS_URLS) {
    const res = await axios.get(url);
    const chunks = res.data
      .split("\n\n")
      .map(c => c.trim())
      .filter(Boolean);

    const qas = chunks.map((chunk, i) => {
      let lines = chunk.split("\n").map(l => l.trim()).filter(Boolean);
      let frage = lines[0] || `Info #${i}`;
      let antwort = lines.slice(1).join(" ").trim();

      // Nummerierung am Anfang entfernen (z.B. "1500. ")
      frage = frage.replace(/^\d+\.\s*/, "");

      // Fallback, falls kein Antworttext da
      if (!antwort) {
        antwort = chunk;
      }

      return { frage, antwort };
    });

    console.log(`✅ ${qas.length} FAQs extrahiert von ${url}`);
    allFaqs.push(...qas);
  }

  console.log(`📄 Gesamt: ${allFaqs.length} FAQs`);

  if (!BACKEND_URL) {
    // lokal in faq.json speichern
    fs.writeFileSync(LOCAL_FILE, JSON.stringify(allFaqs, null, 2), "utf-8");
    console.log(`💾 faq.json aktualisiert (${allFaqs.length} FAQs).`);
    return;
  }

  try {
    // Alles auf einmal importieren
    await axios.post(BACKEND_URL, allFaqs, {
      headers: { "Content-Type": "application/json" }
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
            headers: { "Content-Type": "application/json" }
          });
          console.log(
            `✅ Batch ${i / batchSize + 1} importiert (${batch.length} FAQs).`
          );
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
