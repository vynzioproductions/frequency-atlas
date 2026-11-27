// Adds a station someone shared from the app (a GitHub issue titled "Station: …" with its station code)
// to stations.json, so it shows up for everyone. Run by .github/workflows/stations.yml.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './shared.mjs';

const body = process.env.ISSUE_BODY || '';
const author = (process.env.ISSUE_AUTHOR || '').replace(/[^\w-]/g, '').slice(0, 39);
const fail = (msg) => { console.error(msg); fs.writeFileSync('/tmp/station-error.txt', msg); process.exit(1); };

const m = body.match(/```(?:json)?\s*([\s\S]*?)```/);
if (!m) fail("I couldn't find the station code in the request.");
let st;
try { st = JSON.parse(m[1]); } catch { fail("The station code isn't valid. Copy it again from the app with **Share with everyone**."); }

const text = (v, max) => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v, lo, hi) => { const n = Number(v); if (!Number.isFinite(n) || n < lo || n > hi) fail(`A setting is out of range (${v}).`); return n; };

const name = text(st.name, 40), city = text(st.city, 40);
if (!name || !city) fail('The station needs a name and a city.');
const lat = num(st.lat, -60, 75), lon = num(st.lon, -180, 180);
const country = /^[a-z]{2}$/.test(st.country || '') ? st.country : 'us';
const call0 = text(st.call, 6).toUpperCase();
const call = country === 'us' ? call0.slice(0, 4) : call0;
const call6 = call0;
if (country === 'us' ? !/^[KW][A-Z]{2,3}$/.test(call) : !/^[A-Z0-9]{2,6}$/.test(call6)) fail(country === 'us' ? 'Call letters must be 3–4 letters starting with K or W.' : 'The station code needs 2–6 letters or numbers.');
const freq = String(st.freq || '').split(' ')[0];
if (!/^(7[6-9]|8\d|9\d|10[0-7])\.\d$/.test(freq)) fail('The frequency must be on the FM dial.');
const color = /^#[0-9a-f]{6}$/i.test(st.color) ? st.color : '#2ee6c8';
const TAGS = ['pop', 'dance', 'rnb', 'indie', 'alt', 'latin', 'country', 'kpop', 'rap'];
const tags = Object.fromEntries(TAGS.map(t => [t, +num(st.tags?.[t] ?? 1, 0, 3).toFixed(2)]));
const plants = (Array.isArray(st.plants) ? st.plants : []).slice(0, 5)
  .filter(p => Array.isArray(p) && /^[A-Za-z0-9]{22}$/.test(p[0]))
  .map(p => [p[0], text(p[1], 80), text(p[2], 80), text(p[3], 40) || 'pop', num(p[4] ?? 14, 0, 60), num(p[5] ?? 1, 0, 52), p[6] === 'up' ? 'up' : 'hold']);

const file = path.join(ROOT, 'stations.json');
const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { updated: null, stations: [], songs: [] };
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
let id = /^[a-z0-9-]{3,60}$/.test(st.id) ? st.id : `u-${slug(city)}-${slug(call)}`;
const existing = data.stations.findIndex(s => s.id === id);
if (existing >= 0 && data.stations[existing].by && data.stations[existing].by !== author) id = `${id}-${Date.now().toString(36)}`;
if (data.stations.some(s => s.id !== id && s.call === call && Math.abs(s.lat - lat) < 3 && Math.abs(s.lon - lon) < 3)) fail(`There's already a ${call} nearby. Pick different call letters.`);

const clean = {
  id, name, slogan: text(st.slogan, 60), city, state: text(st.state, 2).toUpperCase(), lat, lon, call, freq, color, tags,
  nb: num(st.nb ?? 0.35, 0, 1), clean: !!st.clean, home: (Array.isArray(st.home) ? st.home : []).slice(0, 6).map(h => text(h, 40)).filter(Boolean),
  about: text(st.about, 400), shows: [], plants, tz: text(st.tz, 40) || undefined, by: author || undefined,
  ...(country !== 'us' ? { country, lang: text(st.lang, 10) || 'en', brand: !!st.brand } : {}),
};
const i = data.stations.findIndex(s => s.id === id);
if (i >= 0) data.stations[i] = clean; else data.stations.push(clean);
data.updated = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
console.log(`${i >= 0 ? 'Updated' : 'Added'} ${name} (${call} ${freq}, ${city}) — ${data.stations.length} shared stations.`);
fs.writeFileSync('/tmp/station-added.txt', `${name} (${call} ${freq} FM, ${city})`);
