import axios from "axios";
import fs from "fs";

const LLMS_URLS = (process.env.LLMS_SOURCES || "").split(",").filter(Boolean);
const OUTPUT_FILE = "faq.json";

async function run() {
  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let allFaqs = [];

  for (const url of LLMS_URLS) {
    console.log(`➡️  Hole Daten von ${url}`);
    const res = await axios.get(url, { responseType: "text" });

    // Aufsplitten in Abschnitte anhand von "###" oder Leerzeilen
    const chunks = res.data
      .split(/\n(?=### |\d+\.\s|\#\# )/g)
      .map((c) => c.trim())
      .filter(Boolean);

    let counter = 1;
    for (const chunk of chunks) {
      // Titel aus erster Zeile ziehen
      const lines = chunk.split("\n").map((l) => l.trim());
      const frage = lines[0].replace(/^#+\s*/, "") || `Info #${counter}`;
      const antwort = lines.slice(1).join("\n").trim();

      allFaqs.push({
        frage,
        antwort: antwort || lines[0], // falls kein extra Text
      });
      counter++;
    }

    console.log(`✅ ${allFaqs.length} FAQs bisher.`);
  }

  console.log(`📄 Gesamtanzahl FAQs: ${allFaqs.length}`);

  // JSON-Datei überschreiben
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(allFaqs, null, 2), "utf-8");
  console.log(`💾 Gespeichert in ${OUTPUT_FILE}`);
}

run().catch((err) => {
  console.error("❌ Fehler beim Import:", err.message);
  process.exit(1);
});
