import axios from "axios";
import fs from "fs";

const LLMS_URLS = (process.env.LLMS_SOURCES || "").split(",").filter(Boolean);

async function run() {
  if (LLMS_URLS.length === 0) {
    console.error("❌ Keine LLMS-Quellen definiert (env LLMS_SOURCES).");
    process.exit(1);
  }

  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let allFaqs = [];

  for (const url of LLMS_URLS) {
    try {
      const res = await axios.get(url);
      const text = res.data;

      // Beispiel-Parser: alles in Absätze aufteilen
      const qas = text
        .split("\n\n")
        .map((chunk, i) => ({
          frage: `Info #${i + 1}`,
          antwort: chunk.trim(),
        }))
        .filter((qa) => qa.antwort.length > 0);

      console.log(`✅ ${qas.length} FAQs extrahiert von ${url}`);
      allFaqs.push(...qas);
    } catch (err) {
      console.error(`❌ Fehler beim Laden von ${url}:`, err.message);
    }
  }

  console.log(`📄 Gesamt: ${allFaqs.length} FAQs`);

  if (allFaqs.length === 0) {
    console.error("❌ Keine FAQs gefunden – Abbruch.");
    process.exit(1);
  }

  try {
    fs.writeFileSync("faq.json", JSON.stringify(allFaqs, null, 2), "utf-8");
    console.log("✅ faq.json wurde erfolgreich aktualisiert.");
  } catch (err) {
    console.error("❌ Fehler beim Schreiben der faq.json:", err.message);
    process.exit(1);
  }
}

run();
