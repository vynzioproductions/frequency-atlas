// Rebuilds Daniel's US New Music Chart every day and writes composite.js.
//
// Rules (from Daniel):
//   - US only; ranks from each source, not raw stream counts
//   - weighted mostly toward streaming, with playlist placement on Hot Hits USA (not Today's Top Hits)
//   - leans toward new pop music
//   - no Christmas songs; nothing older than 18 months unless it's making a genuine resurgence
//   - never SiriusXM
//
// Sources (all free and public; any that fail on a given day are skipped and the weights re-balance):
//   Spotify US daily chart (kworb.net)          streaming   45%
//   Apple Music US Top 100 (Apple's RSS feed)   streaming   30%
//   Hot Hits USA playlist order (Spotify embed) playlist    15%
//   Shazam US Top 200                           discovery   10%
//
// Run: node scripts/update-composite.mjs        (Node 20+)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, songKey, isHoliday, tagsFor, isKnownArtist, loadBrowserData } from './shared.mjs';
import { parseKworb } from './update-chart.mjs';

const UA = { 'user-agent': 'Mozilla/5.0 (frequency-atlas chart bot; github actions)' };
const HOT_HITS_USA = '37i9dQZF1DX0kbJZpiYdZl';          // open.spotify.com/playlist/<this id>
const SIZE = 50;
const OLD_DAYS = 548;                                     // 18 months
const HIST = path.join(ROOT, 'composite-history.json');
const today = new Date().toISOString().slice(0, 10);
const DAY = 864e5;

// mostly streaming, then playlist placement (Spotify's Hot Hits USA and Apple Music's Today's Hits and
// A-List: Pop), then Shazam for discovery
const WEIGHTS = { spotify: 0.40, apple: 0.27, hothits: 0.10, todayshits: 0.07, alistpop: 0.06, shazam: 0.10 };
// Apple Music editorial playlists (music.apple.com/us/playlist/<name>/<id>)
const APPLE_PLAYLISTS = {
  todayshits: { id: 'pl.f4d106fed2bd41149aaacabb233eb5eb', name: "Today's Hits" },
  alistpop: { id: 'pl.5ee8333dbe944d9f9151e97d92d1ead9', name: 'A-List: Pop' },
  newmusicdaily: { id: 'pl.2b0e6e332fdf4b7a91164da3162127b5', name: 'New Music Daily' },
};
// Spotify playlists the stations' music directors dig through for new songs and plants
const DISCOVERY = { poprising: { id: '37i9dQZF1DWUa8ZRTfalHk', name: 'Pop Rising' }, nmf: { id: '37i9dQZF1DX4JAvHpjipBk', name: 'New Music Friday' } };

const ent = (s) => String(s).replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
async function get(url, type = 'text') {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return type === 'json' ? r.json() : r.text();
}
function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}
function findKey(obj, key, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 12) return undefined;
  if (key in obj) return obj[key];
  for (const v of Object.values(obj)) { const f = findKey(v, key, depth + 1); if (f !== undefined) return f; }
  return undefined;
}

// ---------------- sources: each returns [{ rank, title, artist, id?, release?, days? }] ----------------
async function spotify() {
  const { rows } = parseKworb(await get('https://kworb.net/spotify/country/us_daily.html'));
  if (rows.length < 100) throw new Error(`only ${rows.length} rows`);
  return rows.slice(0, 200).map(r => ({ rank: r.pos, title: r.title, artist: r.artist, id: r.id, days: r.wks }));
}
async function apple() {
  const j = await get('https://rss.applemarketingtools.com/api/v2/us/music/most-played/100/songs.json', 'json');
  const list = j?.feed?.results || [];
  if (list.length < 50) throw new Error(`only ${list.length} rows`);
  return list.map((s, i) => ({ rank: i + 1, title: s.name, artist: s.artistName, release: s.releaseDate }));
}
async function spotifyPlaylist(id, expect) {
  const data = nextData(await get(`https://open.spotify.com/embed/playlist/${id}`));
  const name = findKey(data, 'name') || findKey(data, 'title');
  if (name && !String(name).toLowerCase().includes(expect.toLowerCase())) throw new Error(`playlist is "${name}", not ${expect}`);
  const list = findKey(data, 'trackList') || [];
  if (list.length < 20) throw new Error(`only ${list.length} tracks`);
  return list.map((t, i) => ({ rank: i + 1, title: t.title, artist: t.subtitle, id: (String(t.uri).match(/track:([A-Za-z0-9]{22})/) || [])[1] }));
}
const hothits = () => spotifyPlaylist(HOT_HITS_USA, 'Hot Hits USA');
// Apple Music playlist pages carry their track list as JSON; collect every {title, artistName} in order
async function applePlaylist(key) {
  const { id, name } = APPLE_PLAYLISTS[key];
  const html = await get(`https://music.apple.com/us/playlist/${encodeURIComponent(name.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}/${id}`);
  const blobs = [...html.matchAll(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/g)].map(m => { try { return JSON.parse(m[1]); } catch { return null; } }).filter(Boolean);
  const out = [], seen = new Set();
  const walk = (o, d = 0) => {
    if (!o || typeof o !== 'object' || d > 25) return;
    const title = o.title || o.name, artist = o.artistName || o.subtitle || o.byArtist?.name || (Array.isArray(o.byArtist) ? o.byArtist.map(a => a.name).join(', ') : null);
    if (typeof title === 'string' && typeof artist === 'string' && (o.artistName || o.byArtist || o.duration || o.contentDescriptor?.kind === 'song')) {
      const k = (title + '|' + artist).toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push({ rank: out.length + 1, title, artist }); }
    }
    for (const v of Object.values(o)) walk(v, d + 1);
  };
  blobs.forEach(b => walk(b));
  if (out.length < 20) throw new Error(`only ${out.length} songs found on the page`);
  return out;
}
const todayshits = () => applePlaylist('todayshits');
const alistpop = () => applePlaylist('alistpop');
async function shazam() {
  const text = await get('https://www.shazam.com/services/charts/csv/top-200/united-states');
  const lines = text.split(/\r?\n/).filter(Boolean);
  const head = lines.findIndex(l => /^rank,/i.test(l));
  if (head < 0) throw new Error('unexpected format');
  const out = [];
  for (const l of lines.slice(head + 1)) {
    const cells = l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).map(c => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
    const [rank, artist, title] = cells;
    if (+rank && title) out.push({ rank: +rank, title, artist });
  }
  if (out.length < 50) throw new Error(`only ${out.length} rows`);
  return out;
}

// release date from Spotify's public embed page (cached in the history file)
async function releaseOf(id) {
  try {
    const data = nextData(await get(`https://open.spotify.com/embed/track/${id}`));
    const rd = findKey(data, 'releaseDate');
    const iso = typeof rd === 'string' ? rd : rd?.isoString;
    return iso ? iso.slice(0, 10) : null;
  } catch { return null; }
}

async function main() {
  const hist = fs.existsSync(HIST) ? JSON.parse(fs.readFileSync(HIST, 'utf8')) : { meta: {}, days: {} };
  // first run: carry over the hand-made chart's peaks, weeks and positions so nothing shows as NEW
  if (!Object.keys(hist.days).length) {
    try {
      const old = loadBrowserData('composite.js').RADIO_COMPOSITE;
      const ref = old.updated || old.weekEnding;
      hist.days[new Date(Date.parse(today) - DAY).toISOString().slice(0, 10)] = old.rows.map(r => [songKey(r[1], r[2]), r[0]]);
      old.rows.forEach(r => { hist.meta[songKey(r[1], r[2])] = { first: new Date(Date.parse(ref) - (r[5] - 1) * 7 * DAY).toISOString().slice(0, 10), peak: r[4] }; });
    } catch { /* no earlier chart */ }
  }
  const sources = {};
  for (const [name, fn] of Object.entries({ spotify, apple, hothits, todayshits, alistpop, shazam })) {
    try { sources[name] = await fn(); console.log(`${name}: ${sources[name].length} songs`); }
    catch (e) { console.log(`${name}: skipped (${e.message})`); }
  }
  if (!sources.spotify && !sources.apple) { console.log('No streaming chart available today; keeping the current composite.js.'); return; }

  // Spotify IDs the app already knows (seed songs, playlists, weekly chart)
  const idByKey = new Map();
  const g = loadBrowserData('data.js'); (g.RADIO_DATA.CURRENTS || []).forEach(r => idByKey.set(songKey(r[1], r[2]), r[0]));
  for (const f of ['library.js', 'auto.js']) {
    try { const x = loadBrowserData(f); (x.RADIO_LIBRARY?.currents || x.RADIO_AUTO?.songs || []).forEach(r => idByKey.set(songKey(r[1], r[2]), r[0])); } catch { /* not built yet */ }
  }

  // combine
  const total = Object.keys(sources).reduce((t, k) => t + WEIGHTS[k], 0);
  const songs = new Map();
  for (const [name, list] of Object.entries(sources)) {
    const n = list.length;
    for (const s of list) {
      if (isHoliday(s.title)) continue;
      const key = songKey(ent(s.title), ent(s.artist));
      const cur = songs.get(key) || { key, title: ent(s.title), artist: ent(s.artist), pts: 0, srcs: {} };
      if (cur.srcs[name]) continue;                       // same song listed twice in one source
      cur.pts += (WEIGHTS[name] / total) * 100 * (n + 1 - s.rank) / n;
      cur.srcs[name] = s.rank;
      if (s.id && !cur.id) cur.id = s.id;
      if (s.release && !cur.release) cur.release = s.release.slice(0, 10);
      if (s.days) cur.days = s.days;
      // display names: the fullest artist credit any source gives, and the title without "(from …)" / "(w/ …)" tags
      const artist = ent(s.artist), title = ent(s.title).replace(/\s*[([](from|w\/|with|feat\.?|ft\.?)\s[^)\]]*[)\]]/gi, '').trim();
      if (artist.split(/,|&/).length > cur.artist.split(/,|&/).length || (name === 'hothits' && artist.length >= cur.artist.length)) cur.artist = artist;
      if (name === 'spotify' || name === 'hothits' || title.length < cur.title.length) cur.title = title;
      songs.set(key, cur);
    }
  }
  for (const s of songs.values()) { s.id = s.id || idByKey.get(s.key) || null; const m = hist.meta[s.key]; if (m?.release && !s.release) s.release = m.release; }

  // look up release dates for contenders we don't know yet (a few dozen a day at most)
  const contenders = [...songs.values()].sort((a, b) => b.pts - a.pts).slice(0, 120);
  let looked = 0;
  for (const s of contenders) {
    if (s.release || !s.id || looked >= 60) continue;
    s.release = await releaseOf(s.id); looked++;
    await new Promise(r => setTimeout(r, 200));
  }

  // new-music lean and the 18-month rule
  const now = Date.parse(today);
  const ranked = [];
  for (const s of contenders) {
    const ageDays = s.release ? (now - Date.parse(s.release)) / DAY : (s.days ?? 0);
    if ((s.release && +s.release.slice(0, 4) < 2010) || /remaster/i.test(s.title)) continue;   // nothing from before 2010, ever
    if (ageDays > OLD_DAYS) {
      // a genuine resurgence: back on the Spotify chart only recently, or climbing on Shazam
      const resurgent = (s.days != null && s.days <= 45) || (s.srcs.shazam && s.srcs.shazam <= 40);
      if (!resurgent) continue;
    }
    const lean = ageDays <= 56 ? 1.25 : ageDays <= 182 ? 1.12 : ageDays <= 365 ? 1 : 0.88;
    ranked.push({ ...s, score: s.pts * lean, ageDays });
  }
  ranked.sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, SIZE);
  if (top.length < 30) { console.log(`Only ${top.length} songs qualified; keeping the current composite.js.`); return; }

  // chart history: last position, peak, weeks on chart
  const prevDays = Object.keys(hist.days).sort();
  const yesterday = prevDays.filter(d => d < today).pop();
  const lastPos = new Map(yesterday ? hist.days[yesterday] : []);
  const top1 = top[0].score;
  const rows = top.map((s, i) => {
    const pos = i + 1, m = hist.meta[s.key] || (hist.meta[s.key] = { first: today, peak: pos });
    m.peak = Math.min(m.peak || pos, pos); m.last = today; if (s.release) m.release = s.release;
    const wks = Math.max(1, Math.ceil((now - Date.parse(m.first) + DAY) / (7 * DAY)));
    return [pos, s.title, s.artist, lastPos.get(s.key) ?? null, m.peak, wks, Math.round(96 * s.score / top1 * 10) / 10];
  });
  hist.days[today] = top.map((s, i) => [s.key, i + 1]);
  for (const d of prevDays.slice(0, -30)) delete hist.days[d];          // keep a month of history
  fs.writeFileSync(HIST, JSON.stringify(hist));

  // songs on the chart the app doesn't know yet, so they're playable and get spins right away
  const extra = top.filter(s => s.id && !idByKey.has(s.key))
    .map(s => [s.id, s.title, s.artist, tagsFor(s.artist.split(/,|&/)).join(' '), 0, 1, 'up']);

  // the app's chart weeks end on Fridays
  const seed = Date.parse(g.RADIO_DATA.DATA_WEEK + 'T12:00:00Z');
  const k = Math.max(0, Math.ceil((now - seed) / (7 * DAY)));
  const weekEnding = new Date(seed + k * 7 * DAY).toISOString().slice(0, 10);
  const used = Object.keys(sources).map(n => ({ spotify: 'Spotify', apple: 'Apple Music', hothits: 'Hot Hits USA', todayshits: "Today's Hits", alistpop: 'A-List: Pop', shazam: 'Shazam' })[n]).join(', ');
  // Spotify IDs for the 2026 hits in history.js (from kworb's all-time US list), so they play everywhere
  let historyIds = {};
  try { historyIds = loadBrowserData('composite.js').RADIO_COMPOSITE.historyIds || {}; } catch { /* first run */ }
  try {
    const H = loadBrowserData('history.js').RADIO_HISTORY;
    const missing = H.rows.map(r => songKey(r[0], r[1])).filter(k => !historyIds[k]);
    if (missing.length) {
      const { rows: all } = parseKworb(await get('https://kworb.net/spotify/country/us_weekly_totals.html'));
      const byK = new Map(all.map(r => [songKey(ent(r.title), ent(r.artist)), r.id]));
      missing.forEach(k => { if (byK.get(k)) historyIds[k] = byK.get(k); });
      console.log(`history: ${Object.keys(historyIds).length} of ${H.rows.length} 2026 hits have Spotify IDs`);
    }
  } catch (e) { console.log(`history IDs: skipped (${e.message})`); }

  // ---- the world: each country's Spotify daily chart, top 60, for the stations abroad ----
  let world = { charts: {} };
  try { world = loadBrowserData('composite.js').RADIO_COMPOSITE.world || world; } catch { /* first run */ }
  const COUNTRIES = 'ca mx gb ie fr de nl es it se no dk pl pt tr br ar co cl pe kr jp ph id in au nz za ng ae sg th eg at ch be cz gr fi tw hk my il vn do'.split(' ');
  const LATIN = new Set(['mx', 'es', 'ar', 'co', 'cl', 'pe', 'br', 'pt', 'do']);
  let got = 0;
  for (const cc of COUNTRIES) {
    try {
      const { rows: list } = parseKworb(await get(`https://kworb.net/spotify/country/${cc}_daily.html`));
      if (list.length < 40) throw new Error(`only ${list.length} rows`);
      const n = Math.min(200, list.length);
      world.charts[cc] = list.filter(r => r.id && !isHoliday(r.title)).slice(0, 60).map(r => {
        const artists = ent(r.artist).split(/,|&/).map(a => a.trim());
        let tags = tagsFor(artists);
        if (!isKnownArtist(artists)) tags = cc === 'kr' ? ['kpop'] : LATIN.has(cc) ? ['latin'] : ['pop'];
        return [r.id, ent(r.title).replace(/\s*[([](from|w\/|with|feat\.?|ft\.?)\s[^)\]]*[)\]]/gi, '').trim(), ent(r.artist), tags.join(' '), Math.round(40 + 56 * (n + 1 - r.pos) / n), r.wks || 1];
      });
      got++;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) { console.log(`world ${cc}: skipped (${e.message}); keeping the last copy`); }
  }
  world.weekEnding = weekEnding; world.updated = today;
  console.log(`world: ${got} of ${COUNTRIES.length} country charts updated`);

  // ---- discovery: new and rising songs for the music directors (adds and plants) ----
  const discovery = [], dseen = new Set(top.map(s => s.key));
  for (const [src, pl] of Object.entries(DISCOVERY)) {
    try {
      const list = await spotifyPlaylist(pl.id, pl.name);
      for (const t of list) {
        const key = songKey(ent(t.title), ent(t.artist));
        if (!t.id || dseen.has(key) || isHoliday(t.title)) continue;
        dseen.add(key);
        discovery.push([t.id, ent(t.title), ent(t.artist), tagsFor(ent(t.artist).split(/,|&/).map(a => a.trim())).join(' '), src]);
      }
      console.log(`discovery: ${pl.name}: ${list.length} songs`);
    } catch (e) { console.log(`discovery: ${pl.name} skipped (${e.message})`); }
  }
  // New Music Daily (Apple Music): mark songs the app already knows as fresh discoveries
  try {
    const nmd = await applePlaylist('newmusicdaily');
    const byKey = new Map(discovery.map(d => [songKey(d[1], d[2]), d]));
    nmd.forEach(t => { const d = byKey.get(songKey(ent(t.title), ent(t.artist))); if (d && !d[4].includes('nmd')) d[4] += ' nmd'; });
    console.log(`discovery: New Music Daily: ${nmd.length} songs`);
  } catch (e) { console.log(`discovery: New Music Daily skipped (${e.message})`); }

  const out = { title: 'US New Music Chart', weekEnding, updated: today, status: `Updated ${today} · ${used}`, rows, songs: extra, historyIds, world, discovery };
  fs.writeFileSync(path.join(ROOT, 'composite.js'),
    `/* Daniel's US New Music Chart — rebuilt daily by scripts/update-composite.mjs.\n   rows: [pos, title, artist, lastPos, peak, weeks, score]; songs: new chart songs the app didn't know yet. */\nwindow.RADIO_COMPOSITE = ${JSON.stringify(out)};\n`);
  console.log(`composite.js: ${rows.length} songs (${extra.length} new to the app), #1 ${rows[0][1]} — ${rows[0][2]}. Sources: ${used}.`);
}

main().catch(e => { console.error(e); process.exit(1); });
