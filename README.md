# 🤖 Uwe Müller Chatbot Backend

Dies ist das Chatbot-Backend für die **Uwe Müller GmbH (Baumaschinen Müller)**.  
Es verarbeitet FAQs aus `faq.json`, bietet eine Admin-Seite zur Pflege und einen Chat-Endpoint mit GPT-Fallback.

---

## 🌐 Wichtige URLs

- **Admin-Seite (FAQ bearbeiten):**  
  <a href="https://uwe-chatbot-backend.onrender.com/admin.html" target="_blank">https://uwe-chatbot-backend.onrender.com/admin.html</a>

- **FAQ-API (liefert aktuelle faq.json):**  
  <a href="https://uwe-chatbot-backend.onrender.com/api/faq" target="_blank">https://uwe-chatbot-backend.onrender.com/api/faq</a>

---

## ⚙️ Funktionen

- Verwaltung von FAQ-Daten (`faq.json`)  
- Separater Produktkatalog (`catalog.json`)  
- Chat-Endpoint mit FAQ-Matching (Fuse.js) und GPT-Fallback  
- Admin-Oberfläche mit Login & JSON-Editor  

---

## 📋 FAQ-Beispiele

So sieht die Struktur in `faq.json` aus:

```json
[
  {
    "frage": "Welche Maschinen vermieten Sie?",
    "antwort": "Wir vermieten Minibagger, Radlader und mehr. 📧 info@baumaschinen-mueller.de 📞 +49 2403 997312"
  },
  {
    "frage": "Wo befindet sich die Uwe Müller GmbH?",
    "antwort": "Dürener Straße 589a, 52249 Eschweiler. 📞 +49 2403 997312"
  }
]
