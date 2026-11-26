// Pulls this week's Spotify US weekly chart (via kworb.net) and writes auto.js,
// which the app layers on top of the seed songs and your playlist library.
// Run: node scripts/update-chart.mjs            (fetches the live chart)
//      node scripts/update-chart.mjs file.html  (parses a saved copy, for testing)
import fs from 'node:fs';
import { tagsFor, isKnownArtist, isHoliday, writeJsGlobal, loadBrowserData } from './shared.mjs';

const URL = 'https://kworb.net/spotify/country/us_weekly.html';
const MAX_WEEKS = 78;   // skip songs that have been on the chart 18+ months ("nothing too old")
const MIN_ROWS = 50;    // if parsing finds fewer rows than this, keep last week's data instead

const strip = (h) => h.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
const num = (s) => { const n = parseInt(String(s).replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : null; };

export function parseKworb(html) {
  const date = (html.match(/(20\d\d)\/(\d\d)\/(\d\d)/) || []).slice(1).join('-') || null;
  const rows = [];
  for (const tr of html.split(/<tr[\s>]/i).slice(1)) {
    const cells = tr.split(/<td[^>]*>/i).slice(1).map(c => c.replace(/<\/td>[\s\S]*$/i, ''));
    if (cells.length < 6) continue;
    const ti = cells.findIndex(c => /track\/[A-Za-z0-9]{22}\.html/.test(c));
    if (ti < 0) continue;
    const a = cells[ti].match(/<a[^>]*track\/([A-Za-z0-9]{22})\.html[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;
    const id = a[1], title = strip(a[2]);
    const artist = strip(cells[ti].slice(0, cells[ti].indexOf(a[0]))).replace(/\s*-\s*$/, '');
    const rest = cells.slice(ti + 1).map(strip);
    const pos = num(strip(cells[0]));
    // columns after the title: Wks, Pk, (x?), Streams, Streams+, Total.
    // Find Streams as the first big comma-formatted number, so a merged or split Pk column doesn't matter.
    const wks = num(rest[0]);
    const si = rest.findIndex((c, i) => i > 0 && /^\d{1,3}(,\d{3})+$/.test(c));
    const streams = si > 0 ? num(rest[si]) : null, plus = si > 0 ? num(rest[si + 1]) : 0;
    if (!pos || !streams) continue;
    rows.push({ pos, id, title, artist, wks: wks || 1, streams, plus: plus ?? 0 });
  }
  return { date, rows };
}

async function main() {
  const local = process.argv[2];
  const html = local ? fs.readFileSync(local, 'utf8')
    : await (await fetch(URL, { headers: { 'user-agent': 'frequency-atlas-chart-bot (github actions)' } })).text();
  const { date, rows } = parseKworb(html);
  if (rows.length < MIN_ROWS || !date) {
    console.error(`Only parsed ${rows.length} rows (date ${date}); the page layout may have changed. Keeping the previous auto.js.`);
    process.exit(local ? 1 : 0);
  }
  const eligible = rows.filter(r => r.wks <= MAX_WEEKS && !isHoliday(r.title));
  const top = Math.max(...eligible.map(r => r.streams));
  const { RADIO_DATA: D } = loadBrowserData();
  // align to the app's chart week (weeks end on Fridays)
  const seed = Date.parse(D.DATA_WEEK + 'T12:00:00Z');
  const k = Math.max(0, Math.round((Date.parse(date + 'T12:00:00Z') - seed) / (7 * 864e5) + 0.4));
  const asOf = new Date(seed + k * 7 * 864e5).toISOString().slice(0, 10);

  const songs = eligible.map(r => {
    const prev = r.streams - r.plus;
    const change = prev > 0 ? r.plus / prev : 1;
    const trend = r.wks <= 2 || change > 0.04 ? 'up' : change < -0.06 ? 'down' : 'hold';
    const score = Math.round(95 * Math.pow(r.streams / top, 0.85) * 10) / 10;
    return [r.id, r.title, r.artist, tagsFor(r.artist.split(/,|&/)).join(' '), score, r.wks, trend, asOf, 0];
  });
  const unknown = [...new Set(eligible.filter(r => !isKnownArtist(r.artist)).map(r => r.artist))];
  writeJsGlobal('auto.js', 'RADIO_AUTO', { source: 'Spotify US Weekly (kworb.net)', chartDate: date, asOf, updated: new Date().toISOString(), songs });
  console.log(`auto.js: ${songs.length} songs from the Spotify US weekly chart dated ${date} (skipped ${rows.length - songs.length} holiday or 18-month-old songs)`);
  if (unknown.length) console.log(`Artists without genre tags (treated as pop) — add them in scripts/shared.mjs if they're rap, country, etc.:\n  ${unknown.join('\n  ')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error(e); process.exit(1); });
