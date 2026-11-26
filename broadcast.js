/* The shared broadcast schedule. Every station's hour is built from (station, hour) alone,
   with a seeded random generator and the same song data, so every device works out the
   same songs at the same times. Tune in at 2:43 PM and you hear what everyone else hears. */
{
  const E = window.RadioEngine, DJ = window.RadioDJ;
  const HOUR = 3600e3;
  // 16 slots, about one hour. Fewer power spins and more adds, deep cuts and throwbacks than a typical
  // Top 40 station, so each station sounds more like itself and less like the others.
  const CLOCK = ['power', 'adds', 'currents', 'gold', 'deep', 'power', 'adds', 'plants', 'currents', 'medium', 'gold', 'power', 'adds', 'recurrents', 'currents', 'deep'];
  const PER_HOUR = 15;                       // songs in a typical hour (for spacing rotations evenly)
  const SLOTS = {}; CLOCK.forEach(c => { SLOTS[c] = (SLOTS[c] || 0) + 1; });
  const firstArtist = (a) => String(a || '').split(/,|&| x | feat\.?| ft\.?| with /i)[0].trim().toLowerCase();
  function shuffled(list, seed) {
    const r = rng(seed), a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const ID_FULL = 9000, ID_SHORT = 5500;

  function rng(seed) { // mulberry32
    let a = Math.floor(E.hash(seed) * 4294967296) >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  const cache = new Map();
  // a new chain starts when the chart week changes, and at least once every 7 days
  const chainStart = (h) => h % 168 === 0 || Math.max(0, E.weekIndexFor(h * HOUR - HOUR)) !== Math.max(0, E.weekIndexFor(h * HOUR));
  // Hours are built in order through each day (UTC), each one carrying on from where the last left off:
  // where every rotation's deck is, the last ~40 songs and the last few artists. So nothing repeats
  // too soon, even across the hour, and every device still works out the identical schedule.
  function log(st, hourIndex) {
    const key = st.id + ':' + hourIndex;
    if (cache.has(key)) return cache.get(key);
    const start = hourIndex * HOUR;
    const week = Math.max(0, E.weekIndexFor(start));
    const rot = E.rotation(st, week, { broadcast: true });
    const r = rng(key + ':' + E.SONGS.size);
    // Each category is a shuffled deck dealt in order, so every song in it plays before any repeats.
    const decks = {};
    for (const [cat, list] of Object.entries(rot)) decks[cat] = shuffled(list, `${st.id}:${week}:${cat}:${list.length}`);
    // the chain starts fresh when the chart week changes (rotations change then anyway)
    const firstOfWeek = chainStart(hourIndex);
    if (!firstOfWeek && !cache.has(st.id + ':' + (hourIndex - 1))) {
      // build the earlier hours of the week in order first (no deep recursion)
      let h = hourIndex - 1; while (!chainStart(h) && !cache.has(st.id + ':' + (h - 1))) h--;
      for (; h < hourIndex; h++) log(st, h);
    }
    const prev = firstOfWeek ? null : log(st, hourIndex - 1).state;
    let dealt, avoid, recentArtists, clock;
    if (prev && prev.week === week) {
      dealt = { ...prev.dealt }; avoid = prev.avoid.slice(); recentArtists = prev.artists.slice(); clock = prev.clock;
    } else {
      // first hour of a chart week: start every deck from the top
      const hoursIn = 0;
      dealt = {}; Object.keys(decks).forEach(cat => { dealt[cat] = Math.floor(hoursIn * PER_HOUR * (SLOTS[cat] || 0) / CLOCK.length); });
      avoid = prev ? prev.avoid.slice() : []; recentArtists = []; clock = (hoursIn * PER_HOUR) % CLOCK.length;
      // the cards dealt just before this point were (very likely) heard in the hour before: hold them back
      for (const [cat, deck] of Object.entries(decks)) {
        const back = Math.ceil((SLOTS[cat] || 0) * PER_HOUR / CLOCK.length * 1.5) + 1;
        for (let i = 1; i <= back && i < deck.length; i++) avoid.push(deck[((dealt[cat] - i) % deck.length + deck.length) % deck.length].id);
      }
    }
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
        const deck = decks[cat] || [];
        if (!deck.length) continue;
        // next card in the deck, skipping songs heard recently and artists from the last few songs
        for (let k = 0; k < deck.length && !song; k++) {
          const s = deck[(dealt[cat] + k) % deck.length];
          if (avoid.includes(s.id) || recentArtists.includes(firstArtist(s.artist))) continue;
          song = s; dealt[cat] += k + 1;
        }
        if (!song) {   // everything in this deck was heard recently: play the one heard longest ago
          song = deck.reduce((best, s) => avoid.lastIndexOf(s.id) < avoid.lastIndexOf(best.id) ? s : best, deck[0]);
        }
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
      avoid.push(song.id); if (avoid.length > 40) avoid.shift();
      recentArtists.push(firstArtist(song.artist)); if (recentArtists.length > 5) recentArtists.shift();
    }
    // the last song gets cut at the top of the next hour, like a hard post
    const last = items[items.length - 1];
    if (last && last.end > start + HOUR) { last.end = start + HOUR; last.cut = true; }
    const out = { start, items, state: { week, dealt, avoid: avoid.slice(-40), artists: recentArtists.slice(), clock } };
    if (cache.size > 3000) cache.clear();
    cache.set(key, out);
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
