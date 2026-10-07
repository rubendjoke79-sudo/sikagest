// Outil vendeur : fabrique le code de secours d'une sauvegarde en ligne.
// Ce code est intégré tel quel dans SikaGest-Admin.html (onglet « Secours en ligne »).
// Il utilise WebCrypto (navigateur) : PRIVATE_ECDH = clé privée du vendeur importée en ECDH P-256.
async function rescueAnswer(PRIVATE_ECDH, requestCode, vendorWrapB64, b32dec, b32enc) {
  const req = b32dec(requestCode);
  if (!req || req.length !== 82 || req[0] !== 1) throw new Error('Code de demande invalide.');
  const h = Array.from(req.slice(1, 17), (b) => b.toString(16).padStart(2, '0')).join('');
  const accountId = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  const S = crypto.subtle;
  const ecdh = async (rawPub) => new Uint8Array(await S.deriveBits({ name: 'ECDH', public: await S.importKey('raw', rawPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []) }, PRIVATE_ECDH, 256));
  const hkdfKey = async (shared, info, usage) => S.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode(info) },
    await S.importKey('raw', shared, 'HKDF', false, ['deriveKey']), { name: 'AES-GCM', length: 256 }, false, [usage]);
  // 1. Ouvrir la clé des données (chiffrée pour le vendeur)
  const vw = Uint8Array.from(atob(vendorWrapB64), (c) => c.charCodeAt(0));
  const k1 = await hkdfKey(await ecdh(vw.slice(0, 65)), 'SIKAGEST-CLOUD-VENDOR', 'decrypt');
  const iv = vw.slice(65, 77), tag = vw.slice(77, 93), ct = vw.slice(93);
  const ctTag = new Uint8Array(ct.length + 16); ctTag.set(ct); ctTag.set(tag, ct.length);
  const dk = new Uint8Array(await S.decrypt({ name: 'AES-GCM', iv }, k1, ctTag));
  // 2. La rechiffrer pour la clé éphémère du PC du client
  const k2 = await hkdfKey(await ecdh(req.slice(17, 82)), 'SIKAGEST-CLOUD-RESCUE', 'encrypt');
  const out = new Uint8Array(await S.encrypt({ name: 'AES-GCM', iv: new Uint8Array(12), additionalData: new TextEncoder().encode(accountId) }, k2, dk));
  return { accountId, code: b32enc(out).match(/.{1,4}/g).join('-') };
}
if (typeof module !== 'undefined') module.exports = { rescueAnswer };
