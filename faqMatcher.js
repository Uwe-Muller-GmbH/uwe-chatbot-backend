const Fuse = require('fuse.js')

// Beispiel-FAQ-Einträge für die Uwe Müller GmbH
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
  {
    question: "Kann man bei Ihnen Baumaschinen mieten?",
    answer: "Ja, wir vermieten verschiedene Baumaschinen. Bitte kontaktieren Sie uns für ein individuelles Angebot.",
  },
  {
    question: "Welche Marken von Nutzfahrzeugen führen Sie?",
    answer: "Wir sind Deutschlands größter Händler für FUSO Nutzfahrzeuge.",
  },
  {
    question: "Bieten Sie auch Ersatzteile und Service an?",
    answer: "Ja, wir bieten Ersatzteile und Werkstattservice für Baumaschinen und Nutzfahrzeuge an.",
  },
  {
    question: "Wie kann ich ein Angebot anfordern?",
    answer: "Sie können uns telefonisch, per E-Mail oder über das Kontaktformular auf unserer Website erreichen, um ein Angebot zu erhalten.",
  },
  {
    question: "Haben Sie auch gebrauchte Maschinen im Angebot?",
    answer: "Ja, neben Neumaschinen bieten wir auch gebrauchte Baumaschinen und Nutzfahrzeuge an.",
  }
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
