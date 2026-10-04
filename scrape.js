#!/usr/bin/env node
// Scraper planu zjazdów: edupage (plan bazowy całego semestru) + cku.home.pl (aktualne tabelki
// weekendowe z salami i zastępstwami). Wynik: schedule.js (dla strony) i schedule.json.
// Użycie:  node scrape.js            (Node 18+, bez zależności)

const fs = require("fs");
const path = require("path");

const CONFIG = {
  classId: process.env.CLASS_ID || "*10",        // klasa w edupage (class=*10)
  className: process.env.CLASS_NAME || "ELE.02B", // ta sama klasa w nagłówku tabelki cku
  eduHost: "https://ckziu1gda.edupage.org",
  eduTimetable: "65",
  ckuBase: "https://cku.home.pl/plan_kkz/",
  harmonogram: "Harmonogram_KKZ_26_27_semestr_I.htm", // tabela: które weekendy są zjazdami dla danej klasy
};
const pad = n => String(n).padStart(2, "0");
const log = (...a) => console.log(...a);

// fetch z limitem czasu i ponawianiem — serwery szkolne (i sieć GitHub Actions) bywają kapryśne.
async function http(url, opts = {}, tries = 4) {
  let last;
  for (let i = 1; i <= tries; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; plan-lekcji-bot; +https://github.com/aszarnecki/plan-lekcji)", ...(opts.headers || {}) },
        signal: AbortSignal.timeout(30000),
      });
      if (res.status >= 500 && i < tries) throw new Error("HTTP " + res.status);
      return res;
    } catch (e) {
      last = e;
      const why = e.cause?.code || e.cause?.message || e.message;
      log(`  … próba ${i}/${tries} nieudana (${url.split("/").slice(2, 4).join("/")}): ${why}`);
      if (i < tries) await new Promise(r => setTimeout(r, i * 3000));
    }
  }
  throw last;
}

/* ---------------- edupage ---------------- */
async function fetchEdupage() {
  const res = await http(`${CONFIG.eduHost}/timetable/server/regulartt.js?__func=regularttGetData`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ __args: [null, CONFIG.eduTimetable], __gsh: "00000000" }),
  });
  if (!res.ok) throw new Error("edupage HTTP " + res.status);
  const j = await res.json();
  const T = {};
  j.r.dbiAccessorRes.tables.forEach(t => (T[t.id] = t.data_rows));
  return T;
}

// "5-6.09.26 T36"  |  "31.10-1.11.26 T44"
function parseWeekName(name) {
  let m = /^(\d+)-(\d+)\.(\d+)\.(\d+)\s*T(\d+)/.exec(name);
  if (m) return { dates: [[m[4], m[3], m[1]], [m[4], m[3], m[2]]], week: +m[5] };
  m = /^(\d+)\.(\d+)-(\d+)\.(\d+)\.(\d+)\s*T(\d+)/.exec(name);
  if (m) return { dates: [[m[5], m[2], m[1]], [m[5], m[4], m[3]]], week: +m[6] };
  return null;
}
const isoFrom = ([y, m, d]) => `${2000 + +y}-${pad(m)}-${pad(d)}`;

function buildFromEdupage(T) {
  const lessons = new Map(T.lessons.filter(l => (l.classids || []).includes(CONFIG.classId)).map(l => [l.id, l]));
  const subj = Object.fromEntries(T.subjects.map(s => [s.id, s.short]));
  const weeks = T.weeks.map(w => ({ id: +w.id, ...parseWeekName(w.name), name: w.name })).filter(w => {
    if (!w.dates) log("  ! pomijam tydzień o nieznanej nazwie:", w.name);
    return w.dates;
  });
  const out = weeks.map(w => {
    const dates = w.dates.map(isoFrom);
    return { week: w.week, dates, days: Object.fromEntries(dates.map(d => [d, []])), rooms: {}, notes: {}, source: "edupage", _id: w.id };
  });
  const dayIds = T.days.map(d => d.id); // "0" sobota, "1" niedziela
  for (const c of T.cards) {
    const l = lessons.get(c.lessonid);
    if (!l) continue;
    const slot = +c.period - 1;
    out.forEach(w => {
      if (c.weeks[w._id] !== "1") return;
      dayIds.forEach((_, di) => {
        if (c.days[di] !== "1") return;
        const arr = w.days[w.dates[di]];
        if (arr[slot] && arr[slot] !== subj[l.subjectid]) log(`  ! kolizja ${w.dates[di]} blok ${c.period}: ${arr[slot]} vs ${subj[l.subjectid]}`);
        arr[slot] = subj[l.subjectid];
      });
    });
  }
  out.forEach(w => Object.values(w.days).forEach(a => { for (let i = 0; i < 6; i++) a[i] = a[i] || null; if (a.every(x => !x)) a.length = 0; }));
  return out;
}

/* ---------------- cku.home.pl ---------------- */
const decodeEnt = s => s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
const clean = s => decodeEnt(s.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

function tableGrid(html) {
  const grid = [];
  [...html.matchAll(/<tr[\s\S]*?<\/tr>/gi)].forEach((tr, r) => {
    grid[r] = grid[r] || [];
    let c = 0;
    for (const m of tr[0].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/gi)) {
      while (grid[r][c] !== undefined) c++;
      const cs = +((/colspan=["']?(\d+)/i.exec(m[1]) || [])[1] || 1);
      const rs = +((/rowspan=["']?(\d+)/i.exec(m[1]) || [])[1] || 1);
      const text = clean(m[2]);
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) (grid[r + dr] = grid[r + dr] || [])[c + dc] = dr === 0 && dc === 0 ? text : "";
      c += cs;
    }
  });
  return grid;
}

// Rok w tabelkach cku bywa błędny (np. 2025 zamiast 2026) — dopasowujemy po dniu i miesiącu.
function parseCku(html, expected) {
  const g = tableGrid(html);
  let hr = -1, hc = -1;
  g.forEach((row, r) => row.forEach((t, c) => { if (hr < 0 && t === CONFIG.className) { hr = r; hc = c; } }));
  if (hr < 0) return null;
  const res = { days: {}, rooms: {}, notes: {} };
  let date = null;
  for (let r = hr + 1; r < g.length; r++) {
    const row = g[r] || [];
    if (row.length && row.every(t => !t)) break; // pusty wiersz = koniec grupy klas
    if (row[0] === "Data") {
      const m = /(\d\d)\.(\d\d)\.(\d{4})/.exec(row[hc] || "");
      date = m ? expected.find(d => d.slice(5) === `${m[2]}-${m[1]}`) || null : null;
      if (date && m[3] !== date.slice(0, 4)) res.yearFixed = `${m[3]}→${date.slice(0, 4)}`;
      if (date) { res.days[date] = Array(6).fill(null); res.rooms[date] = Array(6).fill(null); res.notes[date] = Array(6).fill(null); }
    } else if (/^[1-6]\.$/.test(row[0] || "") && date) {
      const i = parseInt(row[0]) - 1, cell = row[hc] || "";
      const m = /^([A-Z]\d\.\d\d)\s*(.*)$/.exec(cell);
      if (!m) continue;
      res.days[date][i] = m[1];
      res.rooms[date][i] = row[hc + 2] || null;
      if (/zast/i.test(m[2])) res.notes[date][i] = m[2];
    }
  }
  return res;
}

async function fetchCku(dates) {
  const url = `${CONFIG.ckuBase}plan_${dates[0].slice(8)}_${dates[1].slice(8)}_${dates[0].slice(5, 7)}.htm`;
  const res = await http(url);
  if (!res.ok) return { url, status: res.status, data: null };
  const html = new TextDecoder("windows-1250").decode(await res.arrayBuffer());
  return { url, status: 200, data: parseCku(html, dates) };
}

/* ---------------- harmonogram zjazdów ---------------- */
// Zwraca zbiór dat (YYYY-MM-DD) oznaczonych "x" dla naszej klasy.
async function fetchHarmonogram() {
  const url = CONFIG.ckuBase + CONFIG.harmonogram;
  const res = await http(url);
  if (!res.ok) throw new Error("harmonogram HTTP " + res.status);
  const html = new TextDecoder("windows-1250").decode(await res.arrayBuffer());
  const g = tableGrid(html);
  const years = /(\d{4})\/(\d{4})/.exec(html.replace(/<[^>]+>/g, " ")) || [];
  const y1 = +years[1] || new Date().getFullYear(), y2 = +years[2] || y1 + 1;
  const hr = g.findIndex(r => r[0] === CONFIG.className);
  if (hr < 0) throw new Error("harmonogram: brak wiersza " + CONFIG.className);
  let dr = hr; while (dr >= 0 && g[dr][0] !== "data") dr--;
  const MONTHS = ["styczeń","luty","marzec","kwiecień","maj","czerwiec","lipiec","sierpień","wrzesień","październik","listopad","grudzień"];
  const mr = g.slice(0, dr).map((r, i) => [r, i]).reverse().find(([r]) => r[0] === "MIESIĄC")[1];
  const dates = new Set();
  let month = null;
  for (let c = 1; c < g[dr].length; c++) {
    const mi = MONTHS.indexOf((g[mr][c] || "").toLowerCase());
    if (mi >= 0) month = mi + 1;
    const day = parseInt(g[dr][c]);
    if (!day || !month) continue;
    if ((g[hr][c] || "").toLowerCase() === "x") dates.add(`${month >= 8 ? y1 : y2}-${pad(month)}-${pad(day)}`);
  }
  return dates;
}
function isoWeek(iso) {
  const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
}

/* ---------------- merge ---------------- */
const sameDay = (a = [], b = []) => JSON.stringify(a.length ? a : []) === JSON.stringify(b.every(x => !x) ? [] : b);
const compact = a => (a.every(x => !x) ? [] : a);

(async () => {
  log("edupage…");
  const weeks = buildFromEdupage(await fetchEdupage());
  log(`  ${weeks.length} zjazdów w planie bazowym`);

  let oldWeeks = [];
  try { oldWeeks = JSON.parse(fs.readFileSync(path.join(__dirname, "schedule.json"), "utf8")).weekends; } catch {}
  log("cku.home.pl…");
  for (const w of weeks) {
    let r;
    try { r = await fetchCku(w.dates); }
    catch (e) {
      const prev = oldWeeks.find(o => o.dates[0] === w.dates[0] && o.source === "cku");
      if (prev) { Object.assign(w, { days: prev.days, rooms: prev.rooms, notes: prev.notes, source: "cku", ckuUrl: prev.ckuUrl }); log(`  ~ ${w.dates[0]}: błąd sieci (${e.message}), zostawiam poprzednie dane z cku`); }
      else log(`  ! ${w.dates[0]}: błąd sieci (${e.message}), zostaje plan z edupage`);
      continue;
    }
    const { url, status, data } = r;
    const file = url.split("/").pop();
    if (status !== 200) { log(`  - ${w.dates[0]}: brak pliku ${file} (HTTP ${status})`); continue; }
    if (!data) { log(`  - ${w.dates[0]}: ${file} jest, ale bez klasy ${CONFIG.className} (klasa nie ma tego zjazdu)`); continue; }
    const found = w.dates.filter(d => data.days[d]);
    if (!found.length) { log(`  - ${w.dates[0]}: klasa ${CONFIG.className} jest, ale bez dat tego zjazdu`); continue; }
    found.forEach(d => {
      if (!sameDay(w.days[d], data.days[d])) log(`  ~ ${d}: cku różni się od edupage → biorę cku`);
      w.days[d] = compact(data.days[d]);
      w.rooms[d] = data.rooms[d];
      w.notes[d] = data.notes[d];
    });
    if (data.yearFixed) log(`    (w tabelce błędny rok ${data.yearFixed} — poprawiono)`);
    w.source = "cku";
    w.ckuUrl = url;
    log(`  + ${w.dates[0]}: ${url.split("/").pop()}`);
  }

  log("harmonogram…");
  try {
    const zj = await fetchHarmonogram();
    log(`  ${zj.size} dni zjazdowych dla ${CONFIG.className}`);
    weeks.forEach(w => {
      w.zjazd = zj.has(w.dates[0]) || zj.has(w.dates[1]);
      const hasLessons = Object.values(w.days).some(a => a.length);
      if (w.zjazd !== hasLessons && w.source === "edupage") log(`  ! ${w.dates[0]}: harmonogram ${w.zjazd ? "ma zjazd" : "nie ma zjazdu"}, a edupage ${hasLessons ? "ma lekcje" : "nie ma lekcji"}`);
    });
    // zjazdy z harmonogramu, których nie ma w edupage (jeszcze bez planu)
    [...zj].sort().forEach(d => {
      if (weeks.some(w => w.dates.includes(d))) return;
      const sat = new Date(d + "T12:00:00Z"); const day = sat.getUTCDay();
      if (day === 0) sat.setUTCDate(sat.getUTCDate() - 1);
      const s1 = sat.toISOString().slice(0, 10); sat.setUTCDate(sat.getUTCDate() + 1); const s2 = sat.toISOString().slice(0, 10);
      if (weeks.some(w => w.dates.includes(s1))) return;
      weeks.push({ week: isoWeek(s1), dates: [s1, s2], days: { [s1]: [], [s2]: [] }, rooms: {}, notes: {}, source: "harmonogram", zjazd: true });
      log("  + dodano zjazd z harmonogramu:", s1);
    });
    weeks.sort((a, b) => a.dates[0].localeCompare(b.dates[0]));
  } catch (e) { log("  ! harmonogram pominięty:", e.message); }

  weeks.forEach(w => { delete w._id; });
  // generatedAt zmieniamy tylko gdy zmieniły się dane — dzięki temu CI nie robi pustych commitów.
  let generatedAt = new Date().toISOString();
  try {
    const old = JSON.parse(fs.readFileSync(path.join(__dirname, "schedule.json"), "utf8"));
    if (JSON.stringify(old.weekends) === JSON.stringify(weeks)) generatedAt = old.meta.generatedAt;
  } catch {}
  const meta = { generatedAt, classId: CONFIG.classId, className: CONFIG.className };

  const known = new Set(Object.keys(require("vm").runInNewContext("var window={};" + fs.readFileSync(path.join(__dirname, "data.js"), "utf8") + ";window.MODULES")));
  const unknown = new Set(weeks.flatMap(w => Object.values(w.days).flat()).filter(c => c && !known.has(c)));
  if (unknown.size) log("UWAGA: moduły spoza data.js (dopisz do MODULES):", [...unknown].join(", "));

  fs.writeFileSync(path.join(__dirname, "schedule.json"), JSON.stringify({ meta, weekends: weeks }, null, 2));
  fs.writeFileSync(path.join(__dirname, "schedule.js"),
    `// Plik generowany przez scrape.js — nie edytuj ręcznie.\nwindow.SCHEDULE_META = ${JSON.stringify(meta)};\nwindow.WEEKENDS = ${JSON.stringify(weeks, null, 1)};\n`);
  log(`Zapisano schedule.js / schedule.json (${weeks.length} zjazdów).`);
})().catch(e => { console.error("BŁĄD:", e.message); process.exit(1); });
