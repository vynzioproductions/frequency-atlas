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
  const dial = (st) => st.freq.split(' ')[0].replace('.', ' point ');

  // ---------- one imaging voice per station ----------
  let voices = [];
  const loadVoices = () => { try { voices = speechSynthesis.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang)); } catch { voices = []; } };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function voiceFor(st) {
    if (!voices.length) loadVoices();
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
        setTimeout(fin, 3500 + text.length * 90); // never get stuck if the device drops the end event
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
        return setTimeout(resolve, 650);
      }
      notes.forEach((f, i) => tone(ac, out, t + i * 0.11, f, i === notes.length - 1 ? 1.1 : 0.45, 0.5));
      notes.forEach((f, i) => tone(ac, out, t + i * 0.11, f * 2, 0.35, 0.12, 'sine'));
      const end = t + notes.length * 0.11;
      if (kind === 'full') [0, 4, 7].forEach(s => tone(ac, out, end, notes[0] * Math.pow(2, s / 12) / 2, 1.2, 0.18, 'sawtooth'));
      setTimeout(resolve, (end - ac.currentTime + (kind === 'full' ? 0.5 : 0.2)) * 1000);
    });
  }

  // ---------- ID scripts ----------
  function legalId(st) {
    return pick([`${spell(st.call)}, ${st.city}.`, `${spell(st.call)} ${st.city}. ${st.name}.`, `This is ${spell(st.call)}, ${st.city}, ${st.state}.`]);
  }
  function positioner(st) {
    const lines = [`${st.name}. ${st.slogan}.`, `${base(st)}, ${dial(st)}. ${st.slogan}.`, `${st.city}'s ${base(st)}. ${dial(st)}.`, `You're listening to ${st.name}.`];
    if (st.nb >= 0.35) lines.push(`${st.name}. Hear the new music first.`, `New music first. ${st.name}.`);
    if (st.clean) lines.push(`${st.name}. All the hits, always clean.`);
    return pick(lines);
  }
  function sweeper(st, cat, song) {
    if (cat === 'plants') return pick([`${base(st)} discovery. Remember where you heard it first.`, `Brand new artist, first on ${st.name}.`, `${st.name} discovery.`]);
    if (cat === 'adds') return pick([`Brand new on ${st.name}.`, `First listen. ${st.name}.`, `New music, ${st.name}.`]);
    if (cat === 'gold') return pick([`${base(st)} throwback.`, `Throwback on ${st.name}.`, song?.year && song.year <= new Date().getFullYear() - 3 ? `Back to ${song.year}. ${st.name}.` : `${st.name}. The throwback.`]);
    if (cat === 'power') return pick([`${st.name}. The biggest songs in ${st.city}.`, `${base(st)} power rotation.`]);
    return positioner(st);
  }
  function countdownOpen(st) { return `The ${chartName(st)}. The biggest songs on ${st.name} this week, counting down from thirty.`; }
  function countdownDrop(row) {
    if (row.pos === 1) return 'And the number one song this week.';
    if (row.move === 'NEW') return `Number ${row.pos}. New this week.`;
    return `Number ${row.pos}.`;
  }
  function countdownClose(st) { return `That's the ${chartName(st)}. ${st.name}.`; }

  window.RadioDJ = { TZ, seeded, say, sting, legalId, positioner, sweeper, countdownOpen, countdownDrop, countdownClose, chartName, localTime, unlock: audio };
}
