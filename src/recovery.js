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

module.exports = { makeRequest, verifyUnlock, formatInstallId, b32encode, b32decode, signedMessage };
