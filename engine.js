/* Chart engine: turns the song library into weekly spins and countdowns
   for every station. Pure functions, no DOM, so it can be tested in Node. */
(function (root) {
  const D = root.RADIO_DATA;
  const DAY = 864e5;
  const ANCHOR = Date.parse(D.DATA_WEEK + 'T12:00:00Z'); // week 0 = chart week ending this Friday
  const CHART_SIZE = 30;
  const NETWORK_SIZE = 40;
  const HISTORY_WEEKS = 30;


  function hash(s) {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
    return (x >>> 0) / 4294967296;
  }

  function weekIndexFor(date) { return Math.ceil((date - ANCHOR) / (7 * DAY)); }
  // the archive starts with the first chart week of 2026 (a few earlier weeks warm up the chart rules)
  const FIRST_WEEK = weekIndexFor(Date.parse('2026-01-02T12:00:00Z'));
  const EARLIEST = () => FIRST_WEEK - 5;
  function weekEnding(k) { return new Date(ANCHOR + k * 7 * DAY); }

  // ----- songs -----
  // Three sources, freshest wins: seed list (data.js) < your playlists (library.js) < weekly Spotify chart (auto.js)
  const L = root.RADIO_LIBRARY || { currents: [], gold: {}, explicit: [] };
  const A = root.RADIO_AUTO || { songs: [] };
  function songKey(title, artist) {
    const t = String(title).toLowerCase()
      .replace(/\s*[([].*?(feat|with|w\/|from|remaster|version|edit|remix|official).*?[)\]]/g, '')
      .replace(/\s+-\s+.*$/g, '').replace(/\s+(feat\.?|ft\.|with)\s.*$/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const a = String(artist).split(/,|&| feat\.| x /i)[0].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    return t + '|' + a;
  }
  function cleanTitle(t) { return String(t).replace(/\s+-\s+(from|remaster|single|radio|official|recorded|live|sped|feat).*$/i, '').trim(); }
  const EXPLICIT = new Set([...(L.explicit || []), '1alX84LuLflUU7n4ow0aSM', '3SoarlzPEiF7NgSeGsh44S', '2IQFvDSTIpkFU0VwqfKIui', '0uie2qIGjrvmmcwNGObx2s', '7rKNJgNYwgBN7bNYJrJU24', '5d2Sj3lMKJFefwU26GInQu', '0a5qYlqZgVqynD4lsGwvPT', '6VDw2mGBIa4csypjOhS6JT']);

  function mkSong(row, kind, src, only) {
    const [id, title, artist, tags, score, weeks, trend, asOf, x] = row;
    return { id, title: cleanTitle(title), artist, tags: String(tags).split(' '), score, weeks, trend, kind, src, only: only ? new Set([only]) : null,
      asOf: asOf || D.DATA_WEEK, x: !!x || EXPLICIT.has(id) };
  }
  const SONGS = new Map();
  const byKey = new Map();
  function addSong(song) {
    const key = songKey(song.title, song.artist);
    const prev = byKey.get(key);
    if (prev) {
      if (Date.parse(song.asOf) < Date.parse(prev.asOf) || (song.asOf === prev.asOf && song.src === 'lib')) return;
      // keep the curated genre tags from the earlier entry
      if (prev.src !== 'auto') song.tags = prev.tags;
      song.x = song.x || prev.x;
      SONGS.delete(prev.id);
    }
    byKey.set(key, song); SONGS.set(song.id, song);
  }
  D.CURRENTS.forEach(r => addSong(mkSong(r, 'current', 'seed')));
  (L.currents || []).forEach(r => addSong(mkSong(r, 'current', 'lib')));
  // the weekly Spotify chart, minus anything from before 2010 ("nothing too old") and remasters of old songs
  const MIN_YEAR = D.GOLD_MIN_YEAR || 2010, REL = A.releases || {};
  const HOLIDAY = /christmas|xmas|santa|jingle|sleigh|mistletoe|let it snow|navidad|holiday|reindeer|winter wonderland|silent night|underneath the tree|rockin' around|most wonderful time|deck the halls|o holy night|joy to the world|carol of the bells/i;
  (A.songs || []).filter(r => !/remaster/i.test(r[1]) && !HOLIDAY.test(r[1]) && !(REL[r[0]] && +REL[r[0]].slice(0, 4) < MIN_YEAR))
    .forEach(r => addSong(mkSong(r, 'current', 'auto')));
  // Daniel's US New Music Chart: its score is the main signal for any song it ranks
  const C = root.RADIO_COMPOSITE || { rows: [] };
  // brand-new chart songs the daily job found, so they're playable and get spins right away
  (C.songs || []).forEach(r => addSong(mkSong([...r.slice(0, 7), C.weekEnding, 0], 'current', 'auto')));
  const compByKey = new Map();
  (C.rows || []).forEach(([pos, title, artist, lw, pk, wks, score]) => {
    const key = songKey(title, artist); compByKey.set(key, { pos, lw, pk, wks, score });
    const s = byKey.get(key);
    if (!s || !C.weekEnding) return;
    if (Date.parse(s.asOf) > Date.parse(C.weekEnding) + 7 * DAY) return; // much newer data wins
    const trend = lw == null ? 'up' : lw > pos + 1 ? 'up' : lw < pos - 1 ? 'down' : 'hold';
    const merged = { ...s, score, weeks: Math.max(1, wks), trend, asOf: C.weekEnding, src: 'composite' };
    byKey.set(key, merged); SONGS.set(merged.id, merged);
  });
  function compositeChart() {
    return (C.rows || []).map(([pos, title, artist, lw, pk, wks, score]) => {
      const song = byKey.get(songKey(title, artist));
      const move = lw == null ? (wks > 1 ? 'RE' : 'NEW') : lw === pos ? '=' : lw > pos ? '▲' + (lw - pos) : '▼' + (pos - lw);
      return { pos, title: cleanTitle(title), artist, lw, pk, wks, score, move, id: song ? song.id : null };
    });
  }
  D.STATIONS.forEach(st => st.plants.forEach(r => { const s = mkSong(r, 'plant', 'seed', st.id); SONGS.set(s.id, s); }));

  // 2026 hits that have left today's charts (history.js), shaped from their real top-ten dates,
  // so the chart archives back to January 2026 have the songs that were actually big then
  const H = root.RADIO_HISTORY || { rows: [] }, HID = C.historyIds || {};
  H.rows.forEach(([title, artist, entry, peakPos, peakDate, wks, , tags]) => {
    const key = songKey(title, artist);
    if (byKey.has(key)) return;                         // still on today's charts: today's data wins
    const toW = (d) => weekIndexFor(Date.parse(d + 'T12:00:00Z'));
    const e = toW(entry), p = Math.max(e, toW(peakDate)), exit = e + wks;
    const id = HID[key] || 'h_' + Math.floor(hash(key) * 1e12).toString(36);
    const song = { id, title, artist, tags: tags.split(' '), score: 100 - 4 * (peakPos - 1), weeks: 1, trend: 'hold', kind: 'current',
      src: 'hist', only: null, asOf: peakDate, x: EXPLICIT.has(id), hist: { debut: e - 4, peak: p, decay: Math.max(3, (exit - p) / 0.8 + 2) } };
    SONGS.set(id, song); byKey.set(key, song);
  });

  // ----- the world: each country's Spotify chart (filled in daily by the chart job → composite.js) -----
  // A song's strength can differ by country; stations outside the US play what's big where they are.
  const W = C.world || { charts: {} };
  const ENGLISH = new Set(['gb', 'ie', 'ca', 'au', 'nz', 'za', 'ng', 'ph', 'sg', 'in', 'ae']);
  Object.entries(W.charts || {}).forEach(([cc, rows]) => rows.forEach(([id, title, artist, tags, score, days]) => {
    const key = songKey(title, artist);
    let song = SONGS.get(id) || byKey.get(key);
    if (!song) {
      song = mkSong([id, title, artist, tags, score, Math.max(1, Math.ceil((days || 7) / 7)), 'hold', W.weekEnding || C.weekEnding], 'current', 'world');
      song.wscore = score;
      SONGS.set(song.id, song); byKey.set(key, song);
    }
    (song.markets || (song.markets = new Map())).set(cc, score);
  }));
  // how big a song is at this station's home, compared with how big the song is overall
  function marketFactor(st, song) {
    const cc = st.country || 'us';
    if (cc === 'us') return song.src === 'world' ? 0 : 1;               // songs only big abroad stay abroad
    if (song.kind !== 'current') return 1;
    const local = song.markets?.get(cc);
    const base = song.src === 'world' ? song.wscore : Math.min(100, song.score ?? 60);
    if (local != null) return (0.4 + 0.6 * local / 100) / (0.4 + 0.6 * base / 100);
    return song.src === 'world' ? 0.05 : ENGLISH.has(cc) ? 0.5 : 0.25;
  }

  const GOLD = new Map();
  Object.entries(D.GOLD).forEach(([key, [id, title, artist, year]]) => GOLD.set(key, { key, id, title, artist, year, kind: 'gold', x: EXPLICIT.has(id) }));
  // every throwback the library knows about, for stations built in the app
  const GOLD_POOL = (() => {
    const seen = new Map();
    Object.values(L.gold || {}).flat().forEach(([id, title, artist, year, x]) => { if (!seen.has(id)) seen.set(id, { id, title: cleanTitle(title), artist, year, kind: 'gold', x: !!x }); });
    GOLD.forEach(g => { if (!seen.has(g.id)) seen.set(g.id, g); });
    return [...seen.values()];
  })();
  const goldCache = new Map();
  function goldFor(st) {
    if (st.custom) {
      const sig = JSON.stringify([st.tags, st.home, st.clean]);
      const hit = goldCache.get(st.id); if (hit && hit.sig === sig) return hit.list;
      const homes = new Set((st.home || []).map(a => a.toLowerCase()));
      const list = GOLD_POOL.filter(g => !(st.clean && g.x)).map(g => {
        const tags = artistTags(g.artist);
        const aff = tags.reduce((t, x) => t + (st.tags[x] ?? 1), 0) / tags.length;
        const home = String(g.artist).split(/,|&| feat\./i).some(a => homes.has(a.trim().toLowerCase()));
        return [aff * (home ? 4 : 1) * (0.55 + 0.9 * hash(st.id + g.id)), g];
      }).filter(x => x[0] > 0.2).sort((a, b) => b[0] - a[0]).slice(0, 45).map(x => x[1]);
      goldCache.set(st.id, { sig, list });
      return list;
    }
    const hand = st.gold.map(g => GOLD.get(g)).filter(Boolean);
    const lib = (L.gold?.[st.id] || []).map(([id, title, artist, year, x]) => ({ id, title: cleanTitle(title), artist, year, kind: 'gold', x: !!x }));
    return [...hand, ...lib].filter(g => !(st.clean && g.x));
  }
  // genre guess for a throwback: borrow the tags of any current song by the same lead artist
  const ARTIST_TAGS = new Map();
  function artistTags(artist) {
    const a = String(artist).split(/,|&| feat\./i)[0].trim().toLowerCase();
    if (!ARTIST_TAGS.size) SONGS.forEach(s => { const k = String(s.artist).split(/,|&| feat\./i)[0].trim().toLowerCase(); if (!ARTIST_TAGS.has(k)) ARTIST_TAGS.set(k, s.tags); });
    return ARTIST_TAGS.get(a) || ['pop'];
  }

  // Shape of a song's run: rises from its debut to a peak, then decays. Positions are relative to the
  // week its score was measured (asOf), so every source keeps ageing correctly as the weeks go by.
  function shape(song) {
    if (song.hist) return { a: song.hist.peak, ...song.hist };
    const a = weekIndexFor(Date.parse(song.asOf + 'T12:00:00Z'));
    const debut = a + 1 - song.weeks;
    let peak, decay;
    if (song.trend === 'up') { peak = a + (song.weeks <= 2 ? 5 : 3 + Math.round(hash(song.id) * 3)); decay = 10; }
    else if (song.trend === 'hold') { peak = a + Math.round(hash(song.id + 'p') * 2) - 1; decay = 12; }
    else { peak = a - Math.max(2, Math.round(song.weeks * 0.3)); decay = 9; }
    if (peak < debut) peak = debut;
    return { a, debut, peak, decay };
  }
  function curve(sh, x) {
    if (x < sh.debut) return 0;
    if (x <= sh.peak) {
      const r = (x - sh.debut + 1) / (sh.peak - sh.debut + 1);
      return 0.2 + 0.8 * r * r * (3 - 2 * r);
    }
    return Math.exp(-(x - sh.peak) / sh.decay);
  }
  const SHAPES = new Map();
  function heat(song, x) {
    let sh = SHAPES.get(song.id);
    if (!sh) {
      sh = shape(song);
      const now = song.kind === 'plant' ? song.score : song.src === 'lib' ? 8 + 0.9 * song.score : 28 + 0.7 * song.score;
      sh.height = now / Math.max(0.05, curve(sh, sh.a));
      SHAPES.set(song.id, sh);
    }
    return sh.height * curve(sh, x);
  }
  function ageAt(song, x) { const sh = SHAPES.get(song.id) || shape(song); return x - sh.debut + 1; }

  // ----- stations -----
  const STATIONS = D.STATIONS;
  const byId = Object.fromEntries(STATIONS.map(s => [s.id, s]));

  function affinity(st, song) {
    if (song.only) return song.only.has(st.id) ? 1 : 0;
    if (st.clean && song.x) return 0;
    const w = song.tags.map(t => st.tags[t] ?? (t === 'rap' ? 0.15 : 1));
    return Math.pow(w.reduce((a, b) => a + b, 0) / w.length, 1.6) * marketFactor(st, song); // exaggerate taste so stations sound different
  }
  function newBias(st, age) {
    if (age <= 4) return 1 + st.nb;
    if (age <= 10) return 1 + st.nb * 0.4;
    if (age > 26) return 1 - st.nb * 0.5;
    return 1;
  }

  const custom = { songs: [] }; // user-imported songs (set by the app)

  // ----- music director -----
  // Every station finds its own music, automatically and the same for everyone:
  //  - adds: each week it adds up to 3 brand-new releases that fit its sound
  //  - plants: every two weeks it picks up to 2 lesser-known songs from the library to champion.
  //    About a third are "breakout" picks it pushes hard (they usually reach its Top 30); the rest get
  //    a few weeks of test spins. A song comes up for consideration at a given station once every 26 weeks.
  const MD_PERIOD = 13;
  // established artists (several throwbacks, or on the national chart) don't count as discoveries
  let ESTAB = null;
  const credits = (a) => String(a || '').split(/,|&| feat\.| x | with /i).map(x => x.trim().toLowerCase()).filter(Boolean);
  function isEstablished(artist) {
    if (!ESTAB) {
      const n = new Map(), bump = (a) => credits(a).forEach(x => n.set(x, (n.get(x) || 0) + 1));
      const seen = new Set();
      GOLD.forEach(g => { if (!seen.has(g.id)) { seen.add(g.id); bump(g.artist); } });
      Object.values(L.gold || {}).flat().forEach(([id, , artist]) => { if (!seen.has(id)) { seen.add(id); bump(artist); } });
      ESTAB = new Set([...n].filter(([, c]) => c >= 2).map(([a]) => a));
      (C.rows || []).forEach(r => credits(r[2]).forEach(x => ESTAB.add(x)));
    }
    return credits(artist).some(x => ESTAB.has(x));
  }
  const candCache = new Map(), mdMemo = new Map(), pickMemo = new Map();
  const memoPick = (key, fn) => { if (!pickMemo.has(key)) pickMemo.set(key, fn()); return pickMemo.get(key); };
  function mdCandidates(st) {
    const sig = JSON.stringify(st.tags) + st.clean + SONGS.size;
    const c = candCache.get(st.id); if (c && c.sig === sig) return c.list;
    const list = [];
    for (const s of SONGS.values()) {
      if (s.kind !== 'current' || s.only || compByKey.has(songKey(s.title, s.artist))) continue;   // not songs already on the national chart
      if (isEstablished(s.artist)) continue;
      const a = affinity(st, s); if (a < 0.85) continue;
      list.push({ s, a, known: Math.min(100, s.score ?? 50), lead: String(s.artist).split(/,|&| feat\.| x /i)[0].trim().toLowerCase() });
    }
    const slots = Array.from({ length: MD_PERIOD }, () => []);
    list.forEach(x => slots[Math.floor(hash(st.id + x.s.id) * MD_PERIOD)].push(x));
    list.slots = slots;
    candCache.set(st.id, { sig, list });
    return list;
  }
  function pickDistinct(ranked, n) {
    const out = [], seen = new Set();
    for (const r of ranked) { if (seen.has(r.lead)) continue; seen.add(r.lead); out.push(r); if (out.length >= n) break; }
    return out;
  }
  function plantPicks(st, c) { return memoPick(st.id + ':p' + c, () => {
    const slot = ((c % MD_PERIOD) + MD_PERIOD) % MD_PERIOD;
    const ranked = mdCandidates(st).slots[slot].filter(x => {
      if (x.known >= 80) return false;
      const age = ageAt(x.s, 2 * c); return age >= 0 && age <= 16;
    }).map(x => ({ ...x, w: x.a ** 1.6 * (1.25 - x.known / 100) * (0.6 + 0.8 * hash(st.id + x.s.id + ':' + c)) }))
      .sort((p, q) => q.w - p.w);
    return pickDistinct(ranked, 2).map(x => ({ song: x.s, start: 2 * c, role: hash(st.id + x.s.id + ':b' + c) < 0.35 ? 'breakout' : 'test', auto: true }));
  }); }
  function addPicks(st, x) { return memoPick(st.id + ':a' + x, () => {
    const ranked = mdCandidates(st).filter(c => { const age = ageAt(c.s, x); return age >= 1 && age <= 2; })
      .map(c => ({ ...c, w: c.a ** 2 * (0.5 + hash(st.id + c.s.id + ':a')) })).sort((p, q) => q.w - p.w);
    return pickDistinct(ranked, 3).map(c => ({ song: c.s, start: x, role: 'add', auto: true }));
  }); }
  // what the station is pushing in week x: Map songId → { song, start, role, auto }
  function director(st, x) {
    const key = st.id + ':' + x;
    if (mdMemo.has(key)) return mdMemo.get(key);
    const m = new Map();
    for (let w = x; w >= x - 5; w--) addPicks(st, w).forEach(p => { if (!m.has(p.song.id)) m.set(p.song.id, p); });
    const c0 = Math.floor(x / 2);
    for (let c = c0; c >= c0 - 6; c--) plantPicks(st, c).forEach(p => { if (x - p.start <= 13 && x >= p.start) m.set(p.song.id, p); });
    mdMemo.set(key, m);
    return m;
  }
  function boostOf(p, x) {
    const w = x - p.start;
    if (w < 0) return 0;
    if (p.role === 'breakout') return w <= 3 ? 0.3 + 0.25 * w : w <= 9 ? 1.05 : 1.05 * Math.exp(-(w - 9) / 3);
    if (p.role === 'test') return w <= 6 ? 0.4 : 0.4 * Math.exp(-(w - 6) / 2);
    return w <= 5 ? 0.3 : 0.3 * Math.exp(-(w - 5) / 2);          // add
  }
  // the station's plants this week: its hand-picked ones while they're fresh, then its own picks
  function activePlants(st, x) {
    const hand = st.plants.map(r => SONGS.get(r[0])).filter(s => s && ageAt(s, x) <= 14).map(song => ({ song, auto: false, role: 'plant' }));
    const auto = [...director(st, x).values()].filter(p => p.role !== 'add').sort((a, b) => b.start - a.start);
    return [...hand, ...auto].slice(0, 8);
  }

  function stationSpins(st, x) {
    const out = [];
    const md = director(st, x);
    for (const song of SONGS.values()) {
      const a = affinity(st, song);
      if (!a) continue;
      const h = heat(song, x);
      if (h <= 0) continue;
      const age = ageAt(song, x);
      const personal = 0.65 + 0.7 * hash(st.id + song.id);
      const noise = 0.93 + 0.14 * hash(st.id + song.id + ':' + x);
      const pick = md.get(song.id);
      const push = pick ? 1 + boostOf(pick, x) : 1;
      const spins = Math.round(0.8 * h * a * personal * noise * newBias(st, age) * push);
      if (spins >= 3) out.push({ song, spins, age });
    }
    return out.sort((p, q) => q.spins - p.spins);
  }

  const spinMemo = new Map();
  function spinsAt(st, x) {
    const key = st.id + ':' + x;
    if (!spinMemo.has(key)) spinMemo.set(key, stationSpins(st, x));
    return spinMemo.get(key);
  }
  const memo = new Map();
  function rawChart(st, x) {
    const key = st.id + ':' + x;
    if (memo.has(key)) return memo.get(key);
    // rank on this week's spins blended with last week's, so new songs climb instead of teleporting
    const prev = new Map(spinsAt(st, x - 1).map(r => [r.song.id, r.spins]));
    const ranked = spinsAt(st, x).map(r => ({ ...r, pts: 0.65 * r.spins + 0.35 * (prev.get(r.song.id) || 0) }))
      .sort((a, b) => b.pts - a.pts);
    // recurrent rule: songs 20+ weeks old leave the chart once they fall below #20
    const kept = ranked.filter((r, i) => !(r.age > 20 && i >= 20));
    // chart rules: debuts enter no higher than #15, nothing climbs more than 10 spots in a week
    const lastPos = x > EARLIEST() ? new Map(rawChart(st, x - 1).chart.map(c => [c.song.id, c.pos])) : new Map();
    const pool = kept.map(r => ({ ...r, best: lastPos.has(r.song.id) ? Math.max(1, lastPos.get(r.song.id) - 10) : 15 }));
    const chart = [];
    for (let p = 1; p <= CHART_SIZE && pool.length; p++) {
      let i = pool.findIndex(r => r.best <= p);
      if (i < 0) i = 0;
      chart.push({ pos: p, ...pool.splice(i, 1)[0] });
    }
    memo.set(key, { chart, ranked });
    return memo.get(key);
  }

  // Full countdown with LW / peak / weeks / movement, for station st at week k
  function countdown(st, k) {
    const first = k - HISTORY_WEEKS;
    const peaks = new Map(), weeks = new Map(), lastPos = new Map(), lastSpins = new Map();
    let result = null;
    for (let x = first; x <= k; x++) {
      const { chart } = rawChart(st, x);
      const spinsMap = new Map(spinsAt(st, x).map(r => [r.song.id, r.spins]));
      if (x === k) {
        result = chart.map(e => {
          const id = e.song.id;
          const lw = lastPos.get(id) ?? null;
          const wks = (weeks.get(id) || 0) + 1;
          const pk = Math.min(peaks.get(id) ?? 99, e.pos);
          const prevSpins = lastSpins.get(id) ?? 0;
          let move;
          if (lw == null) move = wks > 1 ? 'RE' : 'NEW';
          else if (lw === e.pos) move = '=';
          else move = lw > e.pos ? '▲' + (lw - e.pos) : '▼' + (e.pos - lw);
          return { ...e, lw, pk, wks, move, bullet: e.spins > prevSpins && lw != null, spinsLW: prevSpins };
        });
      }
      lastPos.clear();
      chart.forEach(e => {
        const id = e.song.id;
        lastPos.set(id, e.pos);
        weeks.set(id, (weeks.get(id) || 0) + 1);
        peaks.set(id, Math.min(peaks.get(id) ?? 99, e.pos));
      });
      lastSpins.clear();
      spinsMap.forEach((v, id) => lastSpins.set(id, v));
    }
    return result;
  }

  // Network chart: total spins across every station
  // scope 'us': the US stations (the Network Top 40) · 'world': the stations abroad (the World Top 40)
  const inScope = (st, scope) => scope === 'world' ? !!st.country && st.country !== 'us' : !st.country || st.country === 'us';
  const netMemo = new Map();
  function networkChart(k, scope = 'us') {
    const mk = scope + ':' + k; if (netMemo.has(mk)) return netMemo.get(mk);
    const tally = (x) => {
      const m = new Map();
      for (const st of STATIONS) {
        if (!inScope(st, scope)) continue;
        const { chart } = rawChart(st, x);
        const ranked = spinsAt(st, x);
        const posOf = new Map(chart.map(c => [c.song.id, c.pos]));
        ranked.forEach(r => {
          const t = m.get(r.song.id) || { song: r.song, spins: 0, stations: 0, plays: 0, by: [] };
          const pos = posOf.get(r.song.id) ?? null;
          t.spins += r.spins; t.plays++; if (pos) t.stations++;
          t.by.push({ st, spins: r.spins, pos });
          m.set(r.song.id, t);
        });
      }
      return [...m.values()].sort((a, b) => b.spins - a.spins).map((e, i) => ({ pos: i + 1, ...e }));
    };
    const peaks = new Map(), weeks = new Map();
    let last = new Map(), res = null;
    for (let x = k - HISTORY_WEEKS; x <= k; x++) {
      const all = tally(x), c = all.slice(0, NETWORK_SIZE);
      if (x === k) {
        res = c.map(e => {
          const lwp = last.get(e.song.id)?.pos; const lw = lwp && lwp <= NETWORK_SIZE ? lwp : null;
          const wks = (weeks.get(e.song.id) || 0) + 1;
          let move = lw == null ? (wks > 1 ? 'RE' : 'NEW') : lw === e.pos ? '=' : lw > e.pos ? '▲' + (lw - e.pos) : '▼' + (e.pos - lw);
          const prevBy = new Map((last.get(e.song.id)?.by || []).map(b => [b.st.id, b]));
          const by = e.by.map(b => ({ ...b, lw: prevBy.get(b.st.id)?.spins ?? 0, lwPos: prevBy.get(b.st.id)?.pos ?? null })).sort((a, b) => b.spins - a.spins);
          return { ...e, by, spinsLW: last.get(e.song.id)?.spins || 0, lw, wks, pk: Math.min(peaks.get(e.song.id) ?? 99, e.pos), move, bullet: lw != null && e.spins > (last.get(e.song.id)?.spins || 0) };
        });
      }
      last = new Map(all.map(e => [e.song.id, e]));
      c.forEach(e => { weeks.set(e.song.id, (weeks.get(e.song.id) || 0) + 1); peaks.set(e.song.id, Math.min(peaks.get(e.song.id) ?? 99, e.pos)); });
    }
    if (netMemo.size > 20) netMemo.clear();
    netMemo.set(mk, res);
    return res;
  }

  // Plant tracker for one station
  function plantReport(st, k) {
    return activePlants(st, k).map(p => {
      const song = p.song;
      const trail = [];
      for (let x = k - 5; x <= k; x++) {
        const hit = spinsAt(st, x).find(e => e.song.id === song.id);
        trail.push(hit ? hit.spins : 0);
      }
      const onChart = rawChart(st, k).chart.find(e => e.song.id === song.id);
      const rising = trail[5] >= trail[3] * 1.05;
      let status = onChart ? 'Breaking out' : rising ? 'Building' : trail[5] > 0 ? 'Testing' : 'Resting';
      return { song, trail, spins: trail[5], pos: onChart ? onChart.pos : null, status, auto: p.auto, role: p.role,
        weeksOn: p.auto ? k - p.start + 1 : Math.max(0, ageAt(song, k)) };
    });
  }

  // Rotation buckets used by the live stream
  function rotation(st, k, opts = {}) {
    const { chart } = rawChart(st, k);
    const ranked = spinsAt(st, k);
    const inChart = new Set(chart.map(c => c.song.id));
    const power = chart.filter(c => c.pos <= 8).map(c => c.song);
    const currents = chart.filter(c => c.pos > 8 && c.pos <= 20).map(c => c.song);
    const medium = chart.filter(c => c.pos > 20).map(c => c.song);
    const md = director(st, k);
    const planted = new Set(activePlants(st, k).map(p => p.song.id));
    const myAdds = [...md.values()].filter(p => p.role === 'add' && !inChart.has(p.song.id)).map(p => p.song);
    const adds = [...new Set([...myAdds, ...ranked.filter(r => !inChart.has(r.song.id) && !planted.has(r.song.id) && r.song.kind === 'current' && r.age <= 4).map(r => r.song)])];
    const recurrents = ranked.filter(r => !inChart.has(r.song.id) && r.song.kind === 'current' && r.age > 26).slice(0, 15).map(r => r.song);
    const deep = ranked.filter(r => !inChart.has(r.song.id) && r.song.kind === 'current' && r.age > 4 && r.age <= 26).slice(0, 40).map(r => r.song);
    const plants = activePlants(st, k).filter(p => !inChart.has(p.song.id)).map(p => p.song);
    const gold = goldFor(st);
    const mine = custom.songs.filter(s => s.station === st.id && !(st.clean && s.x) && (!opts.broadcast || s.pub));
    mine.forEach(s => {
      if (s.kind === 'gold') gold.push(s);
      else if (s.kind === 'plant') plants.push(s);
      else adds.push(s);
    });
    return { power, currents, medium, adds, deep, recurrents, plants, gold };
  }

  // ----- song lengths (for the shared broadcast schedule) -----
  const DUR = root.RADIO_DURATIONS || {};
  function durationOf(song) {
    return DUR[song.id] || L.durations?.[song.id] || L.durationsByKey?.[songKey(song.title, song.artist)] || 210000;
  }

  // ----- stations built in the app -----
  function clearStation(id) {
    for (const m of [memo, spinMemo, mdMemo]) for (const k of [...m.keys()]) if (k.startsWith(id + ':')) m.delete(k);
    goldCache.delete(id); candCache.delete(id); netMemo.clear();
    for (const k of [...pickMemo.keys()]) if (k.startsWith(id + ':')) pickMemo.delete(k);
  }
  function addStation(st) {
    st.custom = true; st.gold = st.gold || []; st.plants = st.plants || []; st.home = st.home || [];
    removeStation(st.id, true);
    STATIONS.push(st); byId[st.id] = st;
    st.plants.forEach(r => {
      const have = SONGS.get(r[0]);
      if (have?.only) have.only.add(st.id);            // already a plant somewhere else: share it
      else if (!have) { const s = mkSong(r, 'plant', 'seed', st.id); SONGS.set(s.id, s); }
    });
    clearStation(st.id);
    return st;
  }
  function removeStation(id, keepPlants) {
    const i = STATIONS.findIndex(s => s.id === id);
    if (i < 0 || !STATIONS[i].custom) return;
    STATIONS[i].plants.forEach(r => { const s = SONGS.get(r[0]); if (s?.only) { s.only.delete(id); if (!s.only.size) SONGS.delete(r[0]); } });
    STATIONS.splice(i, 1); delete byId[id]; clearStation(id);
  }
  // quick Top-N for a station that isn't saved yet (builder preview)
  function previewChart(st, n = 10) {
    const tmp = { ...st, id: st.id || 'preview' };
    return stationSpins(tmp, Math.max(0, weekIndexFor(Date.now()))).filter(r => r.song.kind === 'current').slice(0, n);
  }

  root.RadioEngine = {
    addStation, removeStation, previewChart, durationOf, songKey,
    STATIONS, byId, SONGS, GOLD, goldFor, custom, AUTO: A, LIBRARY: L, COMPOSITE: C, compositeChart, CHART_SIZE, NETWORK_SIZE,
    weekIndexFor, weekEnding, countdown, isEstablished, FIRST_WEEK, inScope, networkReady: (k, scope = 'us') => netMemo.has(scope + ':' + k), networkChart, plantReport, rotation, stationSpins, hash,
    nowWeek: () => Math.max(0, weekIndexFor(Date.now())),
  };
})(typeof window !== 'undefined' ? window : globalThis);
