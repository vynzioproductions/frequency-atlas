// Makes an Apple Music (MusicKit) developer token for config.js.
// Usage:  node scripts/apple-token.mjs AuthKey_ABC123XYZ.p8 TEAMID KEYID [days]
//   - AuthKey_….p8: the MusicKit private key you download from developer.apple.com → Keys
//   - TEAMID: your 10-character Team ID (top right of the developer site / Membership page)
//   - KEYID:  the 10-character Key ID shown next to the key
// Tokens can last up to 180 days; run this again before it expires. Keep the .p8 file private.
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';

const [file, teamId, keyId, daysArg] = process.argv.slice(2);
if (!file || !teamId || !keyId) {
  console.error('Usage: node scripts/apple-token.mjs AuthKey_XXXX.p8 TEAMID KEYID [days]');
  process.exit(1);
}
const days = Math.min(180, Math.max(1, Number(daysArg) || 180));
const b64url = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const head = b64url({ alg: 'ES256', kid: keyId });
const body = b64url({ iss: teamId, iat: now, exp: now + days * 86400 });
const key = createPrivateKey(readFileSync(file, 'utf8'));
const sig = sign('sha256', Buffer.from(`${head}.${body}`), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
console.log(`${head}.${body}.${sig}`);
console.error(`\nToken good until ${new Date((now + days * 86400) * 1000).toDateString()}. Paste it into config.js → appleDeveloperToken.`);
