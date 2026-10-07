// Récupération d'accès par « code de déblocage »
// Le client génère un code de demande ; seul le détenteur de la clé privée
// (l'espace administrateur du vendeur) peut fabriquer le code de déblocage correspondant.
// Signature ECDSA P-256 / SHA-256. Seule la clé PUBLIQUE est dans le logiciel.
'use strict';
const crypto = require('crypto');

const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEKpamvhZ0QguqqIbtXL6szOXlqduW
22LIE2Fx2o9GB0IBbXgdsM6kBGB3wnUPKNCJRxSumvwdu9VOqcXdjGZP7Q==
-----END PUBLIC KEY-----`;

// Base32 de Crockford : pas de I, L, O, U — tolère les confusions à la saisie
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function b32encode(buf) {
  let bits = 0, val = 0, out = '';
  for (const b of buf) {
    val = (val << 8) | b; bits += 8;
    while (bits >= 5) { out += ALPHA[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALPHA[(val << (5 - bits)) & 31];
  return out;
}
function b32decode(str) {
  const s = String(str || '').toUpperCase().replace(/[^0-9A-Z]/g, '')
    .replace(/[IL]/g, '1').replace(/O/g, '0');
  let bits = 0, val = 0;
  const out = [];
  for (const ch of s) {
    const i = ALPHA.indexOf(ch);
    if (i < 0) return null;
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
const group = (s, n = 4) => s.match(new RegExp(`.{1,${n}}`, 'g')).join('-');

// Code de demande : version(1) + identifiant d'installation(8) + nonce(6) = 15 octets
function makeRequest(installIdHex, nonceHex) {
  const buf = Buffer.concat([Buffer.from([1]), Buffer.from(installIdHex, 'hex'), Buffer.from(nonceHex, 'hex')]);
  return group(b32encode(buf));
}
function signedMessage(installIdHex, nonceHex) {
  return Buffer.from(`SIKAGEST-RESET|${installIdHex}|${nonceHex}`, 'utf8');
}
function verifyUnlock(installIdHex, nonceHex, unlockCode) {
  const sig = b32decode(unlockCode);
  if (!sig || sig.length !== 64) return false;
  try {
    return crypto.verify('sha256', signedMessage(installIdHex, nonceHex), { key: PUBLIC_KEY, dsaEncoding: 'ieee-p1363' }, sig);
  } catch (e) { return false; }
}
const formatInstallId = (hex) => group(b32encode(Buffer.from(hex, 'hex')));


// ---------- Licences ----------
// Clé = base32( charge utile 12 octets + signature 64 octets )
// charge utile : version(2) | identifiant d'installation(8) | formule(1) | expiration(2 : jours depuis 2020-01-01, 65535 = à vie)
const EPOCH = Date.UTC(2020, 0, 1);
const DAY = 86400000;
const LIFETIME = 65535;
const PLANS = { 1: 'Mensuel', 2: 'Trimestriel', 3: 'Semestriel', 4: 'Annuel', 5: 'À vie', 6: 'Prolongation d\'essai' };
const licenseMessage = (payload) => Buffer.from(`SIKAGEST-LIC|${payload.toString('hex')}`, 'utf8');

function parseLicense(key, installIdHex) {
  const raw = b32decode(key);
  if (!raw || raw.length !== 76) return { ok: false, error: 'Clé incomplète ou mal copiée.' };
  const payload = raw.subarray(0, 12), sig = raw.subarray(12);
  if (payload[0] !== 2) return { ok: false, error: 'Clé invalide.' };
  let valid = false;
  try { valid = crypto.verify('sha256', licenseMessage(payload), { key: PUBLIC_KEY, dsaEncoding: 'ieee-p1363' }, sig); } catch (e) { valid = false; }
  if (!valid) return { ok: false, error: 'Clé invalide.' };
  if (payload.subarray(1, 9).toString('hex') !== installIdHex) return { ok: false, error: 'Cette clé a été fabriquée pour un autre ordinateur.' };
  const plan = payload[9];
  const days = payload.readUInt16BE(10);
  return {
    ok: true, plan, planName: PLANS[plan] || 'Licence', lifetime: days === LIFETIME,
    expires: days === LIFETIME ? null : new Date(EPOCH + days * DAY).toISOString().slice(0, 10),
  };
}

module.exports = { makeRequest, verifyUnlock, formatInstallId, b32encode, b32decode, signedMessage, parseLicense, licenseMessage, PLANS, EPOCH, DAY, LIFETIME };
