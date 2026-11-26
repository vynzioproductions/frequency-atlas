// Looks up the length of every song the stations can play that isn't in your playlist exports,
// by reading Spotify's public embed page for the track. Saves durations.js (id -> milliseconds).
// Run: node scripts/durations.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT, writeJsGlobal } from './shared.mjs';

const ctx = { console }; ctx.window = ctx; ctx.globalThis = ctx;
for (const f of ['data.js', 'library.js', 'auto.js', 'composite.js', 'durations.js', 'engine.js']) {
  const p = path.join(ROOT, f); if (fs.existsSync(p)) vm.runInNewContext(fs.readFileSync(p, 'utf8'), ctx);
}
const E = ctx.RadioEngine, L = ctx.RADIO_LIBRARY || {};
const known = { ...(ctx.RADIO_DURATIONS || {}) };
let stations = [];
try { stations = JSON.parse(fs.readFileSync(path.join(ROOT, 'stations.json'), 'utf8')).stations || []; } catch { /* none yet */ }
const ids = new Set([...E.SONGS.keys(), ...E.STATIONS.flatMap(s => E.goldFor(s).map(g => g.id)), ...stations.flatMap(s => (s.plants || []).map(p => p[0]))]);
const missing = [...ids].filter(id => !known[id] && !(L.durations || {})[id]);
console.log(`${ids.size} songs, ${missing.length} without a known length`);
let found = 0;
for (const id of missing.slice(0, 400)) {
  try {
    const html = await (await fetch(`https://open.spotify.com/embed/track/${id}`, { headers: { 'user-agent': 'Mozilla/5.0 frequency-atlas' } })).text();
    const m = html.match(/"duration(?:_ms|Ms)?"\s*:\s*(\d{5,7})/);
    if (m) { known[id] = +m[1]; found++; }
  } catch { /* try again next week */ }
  await new Promise(r => setTimeout(r, 250));
}
writeJsGlobal('durations.js', 'RADIO_DURATIONS', known);
console.log(`durations.js: found ${found} new lengths (${Object.keys(known).length} total)`);
