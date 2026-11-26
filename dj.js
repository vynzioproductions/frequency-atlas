/* Talking DJs and station imaging: a voice per show, a sonic logo per station,
   and talk breaks written from the station's own chart data. */
{
  const E = window.RadioEngine;
  const TZ = {
    tucson: 'America/Phoenix', phoenix: 'America/Phoenix', la: 'America/Los_Angeles', sf: 'America/Los_Angeles', seattle: 'America/Los_Angeles',
    vegas: 'America/Los_Angeles', denver: 'America/Denver', slc: 'America/Denver', dallas: 'America/Chicago', chicago: 'America/Chicago',
    nashville: 'America/Chicago', minneapolis: 'America/Chicago', nyc: 'America/New_York', miami: 'America/New_York', atlanta: 'America/New_York', boston: 'America/New_York',
  };
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); };

  function localTime(st) {
    const tz = TZ[st.id] || 'America/Phoenix';
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', weekday: 'long', hour12: true })
      .formatToParts(new Date()).map(p => [p.type, p.value]));
    const h24 = +new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', hour12: false }).format(new Date()) % 24;
    return { text: `${parts.hour}:${parts.minute}`, h24, day: parts.weekday };
  }

  // Which show is on the air right now, in the station's own time zone
  function onAir(st) {
    const { h24, day } = localTime(st);
    const find = (...labels) => st.shows.find(([d]) => labels.some(l => d.toLowerCase().startsWith(l)));
    let show;
    if ((day === 'Sunday') && h24 >= 9 && h24 < 13) show = find('sun', 'dom');
    else if (h24 >= 5 && h24 < 10) show = find('morn', 'mañ');
    else if (h24 >= 10 && h24 < 15) show = find('midd', 'after');
    else if (h24 >= 15 && h24 < 19) show = find('after', 'midd');
    else show = find('night', 'sat', 'fri');
    show = show || st.shows[0];
    return { slot: show[0], name: show[1] };
  }
  function chartName(st) { return st.name.replace(/^the /i, '').replace(/\s*[\d.]+$/, '') + ' 30'; }

  // ---------- voices ----------
  let voices = [];
  const loadVoices = () => { try { voices = speechSynthesis.getVoices().filter(v => /^en(-|_|$)/i.test(v.lang)); } catch { voices = []; } };
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; }
  function voiceFor(st, showName) {
    if (!voices.length) loadVoices();
    const h = E.hash(st.id + showName);
    // prefer natural-sounding voices when the device has them
    const good = voices.filter(v => /natural|neural|premium|enhanced|google|samantha|daniel|karen|moira|aria|jenny|guy/i.test(v.name));
    const pool = good.length >= 2 ? good : voices;
    return { voice: pool.length ? pool[Math.floor(h * pool.length)] : null, pitch: 0.88 + E.hash(st.id + 'p' + showName) * 0.3, rate: 1.02 + E.hash(st.id + 'r') * 0.12 };
  }
  function say(st, text, showName) {
    return new Promise(resolve => {
      if (!('speechSynthesis' in window) || !text) return resolve();
      let done = false; const fin = () => { if (!done) { done = true; resolve(); } };
      try {
        const v = voiceFor(st, showName || onAir(st).name);
        const u = new SpeechSynthesisUtterance(text);
        if (v.voice) u.voice = v.voice;
        u.pitch = v.pitch; u.rate = v.rate; u.onend = fin; u.onerror = fin;
        speechSynthesis.cancel(); speechSynthesis.speak(u);
        setTimeout(fin, 4000 + text.length * 90); // never get stuck if the device drops the end event
      } catch { fin(); }
    });
  }

  // ---------- sonic logo: a short chord + arpeggio built from the station's frequency ----------
  let ctx;
  function audio() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  function sting(st) {
    return new Promise(resolve => {
      const ac = audio(); if (!ac) return resolve();
      const digits = st.freq.replace(/\D/g, '').split('').map(Number);
      const root = 220 * Math.pow(2, (E.hash(st.id) * 7 | 0) / 12);
      const t0 = ac.currentTime + 0.05;
      const master = ac.createGain(); master.gain.value = 0.22; master.connect(ac.destination);
      // whoosh
      const len = ac.sampleRate * 0.6, buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (i / len);
      const noise = ac.createBufferSource(); noise.buffer = buf;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(400, t0); bp.frequency.exponentialRampToValueAtTime(5000, t0 + 0.55);
      const ng = ac.createGain(); ng.gain.setValueAtTime(0.0001, t0); ng.gain.exponentialRampToValueAtTime(0.5, t0 + 0.5); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.62);
      noise.connect(bp).connect(ng).connect(master); noise.start(t0); noise.stop(t0 + 0.65);
      // arpeggio from the dial position, landing on a held chord
      const notes = digits.slice(0, 4).map(d => root * Math.pow(2, SCALE[d % SCALE.length] / 12));
      notes.forEach((f, i) => {
        const at = t0 + 0.55 + i * 0.12, hold = i === notes.length - 1 ? 0.9 : 0.5;
        [['triangle', 1, 0.5], ['sine', 2, 0.18]].forEach(([type, mult, vol]) => {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = type; o.frequency.value = f * mult;
          g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(vol, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + hold);
          o.connect(g).connect(master); o.start(at); o.stop(at + hold + 0.05);
        });
      });
      setTimeout(resolve, (0.55 + notes.length * 0.12 + 0.6) * 1000);
    });
  }

  // ---------- talk break scripts ----------
  function facts(st, song, cat) {
    const k = E.nowWeek();
    const row = E.countdown(st, k).find(e => e.song.id === song.id);
    const plant = st.plants.some(p => p[0] === song.id);
    return { row, plant, cat };
  }
  function moveWords(row) {
    if (!row) return '';
    if (row.move === 'NEW') return 'a brand new debut';
    if (row.move === 'RE') return 'back on the chart';
    if (row.move === '=') return row.pos === 1 ? 'holding at the top' : 'holding steady';
    const n = +row.move.slice(1);
    return row.move[0] === '▲' ? `up ${n} spot${n > 1 ? 's' : ''}` : `down ${n}`;
  }
  const artistOf = (s) => String(s.artist).split(/,| feat\./)[0].trim();

  function backAnnounce(st, prev) {
    if (!prev) return '';
    const f = facts(st, prev);
    if (f.row && f.row.pos <= 10) return pick([`That's ${prev.title} from ${artistOf(prev)}, number ${f.row.pos} on the ${chartName(st)} this week.`,
      `${artistOf(prev)}, ${prev.title}. ${f.row.pos === 1 ? 'Your number one song' : `Number ${f.row.pos}`} on ${st.name}.`]);
    if (f.plant) return `${artistOf(prev)} with ${prev.title}. You heard it here first on ${st.name}.`;
    if (prev.year && prev.year <= new Date().getFullYear() - 3) return pick([`A little ${prev.year} for you, ${artistOf(prev)}.`, `Throwback ${artistOf(prev)}, ${prev.title}.`]);
    return pick([`${artistOf(prev)}, ${prev.title}.`, `That was ${artistOf(prev)}.`, `${prev.title} from ${artistOf(prev)} on ${st.name}.`]);
  }
  function frontSell(st, next, cat) {
    if (!next) return '';
    const f = facts(st, next, cat);
    if (f.plant || cat === 'plants') return pick([`Here's an artist we're breaking first right here in ${st.city}. This is ${artistOf(next)}, ${next.title}.`,
      `New discovery time on ${st.name}. Remember the name ${artistOf(next)}.`]);
    if (cat === 'adds') return pick([`Brand new music on ${st.name}, ${artistOf(next)} with ${next.title}.`, `First listen, new from ${artistOf(next)}.`]);
    if (cat === 'gold' && next.year) return next.year <= new Date().getFullYear() - 3 ? pick([`Let's go back to ${next.year}.`, `Throwback time. ${artistOf(next)}.`]) : `Throwback time. ${artistOf(next)}.`;
    if (f.row && f.row.move !== '=' && f.row.pos <= 20) return `${artistOf(next)} is ${moveWords(f.row)} to number ${f.row.pos} this week. Here's ${next.title}.`;
    return pick(['', '', `Here's ${artistOf(next)}.`, `More music on ${st.name}.`]);
  }
  function stationId(st) {
    const t = localTime(st), show = onAir(st);
    return pick([`${st.name}. ${st.slogan}.`, `It's ${t.text} in ${st.city}. ${show.name} on ${st.name}.`, `${st.call}, ${st.city}. ${st.name}.`,
      `${st.name}, ${st.city}'s home for new music.`, `You're listening to ${show.name}, on ${st.name}.`]);
  }
  function countdownIntro(st, row, isFirst) {
    const parts = [];
    if (isFirst) parts.push(`This is the ${chartName(st)}, counting down the biggest songs on ${st.name} this week.`);
    const head = row.pos === 1 ? `And here it is. The number one song on the ${chartName(st)} this week` : `At number ${row.pos}`;
    let detail = moveWords(row);
    if (row.pos === 1 && row.lw === 1) detail = `for a ${ord(row.wks)} week on the chart, and still at the top`;
    if (row.song.kind === 'plant') detail += ', and it started as one of our discovery plants';
    parts.push(`${head}${detail ? ', ' + detail : ''}. ${artistOf(row.song)}, ${row.song.title}.`);
    return parts.join(' ');
  }

  window.RadioDJ = { say, sting, onAir, chartName, localTime, backAnnounce, frontSell, stationId, countdownIntro, unlock: audio };
}
