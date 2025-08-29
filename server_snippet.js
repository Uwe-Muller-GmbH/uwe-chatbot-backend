import fs from "fs";
import path from "path";

app.get("/api/faq", (req, res) => {
  try {
    const filePath = path.resolve("faq.json");
    const data = fs.readFileSync(filePath, "utf-8");
    res.json(JSON.parse(data));
  } catch (err) {
    console.error("❌ Fehler beim Lesen von faq.json:", err.message);
    res.status(500).json({ error: "FAQ konnte nicht geladen werden" });
  }
});
