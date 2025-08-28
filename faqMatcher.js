const Fuse = require('fuse.js')

// TODO: Diese Daten kommen später aus Redis oder via Scraper.
// Aktuell sind es Beispiel-FAQ-Einträge für die Uwe Müller GmbH.
const faqItems = [
  {
    question: "Wo befindet sich die Uwe Müller GmbH?",
    answer: "Sie finden uns in der Dürener Straße 589a, 52249 Eschweiler.",
  },
  {
    question: "Wie sind Ihre Öffnungszeiten?",
    answer: "Wir sind Montag bis Freitag von 7:30 bis 17:00 Uhr für Sie da. Samstags nach Vereinbarung.",
  },
  {
    question: "Welche Leistungen bieten Sie an?",
    answer: "Wir sind Händler und Vermieter von Baumaschinen und Deutschlands größter Händler von FUSO Nutzfahrzeugen.",
  },
  {
    question: "Wie erreiche ich den Kundenservice?",
    answer: "Sie erreichen uns per E-Mail unter info@baumaschinen-mueller.de oder telefonisch unter +49 2403 997312.",
  },
  {
    question: "Wer ist der Geschäftsführer?",
    answer: "Uwe Müller ist Geschäftsführer für Baumaschinen und Nutzfahrzeuge. Zusätzlich ist Dr. Philip Müller Geschäftsführer für Baumaschinen.",
  },
]

const fuse = new Fuse(faqItems, {
  keys: ['question'],
  threshold: 0.3, // niedriger Wert = strengere Übereinstimmung
})

function findBestAnswer(userQuestion) {
  const result = fuse.search(userQuestion)
  return result.length && result[0].score < 0.4 ? result[0].item.answer : null
}

module.exports = { findBestAnswer }
