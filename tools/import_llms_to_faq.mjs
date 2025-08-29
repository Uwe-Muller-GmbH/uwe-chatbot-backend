import axios from "axios";
import fs from "fs";

const LLMS_URLS = (process.env.LLMS_SOURCES || "").split(",").filter(Boolean);

function isValidFaq(text) {
  // Nur Texte behalten, die nach Frage+Antwort aussehen
  if (!text) return false;

  // Metadaten und Footer rausfiltern
  if (text.includes("Nutzungsbedingungen")) return false;
  if (text.includes("Gesamtanzahl Links")) return false;
  if (text.includes("Dateiname:")) return false;
  if (text.includes("Version:")) return false;
  if (text.includes("Erstellt am:")) return false;

  // PDF-Links und "Download"-Blöcke überspringen
  if (text.toLowerCase().includes("pdf-download")) return false;

  // Nur behalten, wenn Text mindestens 20 Zeichen hat
  return text.trim().length > 20;
}

async function run() {
  console.log("🔎 Lade LLMS:", LLMS_URLS.join(", "));
  let allFaqs = [];

  for (const url of LLMS_URLS) {
    const res = await axios.get(url);
    const text = res.data;

    // Absätze splitten
    const qas = text
      .split("\n\n")
      .map((chunk, i) => chunk.trim())
      .filter(isValidFaq)
      .map((chunk, i) => ({
        frage: `Info #${i + 1}`,
        antwort: chunk,
      }));

    console.log(`✅ ${qas.length} valide FAQs extrahiert von ${url}`);
    allFaqs.push(...qas);
  }

  console.log(`📄 Gesamt nach Filter: ${allFaqs.length} FAQs`);

  if (allFaqs.length === 0) {
    console.error("❌ Keine verwertbaren FAQs gefunden!");
    process.exit(1);
  }

  fs.writeFileSync("faq.json", JSON.stringify(allFaqs, null, 2), "utf-8");
  console.log("✅ faq.json erfolgreich gespeichert.");
}

run();
