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
  const EARLIEST = () => Math.max(0, weekIndexFor(Date.now())) - 50;
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
  (A.songs || []).forEach(r => addSong(mkSong(r, 'current', 'auto')));
  // Daniel's US New Music Chart: its score is the main signal for any song it ranks
  const C = root.RADIO_COMPOSITE || { rows: [] };
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
    return Math.pow(w.reduce((a, b) => a + b, 0) / w.length, 1.6); // exaggerate taste so stations sound different
  }
  function newBias(st, age) {
    if (age <= 4) return 1 + st.nb;
    if (age <= 10) return 1 + st.nb * 0.4;
    if (age > 26) return 1 - st.nb * 0.5;
    return 1;
  }

  const custom = { songs: [] }; // user-imported songs (set by the app)

  function stationSpins(st, x) {
    const out = [];
    for (const song of SONGS.values()) {
      const a = affinity(st, song);
      if (!a) continue;
      const h = heat(song, x);
      if (h <= 0) continue;
      const age = ageAt(song, x);
      const personal = 0.65 + 0.7 * hash(st.id + song.id);
      const noise = 0.93 + 0.14 * hash(st.id + song.id + ':' + x);
      const spins = Math.round(0.8 * h * a * personal * noise * newBias(st, age));
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
  function networkChart(k) {
    const tally = (x) => {
      const m = new Map();
      for (const st of STATIONS) {
        const { chart } = rawChart(st, x);
        const ranked = spinsAt(st, x);
        const onChart = new Set(chart.map(c => c.song.id));
        ranked.forEach(r => {
          const t = m.get(r.song.id) || { song: r.song, spins: 0, stations: 0 };
          t.spins += r.spins; if (onChart.has(r.song.id)) t.stations++;
          m.set(r.song.id, t);
        });
      }
      return [...m.values()].sort((a, b) => b.spins - a.spins).slice(0, NETWORK_SIZE).map((e, i) => ({ pos: i + 1, ...e }));
    };
    const peaks = new Map(), weeks = new Map();
    let last = new Map(), res = null;
    for (let x = k - HISTORY_WEEKS; x <= k; x++) {
      const c = tally(x);
      if (x === k) {
        res = c.map(e => {
          const lw = last.get(e.song.id)?.pos ?? null;
          const wks = (weeks.get(e.song.id) || 0) + 1;
          let move = lw == null ? (wks > 1 ? 'RE' : 'NEW') : lw === e.pos ? '=' : lw > e.pos ? '▲' + (lw - e.pos) : '▼' + (e.pos - lw);
          return { ...e, lw, wks, pk: Math.min(peaks.get(e.song.id) ?? 99, e.pos), move, bullet: lw != null && e.spins > (last.get(e.song.id)?.spins || 0) };
        });
      }
      last = new Map(c.map(e => [e.song.id, e]));
      c.forEach(e => { weeks.set(e.song.id, (weeks.get(e.song.id) || 0) + 1); peaks.set(e.song.id, Math.min(peaks.get(e.song.id) ?? 99, e.pos)); });
    }
    return res;
  }

  // Plant tracker for one station
  function plantReport(st, k) {
    return st.plants.map(r => {
      const song = SONGS.get(r[0]);
      const trail = [];
      for (let x = k - 5; x <= k; x++) {
        const hit = spinsAt(st, x).find(e => e.song.id === song.id);
        trail.push(hit ? hit.spins : 0);
      }
      const onChart = rawChart(st, k).chart.find(e => e.song.id === song.id);
      const rising = trail[5] >= trail[3] * 1.05;
      let status = onChart ? 'Breaking out' : rising ? 'Building' : trail[5] > 0 ? 'Testing' : 'Resting';
      return { song, trail, spins: trail[5], pos: onChart ? onChart.pos : null, status, weeksOn: Math.max(0, ageAt(song, k)) };
    });
  }

  // Rotation buckets used by the live stream
  function rotation(st, k) {
    const { chart } = rawChart(st, k);
    const ranked = spinsAt(st, k);
    const inChart = new Set(chart.map(c => c.song.id));
    const power = chart.filter(c => c.pos <= 8).map(c => c.song);
    const currents = chart.filter(c => c.pos > 8 && c.pos <= 20).map(c => c.song);
    const medium = chart.filter(c => c.pos > 20).map(c => c.song);
    const adds = ranked.filter(r => !inChart.has(r.song.id) && r.song.kind === 'current' && r.age <= 4).map(r => r.song);
    const recurrents = ranked.filter(r => !inChart.has(r.song.id) && r.song.kind === 'current' && r.age > 26).slice(0, 15).map(r => r.song);
    const deep = ranked.filter(r => !inChart.has(r.song.id) && r.song.kind === 'current' && r.age > 4 && r.age <= 26).slice(0, 40).map(r => r.song);
    const plants = st.plants.map(p => SONGS.get(p[0]));
    const gold = goldFor(st);
    const mine = custom.songs.filter(s => s.station === st.id && !(st.clean && s.x));
    mine.forEach(s => {
      if (s.kind === 'gold') gold.push(s);
      else if (s.kind === 'plant') plants.push(s);
      else adds.push(s);
    });
    return { power, currents, medium, adds, deep, recurrents, plants, gold };
  }

  // ----- stations built in the app -----
  function clearStation(id) {
    for (const m of [memo, spinMemo]) for (const k of [...m.keys()]) if (k.startsWith(id + ':')) m.delete(k);
    goldCache.delete(id);
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
    addStation, removeStation, previewChart,
    STATIONS, byId, SONGS, GOLD, goldFor, custom, AUTO: A, LIBRARY: L, COMPOSITE: C, compositeChart, CHART_SIZE, NETWORK_SIZE,
    weekIndexFor, weekEnding, countdown, networkChart, plantReport, rotation, stationSpins, hash,
    nowWeek: () => Math.max(0, weekIndexFor(Date.now())),
  };
})(typeof window !== 'undefined' ? window : globalThis);
