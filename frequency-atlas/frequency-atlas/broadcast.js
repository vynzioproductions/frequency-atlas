/* The shared broadcast schedule. Every station's hour is built from (station, hour) alone,
   with a seeded random generator and the same song data, so every device works out the
   same songs at the same times. Tune in at 2:43 PM and you hear what everyone else hears. */
{
  const E = window.RadioEngine, DJ = window.RadioDJ;
  const HOUR = 3600e3;
  const CLOCK = ['power', 'currents', 'adds', 'power', 'gold', 'deep', 'currents', 'plants', 'power', 'medium', 'adds', 'currents', 'gold', 'power', 'deep', 'recurrents'];
  const ID_FULL = 9000, ID_SHORT = 5500;

  function rng(seed) { // mulberry32
    let a = Math.floor(E.hash(seed) * 4294967296) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const cache = new Map();
  function log(st, hourIndex, depth = 0) {
    const key = st.id + ':' + hourIndex;
    const ckey = key + ':' + depth;               // the 'no look-back' version is cached separately
    if (cache.has(ckey)) return cache.get(ckey);
    const start = hourIndex * HOUR;
    const week = Math.max(0, E.weekIndexFor(start));
    const rot = E.rotation(st, week, { broadcast: true });
    const r = rng(key + ':' + E.SONGS.size);
    // don't repeat songs from the end of the previous hour
    const avoid = depth ? [] : log(st, hourIndex - 1, 1).items.filter(i => i.song).slice(-12).map(i => i.song.id);
    let clock = Math.floor(r() * CLOCK.length);
    const items = [];
    let t = 0, sinceId = 0;
    const push = (it) => { it.start = start + t; it.end = it.start + it.dur; items.push(it); t += it.dur; };
    // top of the hour: legal ID
    push({ type: 'id', kind: 'full', dur: ID_FULL, text: DJ.seeded(r, () => DJ.legalId(st) + ' ' + st.slogan + '.') });
    let guard = 0;
    while (t < HOUR && guard++ < 200) {
      let song = null, cat = null;
      for (let tries = 0; tries < CLOCK.length && !song; tries++) {
        cat = CLOCK[clock % CLOCK.length]; clock++;
        const list = rot[cat] || [];
        const fresh = list.filter(s => !avoid.includes(s.id));
        const pool = fresh.length ? fresh : list;
        if (pool.length) song = pool[Math.floor(r() * pool.length)];
      }
      if (!song) break;
      sinceId++;
      // imaging before plants, new adds and throwbacks, and a positioner every few songs
      if ((['plants', 'adds', 'gold'].includes(cat) && sinceId >= 2) || sinceId >= 4) {
        const full = sinceId >= 4 && r() < 0.5;
        push({ type: 'id', kind: full ? 'full' : 'short', dur: full ? ID_FULL : ID_SHORT, text: DJ.seeded(r, () => DJ.sweeper(st, cat, song)) });
        sinceId = 1;
      }
      push({ type: 'song', song, cat, dur: E.durationOf(song) });
      avoid.push(song.id); if (avoid.length > 30) avoid.shift();
    }
    // the last song gets cut at the top of the next hour, like a hard post
    const last = items[items.length - 1];
    if (last && last.end > start + HOUR) { last.end = start + HOUR; last.cut = true; }
    const out = { start, items };
    if (cache.size > 64) cache.clear();
    cache.set(ckey, out);
    return out;
  }

  function at(st, now = Date.now()) {
    const h = Math.floor(now / HOUR);
    const { items } = log(st, h);
    const i = items.findIndex(it => now >= it.start && now < it.end);
    if (i >= 0) return { item: items[i], offset: now - items[i].start, next: items[i + 1] || log(st, h + 1).items[0] };
    // a gap (rare): wait for the next item
    const nx = items.find(it => it.start > now) || log(st, h + 1).items[0];
    return { item: null, offset: 0, next: nx };
  }

  function upcoming(st, n = 6, now = Date.now()) {
    const h = Math.floor(now / HOUR);
    const list = [...log(st, h).items, ...log(st, h + 1).items].filter(it => it.type === 'song' && it.end > now);
    return list.slice(0, n);
  }

  function clearCache(stId) { for (const k of [...cache.keys()]) if (!stId || k.startsWith(stId + ':')) cache.delete(k); }

  window.RadioLive = { log, at, upcoming, clearCache };
}
