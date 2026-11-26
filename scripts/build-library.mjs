// Builds library.js from your Spotify playlist exports in /playlists (CSV from Exportify).
//  - recent releases (last 12 months) become extra current songs, scored from Spotify popularity
//  - older songs (2010 or later, at least 18 months old) become throwbacks, shared out to the stations that suit them
// Run: node scripts/build-library.mjs
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseCSV, tagsFor, songKey, isHoliday, loadBrowserData, writeJsGlobal, hash, DAY } from './shared.mjs';

const { RADIO_DATA: D } = loadBrowserData();
const dir = path.join(ROOT, 'playlists');
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.csv')) : [];

// "This week" = the chart Friday on or after today (never earlier than the seed week)
const seed = Date.parse(D.DATA_WEEK + 'T12:00:00Z');
const now = Math.max(Date.now(), seed);
const weeksSinceSeed = Math.ceil((now - seed) / (7 * DAY));
const asOf = new Date(seed + weeksSinceSeed * 7 * DAY).toISOString().slice(0, 10);
const asOfMs = Date.parse(asOf + 'T12:00:00Z');

const seen = new Map();
for (const f of files) {
  for (const r of parseCSV(fs.readFileSync(path.join(dir, f), 'utf8'))) {
    const id = (r['Track URI'] || '').split(':').pop();
    if (!/^[A-Za-z0-9]{22}$/.test(id)) continue;
    const artists = (r['Artist Name(s)'] || '').split(',').map(s => s.trim()).filter(Boolean);
    const rel = r['Album Release Date'] || '';
    const relMs = Date.parse(rel.length === 4 ? rel + '-06-01' : rel.length === 7 ? rel + '-15' : rel);
    seen.set(id, {
      id, title: r['Track Name'], artist: artists.join(', '), artists, rel, relMs, year: +rel.slice(0, 4),
      x: r['Explicit'] === 'true', pop: +r['Popularity'] || 0,
    });
  }
}
const all = [...seen.values()];

const seedKeys = new Set(D.CURRENTS.map(r => songKey(r[1], r[2])));
const plantIds = new Set(D.STATIONS.flatMap(s => s.plants.map(p => p[0])));
const handGold = new Set(Object.values(D.GOLD).map(g => g[0]));

// ---- current songs from recent releases ----
const currents = [];
const usedKeys = new Set(seedKeys);
for (const s of all.sort((a, b) => b.pop - a.pop)) {
  const weeks = Math.max(1, Math.round((asOfMs - s.relMs) / (7 * DAY)));
  if (!(weeks <= 52) || s.pop < 30 || isHoliday(s.title) || plantIds.has(s.id)) continue;
  const key = songKey(s.title, s.artist);
  if (usedKeys.has(key)) continue;
  usedKeys.add(key);
  const age = weeks <= 8 ? 1 : Math.exp(-(weeks - 8) / 20);
  const score = Math.round(Math.min(32, Math.max(3, (s.pop - 30) * 0.5)) * age * 10) / 10;
  const trend = weeks <= 6 ? 'up' : weeks <= 14 ? 'hold' : 'down';
  currents.push([s.id, s.title, s.artist, tagsFor(s.artists).join(' '), score, weeks, trend, asOf, s.x ? 1 : 0]);
}

// ---- throwbacks, shared out by station taste ----
const minYear = D.GOLD_MIN_YEAR || 2010;
const cutoff = asOfMs - 78 * 7 * DAY; // at least 18 months old
const homeOf = new Map();
D.STATIONS.forEach(st => (st.home || []).forEach(a => homeOf.set(a.toLowerCase(), [...(homeOf.get(a.toLowerCase()) || []), st.id])));
const goldPick = Object.fromEntries(D.STATIONS.map(st => [st.id, []]));
const handGoldKeys = new Set(Object.values(D.GOLD).map(g => songKey(g[1], g[2])));
const goldKeys = new Set();
for (const s of [...all].sort((a, b) => b.pop - a.pop)) {
  const gk = songKey(s.title, s.artist);
  if (s.year < minYear || !(s.relMs <= cutoff) || isHoliday(s.title) || handGold.has(s.id) || handGoldKeys.has(gk) || usedKeys.has(gk) || goldKeys.has(gk)) continue;
  goldKeys.add(gk);
  const tags = tagsFor(s.artists);
  const homes = new Set(s.artists.flatMap(a => homeOf.get(a.toLowerCase()) || []));
  const scored = D.STATIONS.map(st => {
    if (st.clean && s.x) return [st.id, 0];
    const aff = tags.reduce((t, g) => t + (st.tags[g] ?? 1), 0) / tags.length;
    if (aff < 0.25) return [st.id, 0];
    return [st.id, aff * (homes.has(st.id) ? 4 : 1) * (0.55 + 0.9 * hash(st.id + s.id)) * (0.6 + s.pop / 100)];
  }).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 2);
  scored.forEach(([sid, sc]) => goldPick[sid].push([sc, [s.id, s.title, s.artist, s.year, s.x ? 1 : 0]]));
}
const gold = {};
for (const [sid, list] of Object.entries(goldPick)) gold[sid] = list.sort((a, b) => b[0] - a[0]).slice(0, 45).map(x => x[1]);

const explicit = all.filter(s => s.x).map(s => s.id);
writeJsGlobal('library.js', 'RADIO_LIBRARY', { built: asOf, files, currents, gold, explicit });
console.log(`library.js: ${currents.length} recent songs, ${Object.values(gold).reduce((a, b) => a + b.length, 0)} throwback slots across ${D.STATIONS.length} stations (from ${all.length} playlist tracks, week of ${asOf})`);
