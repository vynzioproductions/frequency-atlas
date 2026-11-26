// Shared helpers for the build scripts (run by GitHub Actions or `node scripts/...`).
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

// Genre tags by artist. Anything not listed counts as plain "pop".
// Add an artist to a list to change which stations play them most.
const TAG_LISTS = {
  dance: `david guetta, alesso, marshmello, zedd, calvin harris, the chainsmokers, kygo, avicii, martin garrix, tiësto, clean bandit, galantis, jonas blue,
    sigala, robin schulz, felix jaehn, dom dolla, fred again.., becky hill, oliver heldens, mk, sonny fodera, disclosure, kaskade, illenium, major lazer, dj snake,
    cheat codes, lost frequencies, meduza, purple disco machine, duke dumont, gorgon city, zara larsson, tove lo, ellie goulding, ava max, kesha, charli xcx, dua lipa,
    slayyyter, anotr, hugel, lady gaga, michael medrano, mkx, dev, pitbull, jason derulo, flo rida, gryffin, notd, swedish house mafia, said the sky, san holo, audien,
    icona pop, deorro, digital farm animals, kim petras, robyn, cobra starship, neiked, kenya grace, sigrid, lindsey stirling, the chemical brothers, justice, loreen,
    nico santos, disco lines, rose gray, mabel, anne-marie, little mix, bonnie mckee, mike posner, karmin, new rules, the midnight, m83, sandro cavazza`,
  alt: `twenty one pilots, bastille, fall out boy, panic! at the disco, the 1975, imagine dragons, ajr, fun., walk the moon, neon trees, the band camino, almost monday,
    5 seconds of summer, paramore, lorde, glass animals, foster the people, mgmt, tame impala, the killers, x ambassadors, the beaches, royel otis, sombr, drive!drive!,
    haute & freddy, bad suns, avril lavigne, halsey, billie eilish, the maine, hedley, of monsters and men, the wombats, judah & the lion, milky chance, echosmith, pvris,
    lovelytheband, banners, fitz and the tantrums, american authors, bleachers, grouplove, coin, børns, all time low, valley, the night game, blue october, the regrettes,
    chvrches, moon taxi, owl city, declan mckenna, beach weather, weezer, måneskin, damiano david, role model, kennyhoopla, the vamps, ocean park standoff, emblem3,
    nf, machine gun kelly, yungblud, lovejoy, wallows, cage the elephant, arctic monkeys, young the giant, mumford & sons, snow patrol, picture this, a r i z o n a, magdalene`,
  indie: `noah kahan, maggie rogers, dominic fike, gracie abrams, phoebe bridgers, holly humberstone, lizzy mcalpine, laufey, clairo, beabadoobee, girl in red, remi wolf,
    steve lacy, malcolm todd, josie edwards, matthew orgel, livingston, grace gachot, lara buchanan, jude york, henry moodie, alec benjamin, lana del rey, hozier, vance joy,
    lord huron, the lumineers, mt. joy, bluegirl, florence road, hayes warner, griff, maisie peters, conan gray, ruth b., wasia project, katie gavin, james bay, birdy,
    tom odell, dean lewis, lewis capaldi, florence + the machine, marina, gigi perez, myles smith, mark ambor, sammy rae & the friends, stacey ryan, ritt momney, george ezra,
    wrabel, mico, freya ridings, walking on cars, zella day, ryn weaver, oh honey, we three, jp saxe, blake rose, dylan, max mcnown, daine, coleman hell, rhodes, sky ferreira,
    alyssa grace, matthew orgel, theo williams, vince palmeri, melissa kadas, henry morris, lachie gill, izzy escobar, belle tatum, erin lecount, debbii dawson, haley joelle,
    lily fitts, sean jacobs, will linley, jensen mcrae, miles bonham, audrey hobert, holly humberstone`,
  rnb: `khalid, sza, olivia dean, teddy swims, bruno mars, the weeknd, doja cat, kehlani, tyla, daniel caesar, h.e.r., jhené aiko, victoria monét, summer walker, usher,
    chris brown, ne-yo, kiana ledé, raye, rihanna, tinashe, ravyn lenae, miguel, toosii, zoe wees, lauv, giveon, brent faiyaz, pinkpantheress, jamie fine`,
  country: `morgan wallen, ella langley, zach bryan, luke combs, kane brown, thomas rhett, kelsea ballerini, carrie underwood, maren morris, shaboozey, lainey wilson,
    bailey zimmerman, cameron whitcomb, dan + shay, florida georgia line, megan moroney, jelly roll, chris stapleton, kacey musgraves, lady a, koe wetzel, orville peck,
    tanner grigoli, conor mclain, elle king, luke bryan, jordan davis, cody johnson, riley green, warren zeiders, josh ross, stella lefty, sam hunt, gabby barrett`,
  latin: `karol g, bad bunny, shakira, j balvin, rauw alejandro, myke towers, feid, peso pluma, becky g, camila cabello, enrique iglesias, daddy yankee, ozuna, maluma,
    sebastián yatra, anitta, tini, quevedo, kenia os, danna, natanael cano, fuerza regida, grupo frontera, luis fonsi, ryan castro, greeicy, piso 21, dj goja, marino`,
  kpop: `blackpink, jennie, lisa, rosé, bts, jung kook, jimin, katseye, xg, newjeans, twice, stray kids, le sserafim, aespa, enhypen, tomorrow x together, huntr/x,
    saja boys, illit, ive, rm, nadine lustre`,
  rap: `drake, future, lil baby, travis scott, kendrick lamar, 21 savage, gunna, don toliver, bigxthaplug, playboi carti, yeat, eminem, lil uzi vert, young thug,
    metro boomin, tyler, the creator, j. cole, cardi b, nicki minaj, megan thee stallion, glorilla, sexyy red, central cee, lil wayne, kanye west, belly gang kushington,
    loe shimmy, rod wave, youngboy never broke again, moneybagg yo, lil durk, polo g, juice wrld, doechii, kodak black, tee grizzley, lil tecca, ken carson,
    destroy lonely, babyface ray, wiz khalifa, childish gambino, powfu, lil peep, fat papi, kg crown, 2hollis, partynextdoor, lil yachty, nle choppa, offset, quavo`,
};
export const ARTIST_TAGS = new Map();
for (const [tag, list] of Object.entries(TAG_LISTS)) {
  for (const raw of list.split(',')) {
    const a = raw.trim().toLowerCase(); if (!a) continue;
    ARTIST_TAGS.set(a, [...new Set([...(ARTIST_TAGS.get(a) || []), tag])]);
  }
}
// Some artists sit in two worlds
for (const [a, extra] of [['zara larsson', 'pop'], ['dua lipa', 'pop'], ['halsey', 'pop'], ['billie eilish', 'pop'], ['camila cabello', 'pop'], ['raye', 'pop'],
  ['olivia dean', 'pop'], ['teddy swims', 'pop'], ['bruno mars', 'pop'], ['the weeknd', 'pop'], ['lady gaga', 'pop'], ['ava max', 'pop'], ['tove lo', 'pop'],
  ['stella lefty', 'pop'], ['maren morris', 'pop'], ['kelsea ballerini', 'pop'], ['noah kahan', 'country'], ['katseye', 'pop'], ['lisa', 'pop'], ['rosé', 'pop']]) {
  if (ARTIST_TAGS.has(a)) ARTIST_TAGS.get(a).push(extra);
}

export function tagsFor(artists) {
  const list = Array.isArray(artists) ? artists : String(artists).split(/,|&| feat\. | x /i);
  for (const a of list) {
    const t = ARTIST_TAGS.get(a.trim().toLowerCase());
    if (t) return [...new Set(t)];
  }
  return ['pop'];
}
export function isKnownArtist(artists) {
  const list = Array.isArray(artists) ? artists : String(artists).split(/,|&/);
  return list.some(a => ARTIST_TAGS.has(a.trim().toLowerCase()));
}

// "Song (feat. X) - Remastered" + "Artist, Other" -> "song|artist"
export function songKey(title, artist) {
  const t = String(title).toLowerCase()
    .replace(/\s*[([].*?(feat|with|w\/|from|remaster|version|edit|remix|official).*?[)\]]/g, '')
    .replace(/\s+-\s+.*$/g, '')
    .replace(/\s+(feat\.?|ft\.|with)\s.*$/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const a = String(artist).split(/,|&| feat\.| x /i)[0].toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return t + '|' + a;
}

const HOLIDAY = /christmas|xmas|santa|jingle|sleigh|mistletoe|snowman|let it snow|feliz navidad|holiday|reindeer|navidad|winter wonderland|silent night|noel|underneath the tree|rockin' around|last christmas|white christmas|frosty|little drummer/i;
export const isHoliday = (title) => HOLIDAY.test(title);

export function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

// Load the browser data file (data.js) into Node
export function loadBrowserData(file = 'data.js') {
  const ctx = { globalThis: {} }; ctx.window = ctx.globalThis;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), ctx);
  return ctx.globalThis;
}

export const DAY = 864e5;
export const weeksBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / (7 * DAY));

export function writeJsGlobal(file, name, obj) {
  const body = `/* Generated by scripts — do not edit by hand */\nwindow.${name} = ${JSON.stringify(obj)};\n`;
  fs.writeFileSync(path.join(ROOT, file), body);
}

// tiny deterministic hash -> [0,1)
export function hash(s) {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); }
  return (x >>> 0) / 4294967296;
}
