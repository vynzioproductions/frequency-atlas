// Prints station adds as Markdown.
// Run: node scripts/adds-report.mjs [us|world|all] [YYYY-MM-DD]
//   with a date: that day's music-director adds and plants; without: the current chart week's Top 30 changes
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { ROOT } from './shared.mjs';

const scope = process.argv[2] || 'all';
const ctx = { console, Date, Math, JSON }; ctx.window = ctx; ctx.globalThis = ctx;
for (const f of ['data.js', 'library.js', 'auto.js', 'composite.js', 'durations.js', 'history.js', 'engine.js']) {
  const p = path.join(ROOT, f); if (fs.existsSync(p)) vm.runInNewContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
}
const E = ctx.RadioEngine, k = E.nowWeek();
const day = process.argv[3];
if (day) {
  const song0 = (s) => `${s.title} (${String(s.artist).split(/,|&/)[0].trim()})`;
  const lines = [`# Station adds for ${day}`, ''];
  for (const sc of (scope === 'all' ? ['us', 'world'] : [scope])) {
    const rows = E.STATIONS.filter(st => E.inScope(st, sc)).map(st => ({ st, ...E.dailyAdds(st, day) })).filter(a => a.adds.length || a.plants.length);
    lines.push(`## ${sc === 'us' ? 'United States' : 'Around the world'}`, '');
    rows.forEach(a => lines.push(`- **${a.st.name}**, ${a.st.city}: ${[...a.adds.map(song0), ...a.plants.map(p => 'plant: ' + song0(p.song) + (p.push ? ' (big push)' : ''))].join(', ')}`));
    lines.push('');
  }
  console.log(lines.join('\n'));
  process.exit(0);
}
const end = E.weekEnding(k).toISOString().slice(0, 10);
const scopes = scope === 'all' ? ['us', 'world'] : [scope];
const song = (s) => `${s.title} (${String(s.artist).split(/,|&/)[0].trim()})`;
const out = [`# Station adds, week ending ${end}`, ''];
for (const sc of scopes) {
  const stations = E.STATIONS.filter(st => E.inScope(st, sc));
  const all = stations.map(st => ({ st, ...E.weeklyAdds(st, k) }));
  const tally = new Map();
  all.forEach(a => new Set([...a.debuts.map(d => d.song), ...a.adds]).forEach(s => { const t = tally.get(s.id) || { s, n: 0 }; t.n++; tally.set(s.id, t); }));
  const most = [...tally.values()].sort((a, b) => b.n - a.n).slice(0, 10);
  out.push(`## ${sc === 'us' ? 'United States' : 'Around the world'} (${stations.length} stations)`, '', '**Most added:** ' + (most.map(t => `${song(t.s)} ×${t.n}`).join(' · ') || 'nothing new'), '');
  for (const a of all) {
    const parts = [];
    if (a.debuts.length) parts.push('new: ' + a.debuts.map(d => `${song(d.song)} #${d.pos}${d.re ? ' (re-entry)' : ''}`).join(', '));
    if (a.adds.length) parts.push('adds: ' + a.adds.map(song).join(', '));
    if (a.plants.length) parts.push('plants: ' + a.plants.map(p => song(p.song) + (p.push ? ' (big push)' : '')).join(', '));
    if (a.drops.length) parts.push('dropped: ' + a.drops.map(d => song(d.song)).join(', '));
    if (parts.length) out.push(`- **${a.st.name}**, ${a.st.city}: ${parts.join(' · ')}`);
  }
  out.push('');
}
console.log(out.join('\n'));
