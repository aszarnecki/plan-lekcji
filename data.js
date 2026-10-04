// Dane planu — docelowo generowane scraperem (cku.home.pl + edupage).
// Struktura jest celowo płaska i prosta do wygenerowania z HTML.

window.BLOCKS = [
  { n: 1, start: "08:00", end: "09:30" },
  { n: 2, start: "09:40", end: "11:10" },
  { n: 3, start: "11:40", end: "13:10" },
  { n: 4, start: "13:20", end: "14:50" },
  { n: 5, start: "15:00", end: "16:30" },
  { n: 6, start: "16:40", end: "18:10" },
];

window.TEACHERS = {
  "Mi. Po.": "#c9b800",
  "Ol. Bo.": "#2f9e2f",
  "Ro. Cw.": "#4fc3d9",
  "Ja. Mi.": "#b5c94a",
  "Le. Dę.": "#e0399b",
  "K. St.":  "#f08a00",
  "An. Ry.": "#e0553a",
};

window.MODULES = {
  "W2.01": { teacher: "Mi. Po.", hours: 20, name: "Język obcy zawodowy angielski" },
  "K1.01": { teacher: "Ol. Bo.", hours: 52, name: "Dobór elementów instalacji elektrycznej" },
  "K1.02": { teacher: "Ro. Cw.", hours: 42, name: "Wykonywanie montażu i uruchamianie instalacji elektrycznych" },
  "K1.03": { teacher: "Ol. Bo.", hours: 42, name: "Naprawianie instalacji elektrycznych" },
  "K1.04": { teacher: "Ja. Mi.", hours: 20, name: "Wykonywanie konserwacji instalacji elektrycznych" },
  "K2.01": { teacher: "Ja. Mi.", hours: 70, name: "Budowa i funkcje maszyn i urządzeń elektrycznych" },
  "K2.02": { teacher: "Ol. Bo.", hours: 70, name: "Wykonywanie montażu i uruchamianie maszyn elektrycznych" },
  "K2.03": { teacher: "Ro. Cw.", hours: 54, name: "Wykonywanie montażu i uruchamianie urządzeń elektrycznych" },
  "P1.01": { teacher: "Le. Dę.", hours: 32, name: "Obwody prądu stałego i zmiennego" },
  "P1.02": { teacher: "Ro. Cw.", hours: 18, name: "Elementy i układy elektroniczne" },
  "P1.03": { teacher: "K. St.",  hours: 18, name: "Pomiary w układach elektrycznych i elektronicznych" },
  "P1.04": { teacher: "Le. Dę.", hours: 10, name: "Podstawy techniki" },
  "W1.01": { teacher: "An. Ry.", hours: 20, name: "Bezpieczeństwo i higiena pracy" },
};

// Zjazdy (window.WEEKENDS) są w schedule.js — generuje je scrape.js.
