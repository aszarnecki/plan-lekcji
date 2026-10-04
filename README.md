# plan-lekcji

Wygodny plan zjazdów (klasa ELE.02B, CKZiU nr 1 w Gdańsku).

- `index.html` + `data.js` — statyczna strona (moduły, nauczyciele, godziny bloków).
- `scrape.js` — pobiera plan z edupage i cku.home.pl (sale, zastępstwa) oraz harmonogram zjazdów; zapisuje `schedule.js` / `schedule.json`.
- `.github/workflows/update.yml` — co 3 godziny uruchamia scraper, commituje zmiany i publikuje stronę na GitHub Pages.

Lokalnie: `node scrape.js`, potem otwórz `index.html`.
Test dat: `index.html?today=2026-10-03T12:00`.
