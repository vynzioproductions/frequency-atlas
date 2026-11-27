/* Station imaging: no hosts, just IDs. Each station has one imaging voice, its own
   sonic logo built from its frequency, and a set of IDs: legal IDs at the top of the hour,
   positioners, new-music and discovery sweepers, throwback drops, and countdown drops. */
{
  const E = window.RadioEngine;
  const TZ = {
    tucson: 'America/Phoenix', phoenix: 'America/Phoenix', la: 'America/Los_Angeles', sf: 'America/Los_Angeles', seattle: 'America/Los_Angeles',
    vegas: 'America/Los_Angeles', denver: 'America/Denver', slc: 'America/Denver', dallas: 'America/Chicago', chicago: 'America/Chicago',
    nashville: 'America/Chicago', minneapolis: 'America/Chicago', nyc: 'America/New_York', miami: 'America/New_York', atlanta: 'America/New_York', boston: 'America/New_York',
  };
  // picks use a swappable random source so the broadcast schedule can make them identical for everyone
  let rand = Math.random;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  function seeded(rng, fn) { const old = rand; rand = rng; try { return fn(); } finally { rand = old; } }

  function localTime(st) {
    const tz = st.tz || TZ[st.id] || 'America/Phoenix';
    const d = new Date();
    const text = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
    const hour = +new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(d) % 24;
    return { text, hour };
  }
  const base = (st) => st.name.replace(/^the /i, '').replace(/\s*[\d.]+(\s*fm)?$/i, '').trim();
  function chartName(st) { return base(st) + ' 30'; }
  const spell = (call) => call.split('').join(' ');                 // "K S G R" so voices don't read it as a word
  const dial = (st) => st.freq.split(' ')[0].replace('.', ` ${speaksLocal(st) ? T(st).point : 'point'} `);

  // ---------- languages ----------
  // Stations in Spanish, Portuguese, French, German and Italian-speaking cities do their IDs in that
  // language (if the device has a voice for it); everywhere else uses English, as many stations there do.
  const L10N = {
    es: { listening: (n) => `Estás escuchando ${n}.`, newOn: (n) => `Lo nuevo, en ${n}.`, first: (n) => `Primero en ${n}.`, discovery: (n) => `${n} te lo presentó primero.`, throwback: (n) => `Un clásico en ${n}.`, back: (y, n) => `Regresamos a ${y}. ${n}.`, biggest: (n, c) => `${n}. Lo más grande de ${c}.`, cdOpen: (c, n) => `El ${c}. Lo más escuchado esta semana en ${n}, del treinta al uno.`, num: (p) => `Número ${p}.`, numNew: (p) => `Número ${p}. Nuevo esta semana.`, one: 'Y la número uno de la semana.', cdClose: (c, n) => `Eso fue el ${c}. ${n}.`, point: 'punto' },
    pt: { listening: (n) => `Você está ouvindo ${n}.`, newOn: (n) => `Novidade na ${n}.`, first: (n) => `Primeiro na ${n}.`, discovery: (n) => `Você ouviu primeiro na ${n}.`, throwback: (n) => `Relembrando na ${n}.`, back: (y, n) => `De volta a ${y}. ${n}.`, biggest: (n, c) => `${n}. Os maiores sucessos de ${c}.`, cdOpen: (c, n) => `${c}. As mais tocadas da semana na ${n}, da trinta à um.`, num: (p) => `Número ${p}.`, numNew: (p) => `Número ${p}. Novidade da semana.`, one: 'E a número um da semana.', cdClose: (c, n) => `Esse foi o ${c}. ${n}.`, point: 'ponto' },
    fr: { listening: (n) => `Vous écoutez ${n}.`, newOn: (n) => `Nouveauté sur ${n}.`, first: (n) => `D'abord sur ${n}.`, discovery: (n) => `Découverte ${n}.`, throwback: (n) => `Un classique sur ${n}.`, back: (y, n) => `Retour en ${y}. ${n}.`, biggest: (n, c) => `${n}. Les plus gros tubes de ${c}.`, cdOpen: (c, n) => `Le ${c}. Les titres les plus joués cette semaine sur ${n}, de trente à un.`, num: (p) => `Numéro ${p}.`, numNew: (p) => `Numéro ${p}. Nouveau cette semaine.`, one: 'Et le numéro un de la semaine.', cdClose: (c, n) => `C'était le ${c}. ${n}.`, point: 'point' },
    de: { listening: (n) => `Du hörst ${n}.`, newOn: (n) => `Neu auf ${n}.`, first: (n) => `Zuerst auf ${n}.`, discovery: (n) => `${n} Entdeckung.`, throwback: (n) => `Ein Klassiker auf ${n}.`, back: (y, n) => `Zurück ins Jahr ${y}. ${n}.`, biggest: (n, c) => `${n}. Die größten Hits in ${c}.`, cdOpen: (c, n) => `Die ${c}. Die meistgespielten Songs der Woche auf ${n}, von dreißig bis eins.`, num: (p) => `Platz ${p}.`, numNew: (p) => `Platz ${p}. Neu in dieser Woche.`, one: 'Und die Nummer eins der Woche.', cdClose: (c, n) => `Das waren die ${c}. ${n}.`, point: 'Komma' },
    it: { listening: (n) => `State ascoltando ${n}.`, newOn: (n) => `Novità su ${n}.`, first: (n) => `Prima su ${n}.`, discovery: (n) => `Scoperta di ${n}.`, throwback: (n) => `Un classico su ${n}.`, back: (y, n) => `Torniamo al ${y}. ${n}.`, biggest: (n, c) => `${n}. Le hit più grandi di ${c}.`, cdOpen: (c, n) => `La ${c}. I brani più suonati della settimana su ${n}, dal trenta all'uno.`, num: (p) => `Numero ${p}.`, numNew: (p) => `Numero ${p}. Nuova questa settimana.`, one: 'E il numero uno della settimana.', cdClose: (c, n) => `Questa era la ${c}. ${n}.`, point: 'punto' },
  };
  const langOf = (st) => String(st.lang || 'en').slice(0, 2).toLowerCase();
  const T = (st) => L10N[langOf(st)] || null;

  // ---------- one imaging voice per station ----------
  let voices = [], allVoices = [];
  const loadVoices = () => { try { allVoices = speechSynthesis.getVoices(); voices = allVoices.filter(v => /^en(-|_|$)/i.test(v.lang)); } catch { voices = []; } };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  // a station speaks its own language only if this device has a voice for it
  const speaksLocal = (st) => { if (!T(st)) return false; if (!allVoices.length) loadVoices(); return allVoices.some(v => v.lang.toLowerCase().startsWith(langOf(st))); };
  function voiceFor(st) {
    if (!voices.length) loadVoices();
    if (speaksLocal(st)) {
      const want = String(st.lang).toLowerCase().replace('_', '-');
      const local = allVoices.filter(v => v.lang.toLowerCase().replace('_', '-') === want);
      const pool = local.length ? local : allVoices.filter(v => v.lang.toLowerCase().startsWith(langOf(st)));
      return { voice: pool[Math.floor(E.hash(st.id + 'voice') * pool.length)], pitch: 0.8 + E.hash(st.id + 'p') * 0.18, rate: 0.95 + E.hash(st.id + 'r') * 0.08 };
    }
    // English-speaking countries get a voice with their accent when the device has one
    const accent = st.lang && langOf(st) === 'en' ? voices.filter(v => v.lang.replace('_', '-').toLowerCase() === st.lang.toLowerCase()) : [];
    if (accent.length) return { voice: accent[Math.floor(E.hash(st.id + 'voice') * accent.length)], pitch: 0.75 + E.hash(st.id + 'p') * 0.2, rate: 0.93 + E.hash(st.id + 'r') * 0.1 };
    const good = voices.filter(v => /natural|neural|premium|enhanced|google|daniel|aaron|arthur|alex|fred|guy|davis|tom|samantha|aria|jenny|karen/i.test(v.name));
    const pool = good.length >= 2 ? good : voices;
    return { voice: pool.length ? pool[Math.floor(E.hash(st.id + 'voice') * pool.length)] : null, pitch: 0.72 + E.hash(st.id + 'p') * 0.22, rate: 0.92 + E.hash(st.id + 'r') * 0.1 };
  }
  function say(st, text) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window) || !text) return resolve();
      let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
      try {
        const v = voiceFor(st);
        const u = new SpeechSynthesisUtterance(text);
        if (v.voice) u.voice = v.voice;
        u.pitch = v.pitch; u.rate = v.rate; u.onend = fin; u.onerror = fin;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        window.RadioClock.wait(3500 + text.length * 90).then(fin); // never get stuck if the device drops the end event
      } catch { fin(); }
    });
  }

  // ---------- sonic logo ----------
  let ctx;
  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  function noiseBurst(ac, out, t, dur, from, to, vol) {
    const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ac.createBufferSource(); src.buffer = buf;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.85); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(out); src.start(t); src.stop(t + dur + 0.02);
  }
  function tone(ac, out, t, f, dur, vol, type = 'triangle') {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  // kind: 'full' (riser + logo + chord), 'short' (logo only), 'drop' (impact hit for countdown positions)
  function sting(st, kind = 'full') {
    return new Promise(resolve => {
      const ac = audio(); if (!ac) return resolve();
      const digits = st.freq.replace(/\D/g, '').split('').map(Number);
      const root = 196 * Math.pow(2, (E.hash(st.id) * 9 | 0) / 12);
      const notes = digits.slice(0, 4).map(d => root * Math.pow(2, SCALE[d % SCALE.length] / 12));
      const out = ac.createGain(); out.gain.value = 0.24;
      // a little room: short feedback delay
      const dl = ac.createDelay(); dl.delayTime.value = 0.11; const fb = ac.createGain(); fb.gain.value = 0.28;
      out.connect(ac.destination); out.connect(dl); dl.connect(fb).connect(dl); dl.connect(ac.destination);
      let t = ac.currentTime + 0.05;
      if (kind === 'full') { noiseBurst(ac, out, t, 0.7, 300, 6000, 0.45); t += 0.62; }
      if (kind === 'drop') {
        tone(ac, out, t, root / 2, 0.5, 0.7, 'sine'); noiseBurst(ac, out, t, 0.25, 2000, 200, 0.4);
        tone(ac, out, t + 0.05, notes[notes.length - 1] * 2, 0.4, 0.25);
        return window.RadioClock.wait(650).then(resolve);
      }
      notes.forEach((f, i) => tone(ac, out, t + i * 0.11, f, i === notes.length - 1 ? 1.1 : 0.45, 0.5));
      notes.forEach((f, i) => tone(ac, out, t + i * 0.11, f * 2, 0.35, 0.12, 'sine'));
      const end = t + notes.length * 0.11;
      if (kind === 'full') [0, 4, 7].forEach(s => tone(ac, out, end, notes[0] * Math.pow(2, s / 12) / 2, 1.2, 0.18, 'sawtooth'));
      window.RadioClock.wait((end - ac.currentTime + (kind === 'full' ? 0.5 : 0.2)) * 1000).then(resolve);
    });
  }

  // ---------- ID scripts ----------
  function legalId(st) {
    // most countries outside the Americas, Japan, Korea, the Philippines and Australia don't use call letters on air
    if (st.brand) return pick([`${st.name}. ${st.city}.`, `${st.name}, ${st.city}. ${st.slogan}.`, `${base(st)}. ${dial(st)}. ${st.city}.`]);
    return pick([`${spell(st.call)}, ${st.city}.`, `${spell(st.call)} ${st.city}. ${st.name}.`, `This is ${spell(st.call)}, ${st.city}, ${st.state}.`]);
  }
  function positioner(st) {
    if (speaksLocal(st)) { const t = T(st); return pick([`${st.name}. ${st.slogan}.`, `${base(st)}, ${dial(st)}. ${st.slogan}.`, t.listening(st.name), t.first(st.name)]); }
    const lines = [`${st.name}. ${st.slogan}.`, `${base(st)}, ${dial(st)}. ${st.slogan}.`, `${st.city}'s ${base(st)}. ${dial(st)}.`, `You're listening to ${st.name}.`];
    if (st.nb >= 0.35) lines.push(`${st.name}. Hear the new music first.`, `New music first. ${st.name}.`);
    if (st.clean) lines.push(`${st.name}. All the hits, always clean.`);
    return pick(lines);
  }
  function sweeper(st, cat, song) {
    if (speaksLocal(st)) {
      const t = T(st);
      if (cat === 'plants') return t.discovery(st.name);
      if (cat === 'adds') return pick([t.newOn(st.name), t.first(st.name)]);
      if (cat === 'gold') return song?.year && song.year <= new Date().getFullYear() - 3 ? t.back(song.year, st.name) : t.throwback(st.name);
      if (cat === 'power') return t.biggest(st.name, st.city);
      return positioner(st);
    }
    if (cat === 'plants') return pick([`${base(st)} discovery. Remember where you heard it first.`, `Brand new artist, first on ${st.name}.`, `${st.name} discovery.`]);
    if (cat === 'adds') return pick([`Brand new on ${st.name}.`, `First listen. ${st.name}.`, `New music, ${st.name}.`]);
    if (cat === 'gold') return pick([`${base(st)} throwback.`, `Throwback on ${st.name}.`, song?.year && song.year <= new Date().getFullYear() - 3 ? `Back to ${song.year}. ${st.name}.` : `${st.name}. The throwback.`]);
    if (cat === 'power') return pick([`${st.name}. The biggest songs in ${st.city}.`, `${base(st)} power rotation.`]);
    return positioner(st);
  }
  function countdownOpen(st) { return speaksLocal(st) ? T(st).cdOpen(chartName(st), st.name) : `The ${chartName(st)}. The biggest songs on ${st.name} this week, counting down from thirty.`; }
  function countdownDrop(row, st) {
    const t = st && speaksLocal(st) ? T(st) : null;
    if (row.pos === 1) return t ? t.one : 'And the number one song this week.';
    if (row.move === 'NEW') return t ? t.numNew(row.pos) : `Number ${row.pos}. New this week.`;
    return t ? t.num(row.pos) : `Number ${row.pos}.`;
  }
  function countdownClose(st) { return speaksLocal(st) ? T(st).cdClose(chartName(st), st.name) : `That's the ${chartName(st)}. ${st.name}.`; }

  window.RadioDJ = { TZ, seeded, say, sting, legalId, positioner, sweeper, countdownOpen, countdownDrop, countdownClose, chartName, localTime, unlock: audio };
}
