// Déclaration de l'installation auprès du fournisseur (pour l'assistance)
// Envoie : nom de la boutique, gérant, téléphone, e-mail, ville, quartier, activité, version.
// Aucune donnée commerciale (ventes, produits, clients…) n'est envoyée.
'use strict';
const { app, net } = require('electron');

let getSettings = null;
let portable = false;
let timer = null;
let getLicense = null;

function config() {
  const pkg = require('../package.json');
  const c = { ...(pkg.server || {}) };
  if (process.env.SIKAGEST_SERVER_URL) c.url = process.env.SIKAGEST_SERVER_URL; // tests
  return c;
}

function licenseFields() {
  try {
    const l = getLicense ? getLicense() : null;
    if (!l) return { p_license_state: null, p_license_plan: null, p_license_expires: null };
    return { p_license_state: l.state, p_license_plan: l.plan || null, p_license_expires: l.lifetime ? null : (l.expires || null) };
  } catch (e) { return { p_license_state: null, p_license_plan: null, p_license_expires: null }; }
}

async function sync() {
  const { url, key } = config();
  if (!url || !key || !getSettings) return false;
  const s = getSettings();
  if (!s.install_id) return false;
  try {
    const res = await net.fetch(`${url}/rest/v1/rpc/register_installation_v2`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_install_id: s.install_id, p_shop: s.company_name || '', p_owner_name: s.owner_name || '',
        p_phone: s.company_phone || '', p_email: s.company_email || '', p_city: s.company_city || '',
        p_district: s.company_district || '', p_activity: s.company_activity || '',
        p_app_version: app.getVersion(), p_portable: portable,
        ...licenseFields(),
      }),
    });
    return res.ok;
  } catch (e) {
    return false; // pas d'Internet : on réessaiera plus tard
  }
}

function init(settingsFn, opts = {}) {
  getSettings = settingsFn;
  portable = !!opts.portable;
  getLicense = opts.licenseFn || null;
  setTimeout(sync, 6000);
  if (timer) clearInterval(timer);
  timer = setInterval(sync, 20 * 60 * 1000); // signale sa présence toutes les 20 minutes
}

module.exports = { init, sync };
