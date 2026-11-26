/* Station builder autopilot: from a spot on the map (and an optional description), invent a whole
   station — sound, name, call letters, slogan, about, signature throwback artists and plants. */
{
  const E = window.RadioEngine;
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const jitter = (v, amt = 0.12) => Math.max(0, +(v * (1 + (Math.random() * 2 - 1) * amt)).toFixed(2));
  const first = (a) => String(a || '').split(/,|&| x | feat\.?| ft\.?| with /i)[0].trim();

  // ---------- formats ----------
  const FORMATS = {
    'Top 40':      { tags: { pop: 1.2, dance: 1.1, rnb: 1, indie: 0.9, alt: 0.9, latin: 0.9, country: 0.8, kpop: 1, rap: 0.3 }, nb: [0.3, 0.45],
      desc: 'the biggest new pop songs alongside the ones about to be big', slogans: ["{city}'s #1 for New Music", "Today's Hits, {city}'s Hits", 'All the Hits, All the Time', 'New Music First'] },
    'Rhythmic':    { tags: { pop: 0.9, dance: 1.4, rnb: 1.6, indie: 0.6, alt: 0.5, latin: 1.2, country: 0.3, kpop: 1, rap: 1.1 }, nb: [0.3, 0.5],
      desc: 'R&B, hip-hop and dance-floor pop', slogans: ["{city}'s Rhythm", 'Hits With a Beat', "{city}'s R&B and Hip-Hop"] },
    'Hot AC':      { tags: { pop: 1.2, dance: 0.8, rnb: 0.9, indie: 1.2, alt: 1.1, latin: 0.5, country: 0.9, kpop: 0.5, rap: 0.05 }, nb: [0.2, 0.35],
      desc: 'a feel-good mix of new pop and the best songs of the last fifteen years', slogans: ['The Best Variety of New Music', "{city}'s Feel-Good Station", 'Better Music, More of It'] },
    'Alt pop':     { tags: { pop: 0.9, dance: 0.8, rnb: 0.8, indie: 1.4, alt: 1.7, latin: 0.5, country: 0.7, kpop: 0.6, rap: 0.1 }, nb: [0.35, 0.55],
      desc: 'alternative and left-of-center pop', slogans: ["{city}'s Alternative", 'Pop, Turned Left', 'The Other Side of Pop'] },
    'Indie':       { tags: { pop: 0.8, dance: 0.7, rnb: 1, indie: 1.9, alt: 1.3, latin: 0.5, country: 0.9, kpop: 0.5, rap: 0.1 }, nb: [0.45, 0.65],
      desc: 'indie pop and singer-songwriters you won\'t hear anywhere else', slogans: ['Discover Something New', "{city}'s Independent Sound", 'Hear It Here First'] },
    'Dance':       { tags: { pop: 1, dance: 2, rnb: 1.1, indie: 0.7, alt: 0.7, latin: 1.1, country: 0.3, kpop: 1.1, rap: 0.3 }, nb: [0.35, 0.55],
      desc: 'dance pop, house-leaning hits and club crossovers', slogans: ['{city} Moves', 'Pure Dance Pop', 'Turn It Up, {city}'] },
    'Latin pop':   { tags: { pop: 0.9, dance: 1.2, rnb: 1, indie: 0.5, alt: 0.4, latin: 2.4, country: 0.3, kpop: 0.8, rap: 0.4 }, nb: [0.3, 0.5],
      desc: 'Latin pop and reggaeton mixed with the biggest pop hits', slogans: ['Latin Pop and More', "{city}'s Latin Hits", 'Pop, Latin Style'] },
    'Country pop': { tags: { pop: 1, dance: 0.5, rnb: 0.7, indie: 1.1, alt: 0.9, latin: 0.5, country: 2.2, kpop: 0.4, rap: 0.1 }, nb: [0.25, 0.45],
      desc: 'country-leaning pop, where Nashville meets the Top 40', slogans: ['Where Pop Meets Country', "{city}'s Country Pop", 'Hits With Heart'] },
    'K-pop':       { tags: { pop: 1, dance: 1.2, rnb: 1, indie: 0.7, alt: 0.7, latin: 0.8, country: 0.3, kpop: 2.4, rap: 0.3 }, nb: [0.4, 0.6],
      desc: 'K-pop and global pop next to the American hits', slogans: ["{city}'s Global Pop", 'Pop Without Borders', 'The World\'s Hits'] },
  };

  // which formats a region leans toward (others still possible)
  const LATIN = ['TX', 'AZ', 'NM', 'CA', 'FL', 'NV', 'NJ', 'NY', 'IL', 'CO'];
  const COUNTRY = ['TN', 'KY', 'AL', 'MS', 'AR', 'OK', 'KS', 'NE', 'SD', 'ND', 'MT', 'WY', 'ID', 'TX', 'GA', 'SC', 'NC', 'WV', 'MO', 'IA', 'LA'];
  const INDIE = ['WA', 'OR', 'VT', 'ME', 'MA', 'MN', 'WI', 'CO', 'MI', 'NH', 'RI', 'MT'];
  const RHYTHM = ['GA', 'MD', 'DC', 'LA', 'MS', 'NY', 'IL', 'MI', 'TN', 'TX', 'FL', 'NC', 'VA', 'OH'];

  // ---------- naming ----------
  const STATE_WORDS = {
    AL: ['Magnolia', 'Yellowhammer', 'Gulf'], AK: ['Northern Lights', 'Glacier', 'Tundra'], AZ: ['Saguaro', 'Sonoran', 'Copper', 'Mesa'], AR: ['Ozark', 'Diamond', 'Natural'],
    CA: ['Golden', 'Sunset', 'Coast', 'Poppy'], CO: ['Summit', 'Aspen', 'Peak', 'Columbine'], CT: ['Nutmeg', 'Charter', 'Sound'], DE: ['First State', 'Bay'], DC: ['Capital', 'Monument'],
    FL: ['Sunshine', 'Palm', 'Gulf', 'Coral'], GA: ['Peach', 'Magnolia', 'Southern'], HI: ['Island', 'Aloha', 'Trade Wind'], ID: ['Gem', 'Sawtooth', 'Snake River'],
    IL: ['Prairie', 'Lakefront', 'Windy'], IN: ['Hoosier', 'Crossroads', 'Dune'], IA: ['Hawkeye', 'Prairie', 'Heartland'], KS: ['Sunflower', 'Prairie', 'Plains'],
    KY: ['Bluegrass', 'Derby', 'Limestone'], LA: ['Bayou', 'Crescent', 'Pelican'], ME: ['Pine', 'Harbor', 'Lighthouse'], MD: ['Chesapeake', 'Harbor', 'Old Line'],
    MA: ['Bay State', 'Harbor', 'Cape'], MI: ['Great Lakes', 'Mitten', 'Lakeshore'], MN: ['North Star', 'Loon', 'Lakes'], MS: ['Magnolia', 'Delta', 'River'],
    MO: ['Gateway', 'Show Me', 'Ozark'], MT: ['Big Sky', 'Treasure', 'Glacier'], NE: ['Cornhusker', 'Prairie', 'Platte'], NV: ['Silver', 'Neon', 'High Desert'],
    NH: ['Granite', 'White Mountain'], NJ: ['Garden', 'Shore', 'Boardwalk'], NM: ['Zia', 'Enchanted', 'Turquoise', 'Mesa'], NY: ['Empire', 'Metro', 'Hudson', 'Skyline'],
    NC: ['Tar Heel', 'Blue Ridge', 'Piedmont'], ND: ['Prairie', 'Badlands', 'Flickertail'], OH: ['Buckeye', 'Lakefront', 'Heartland'], OK: ['Sooner', 'Red Dirt', 'Prairie'],
    OR: ['Rose', 'Cascade', 'Evergreen', 'Timber'], PA: ['Keystone', 'Liberty', 'Three Rivers'], RI: ['Ocean State', 'Harbor'], SC: ['Palmetto', 'Lowcountry', 'Coast'],
    SD: ['Black Hills', 'Prairie', 'Badlands'], TN: ['Volunteer', 'Smoky', 'River'], TX: ['Lone Star', 'Bluebonnet', 'Big Sky'], UT: ['Wasatch', 'Beehive', 'Red Rock', 'Canyon'],
    VT: ['Green Mountain', 'Maple'], VA: ['Old Dominion', 'Blue Ridge', 'Tidewater'], WA: ['Evergreen', 'Cascade', 'Rain', 'Sound'], WV: ['Mountain', 'Ridge'],
    WI: ['Badger', 'Lakeshore', 'Northwoods'], WY: ['Cowboy', 'Big Sky', 'Teton'],
  };
  const GENERIC = ['Pulse', 'Spark', 'Echo', 'Signal', 'Current', 'Bloom', 'Glow', 'Horizon', 'Nova', 'Prism', 'Radius', 'Vibe', 'Neon', 'Lumen', 'Static', 'Orbit', 'Velvet', 'Comet', 'Wave', 'Hive'];
  const FORMAT_WORDS = { 'Dance': ['Pulse', 'Neon', 'Velvet', 'Orbit'], 'Indie': ['Static', 'Bloom', 'Echo', 'Lumen'], 'Alt pop': ['Static', 'Echo', 'Radius'],
    'Rhythmic': ['Vibe', 'Hive', 'Velvet', 'Current'], 'Latin pop': ['Sol', 'Fuego', 'Ritmo', 'Luna'], 'Country pop': ['Horizon', 'Highway', 'Front Porch', 'Prairie'],
    'K-pop': ['Prism', 'Nova', 'Comet', 'Orbit'] };
  const COLORS = ['#ff8a3d', '#2ee6c8', '#ff3d8b', '#ffd23d', '#4da3ff', '#c46bff', '#b8f05c', '#ff5a5a', '#5ce1e6', '#ff4fd8'];

  const km = (a, b) => { const R = 6371, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  const tagDist = (a, b) => Object.keys(a).reduce((t, k) => t + Math.abs((a[k] ?? 1) - (b[k] ?? 1)), 0);

  // ---------- "describe it" keywords ----------
  const WORDS = [
    [/\b(edm|club|dance|house|techno)\b/i, { dance: 0.9 }], [/\b(r&b|rnb|soul|slow jams?)\b/i, { rnb: 0.9 }], [/\b(hip ?hop|rap|trap)\b/i, { rap: 1.2, rnb: 0.3 }],
    [/\b(indie|singer.?songwriter|bedroom)\b/i, { indie: 0.9 }], [/\b(alt|alternative|rock|emo|punk)\b/i, { alt: 0.9 }], [/\b(latin|reggaeton|spanish|regional mexican)\b/i, { latin: 1.2 }],
    [/\b(country|nashville|americana|folk)\b/i, { country: 1.1 }], [/\b(k.?pop|korean|j.?pop)\b/i, { kpop: 1.3 }], [/\bpop\b/i, { pop: 0.3 }],
  ];
  function readDescription(text) {
    const t = String(text || ''), add = {}; let any = false;
    WORDS.forEach(([re, bump]) => { if (re.test(t)) { any = true; Object.entries(bump).forEach(([k, v]) => { add[k] = (add[k] || 0) + v; }); } });
    const not = {}; t.replace(/\b(?:no|without|less|not much)\s+([a-z&-]+)/gi, (_, w) => { WORDS.forEach(([re, bump]) => { if (re.test(w)) Object.keys(bump).forEach(k => { not[k] = true; }); }); });
    return {
      any, add, not,
      clean: /\b(clean|family|kid|no explicit)\b/i.test(t) || null,
      nb: /\b(new music|brand new|discovery|fresh|emerging|underground)\b/i.test(t) ? 0.6 : /\b(throwbacks?|old ?school|classics|gold|nostalgi)/i.test(t) ? 0.2 : null,
    };
  }

  // ---------- pick a format ----------
  function chooseFormat(d, desc) {
    const st = String(d.state || '').toUpperCase();
    const near = E.STATIONS.filter(s => s.id !== d.id && km(s, d) < 450);
    const w = {};
    Object.entries(FORMATS).forEach(([name, f]) => {
      let x = 1;
      if (name === 'Top 40') x = 1.6;
      if (name === 'Hot AC') x = 1.2;
      if (name === 'K-pop') x = 0.35;
      if (LATIN.includes(st) && name === 'Latin pop') x *= 2.2;
      if (COUNTRY.includes(st) && name === 'Country pop') x *= 2.2;
      if (INDIE.includes(st) && (name === 'Indie' || name === 'Alt pop')) x *= 2;
      if (RHYTHM.includes(st) && name === 'Rhythmic') x *= 2;
      // stand out from stations nearby
      near.forEach(s => { if (tagDist(s.tags, f.tags) < 2.2) x *= 0.45; });
      // a description steers hard
      if (desc?.any) { const fit = Object.entries(desc.add).reduce((t, [k, v]) => t + (f.tags[k] ?? 1) * v, 0); x *= 0.3 + fit; }
      w[name] = x;
    });
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const [k, v] of Object.entries(w)) { r -= v; if (r <= 0) return k; }
    return 'Top 40';
  }

  function makeTags(format, desc) {
    const tags = {};
    Object.entries(FORMATS[format].tags).forEach(([k, v]) => { tags[k] = jitter(v); });
    if (desc) {
      Object.entries(desc.add).forEach(([k, v]) => { tags[k] = +Math.min(2.5, (tags[k] ?? 1) + v * 0.8).toFixed(2); });
      Object.keys(desc.not).forEach(k => { tags[k] = k === 'rap' ? 0 : 0.2; });
    }
    return tags;
  }

  // ---------- names ----------
  function chooseName(d, format) {
    const st = String(d.state || '').toUpperCase(), used = new Set(E.STATIONS.map(s => s.name.replace(/\s*[\d.]+$/, '').toLowerCase()));
    const city = String(d.city || '').trim();
    const pool = [
      ...(STATE_WORDS[st] || []).map(x => [x, 3]),
      ...(FORMAT_WORDS[format] || []).map(x => [x, 2]),
      ...GENERIC.map(x => [x, 1]),
      ...(city && city.length <= 9 && !/\s/.test(city) ? [[city, 1.5]] : []),
    ].filter(([x]) => !used.has(x.toLowerCase()));
    let r = Math.random() * pool.reduce((t, [, v]) => t + v, 0);
    for (const [x, v] of pool) { r -= v; if (r <= 0) return x; }
    return rnd(GENERIC);
  }
  function callFor(word, lon) {
    const pre = lon < -90.1 ? 'K' : 'W', taken = new Set(E.STATIONS.map(s => s.call));
    const letters = word.toUpperCase().replace(/[^A-Z]/g, '');
    const cons = letters[0] + letters.slice(1).replace(/[AEIOU]/g, '');
    const tries = [cons.slice(0, 3), letters.slice(0, 3), (cons[0] + cons.slice(-2)), cons.slice(0, 2) + letters.slice(-1)];
    for (const t of tries) if (t.length === 3 && !taken.has(pre + t)) return pre + t;
    const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (let i = 0; i < 60; i++) { const c = pre + letters[0] + L[Math.floor(Math.random() * 26)] + L[Math.floor(Math.random() * 26)]; if (!taken.has(c)) return c; }
    return pre + 'NEW';
  }
  function chooseFreq(d) {
    const taken = new Set(E.STATIONS.filter(s => s.id !== d.id && km(s, d) < 250).map(s => s.freq.split(' ')[0]));
    const open = []; for (let f = 921; f <= 1079; f += 2) { const v = (f / 10).toFixed(1); if (!taken.has(v)) open.push(v); }
    return rnd(open.length ? open : ['99.9']);
  }
  function chooseColor(d) {
    const near = E.STATIONS.filter(s => s.id !== d.id).sort((a, b) => km(a, d) - km(b, d)).slice(0, 4).map(s => s.color);
    const free = COLORS.filter(c => !near.includes(c));
    return rnd(free.length ? free : COLORS);
  }

  // ---------- music: signature artists and plants ----------
  const aff = (tags, st) => tags.reduce((t, x) => t + (st.tags[x] ?? 1), 0) / Math.max(1, tags.length);
  function chooseHome(d, n = 3) {
    const pool = E.goldFor({ id: 'auto-' + Math.random().toString(36).slice(2), custom: true, tags: d.tags, home: [], clean: d.clean });
    const score = new Map();
    pool.forEach((g, i) => { const a = first(g.artist); score.set(a, (score.get(a) || 0) + (pool.length - i)); });
    const ranked = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const out = [];
    while (out.length < n && ranked.length) {
      let r = Math.random() * ranked.reduce((t, [, v]) => t + v, 0);
      const i = ranked.findIndex(([, v]) => (r -= v) <= 0);
      out.push(ranked.splice(Math.max(0, i), 1)[0][0]);
    }
    return out;
  }
  function choosePlants(d, n = 5) {
    const onChart = new Set(E.previewChart({ id: d.id || 'auto', tags: d.tags, nb: d.nb, clean: d.clean, plants: [] }, 30).map(r => r.song.id));
    const per = new Map();
    E.SONGS.forEach(s => { const a = first(s.artist).toLowerCase(); per.set(a, (per.get(a) || 0) + 1); });
    const homes = new Set((d.home || []).map(h => h.toLowerCase()));
    const cands = [...E.SONGS.values()].filter(s =>
      (s.src === 'lib' || s.kind === 'plant') && s.src !== 'composite' && !onChart.has(s.id) && !(d.clean && s.x) && !homes.has(first(s.artist).toLowerCase()));
    const ranked = cands.map(s => {
      const lesserKnown = 1 / Math.min(4, per.get(first(s.artist).toLowerCase()) || 1);
      const quiet = s.kind === 'plant' ? 1 : 1.4 - Math.min(100, s.score || 50) / 100;
      return [aff(s.tags, d) ** 1.6 * lesserKnown * quiet * (0.5 + Math.random()), s];
    }).sort((a, b) => b[0] - a[0]);
    // draw from the best ~30 fits, weighted, so every roll gives a different set
    const pool = []; const seenA = new Set();
    for (const r of ranked) { const a = first(r[1].artist).toLowerCase(); if (seenA.has(a)) continue; seenA.add(a); pool.push(r); if (pool.length >= 30) break; }
    const out = [];
    while (out.length < n && pool.length) {
      let r = Math.random() * pool.reduce((t, x) => t + x[0], 0);
      const i = pool.findIndex(x => (r -= x[0]) <= 0);
      out.push(pool.splice(Math.max(0, i), 1)[0][1]);
    }
    // the breakout slot goes to the strongest fit of the five
    out.sort((x, y) => aff(y.tags, d) - aff(x.tags, d));
    return out.map((s, i) => [s.id, s.title, s.artist, s.tags.join(' '), i === 0 ? 46 : 12 + Math.round(Math.random() * 10), i === 0 ? 3 : 1 + Math.round(Math.random()), 'up']);
  }

  // ---------- words ----------
  function slogan(format, city) {
    const opts = FORMATS[format].slogans.filter(x => city || !x.includes('{city}'));
    return rnd(opts.length ? opts : ['New Music First']).replace(/\{city\}/g, city);
  }
  function about(d, format) {
    const name = d.name, city = d.city || 'its hometown';
    const homes = d.home.slice(0, 3), plants = d.plants.slice(0, 2).map(p => first(p[2]));
    const list = (a) => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];
    const lines = [
      rnd([`${name} broadcasts from ${city} with ${FORMATS[format].desc}.`, `From ${city}, ${name} plays ${FORMATS[format].desc}.`, `${name} is ${city}'s home for ${FORMATS[format].desc}.`]),
      homes.length ? rnd([`Throwbacks lean on ${list(homes)}.`, `When it digs into the archive, expect ${list(homes)}.`, `Its throwback hours belong to ${list(homes)}.`]) : '',
      plants.length ? rnd([`Right now it's championing ${list(plants)} before anyone else.`, `Listen for early spins from ${list(plants)}.`, `It was first on ${list(plants)}.`]) : '',
      d.nb >= 0.5 ? 'More new music per hour than any station around it.' : d.nb <= 0.25 ? 'Fewer new songs, more favorites.' : '',
      d.clean ? 'Every song is the clean version.' : '',
    ];
    return lines.filter(Boolean).join(' ');
  }

  // build (or partly rebuild) a station. `only` limits which parts change: 'all' | 'name' | 'home' | 'plants' | 'words'
  function generate(d, { describe = '', only = 'all' } = {}) {
    const desc = readDescription(describe);
    if (only === 'all') {
      d.format = chooseFormat(d, desc);
      d.tags = makeTags(d.format, desc);
      const [lo, hi] = FORMATS[d.format].nb; d.nb = desc.nb ?? +(lo + Math.random() * (hi - lo)).toFixed(2);
      d.clean = desc.clean ?? (String(d.state).toUpperCase() === 'UT' || Math.random() < 0.08);
      d.color = chooseColor(d); d.freq = chooseFreq(d);
    }
    if (only === 'all' || only === 'name') {
      const word = chooseName(d, d.format || 'Top 40');
      d.call = callFor(word, d.lon);
      d.name = `${word} ${d.freq}`;
    }
    if (only === 'all' || only === 'home') d.home = chooseHome(d);
    if (only === 'all' || only === 'plants') d.plants = choosePlants(d);
    if (only === 'all' || only === 'name' || !d.slogan) d.slogan = slogan(d.format || 'Top 40', d.city);
    d.about = about(d, d.format || 'Top 40');
    return d;
  }

  window.RadioAuto = { generate, FORMATS, readDescription };
}
