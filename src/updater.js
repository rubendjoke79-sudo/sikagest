// Mises à jour automatiques par Internet (via les « Releases » GitHub)
// - Version installée : la nouvelle version est téléchargée en arrière-plan puis installée
//   en un clic (ou automatiquement à la fermeture du logiciel).
// - Version portable : le logiciel annonce la nouvelle version et ouvre la page de téléchargement.
'use strict';
const { app, ipcMain, shell, net } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

let win = null;
let portable = false;
let last = { state: 'idle' };
let pendingInstaller = null;
let busy = false;

function send(status) {
  last = status;
  if (win && !win.isDestroyed()) win.webContents.send('update.status', status);
}

function cmpVersions(a, b) {
  const pa = String(a).replace(/^v/, '').split('.').map(Number);
  const pb = String(b).replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
  return 0;
}

function repo() {
  const pkg = require('../package.json');
  return (pkg.build && pkg.build.publish) || pkg.updates || {};
}

async function download(url, dest, version) {
  const res = await net.fetch(url, { headers: { 'User-Agent': 'SikaGest', Accept: 'application/octet-stream' } });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const tmp = `${dest}.part`;
  const out = fs.createWriteStream(tmp);
  const reader = res.body.getReader();
  let got = 0, lastPct = -1;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    got += value.length;
    if (!out.write(Buffer.from(value))) await new Promise((r) => out.once('drain', r));
    const pct = total ? Math.floor((got / total) * 100) : 0;
    if (pct !== lastPct) { lastPct = pct; send({ state: 'downloading', version, percent: pct }); }
  }
  await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
  if (total && got !== total) throw new Error('Téléchargement incomplet');
  fs.renameSync(tmp, dest);
}

async function check() {
  if (!app.isPackaged) return send({ state: 'dev', message: 'Mises à jour désactivées en mode développement.' });
  if (busy || pendingInstaller) return;
  const { owner, repo: name } = repo();
  if (!owner || !name) return send({ state: 'error', message: 'Adresse des mises à jour non configurée.' });
  busy = true;
  send({ state: 'checking' });
  try {
    const api = process.env.SIKAGEST_UPDATE_URL || `https://api.github.com/repos/${owner}/${name}/releases/latest`;
    const res = await net.fetch(api, { headers: { 'User-Agent': 'SikaGest', Accept: 'application/vnd.github+json' } });
    if (res.status === 404) { send({ state: 'none' }); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rel = await res.json();
    const version = String(rel.tag_name || '').replace(/^v/, '');
    if (!version || cmpVersions(version, app.getVersion()) <= 0) { send({ state: 'none' }); return; }

    if (portable) {
      const asset = (rel.assets || []).find((a) => /portable/i.test(a.name));
      send({ state: 'available-portable', version, url: asset ? asset.browser_download_url : rel.html_url });
      return;
    }
    const asset = (rel.assets || []).find((a) => /installation.*\.exe$/i.test(a.name));
    if (!asset) { send({ state: 'none' }); return; }
    const dest = path.join(os.tmpdir(), `SikaGest-mise-a-jour-${version}.exe`);
    if (!fs.existsSync(dest) || fs.statSync(dest).size !== asset.size) {
      send({ state: 'downloading', version, percent: 0 });
      await download(asset.browser_download_url, dest, version);
    }
    pendingInstaller = dest;
    send({ state: 'downloaded', version });
  } catch (e) {
    send({ state: 'error', message: 'Impossible de vérifier les mises à jour (pas de connexion Internet ?).' });
  } finally {
    busy = false;
  }
}

function runInstaller(relaunch) {
  if (!pendingInstaller) return false;
  const args = relaunch ? ['/S'] : ['/S', '/norun'];
  spawn(pendingInstaller, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  pendingInstaller = null;
  return true;
}

function init(window, opts) {
  win = window;
  portable = !!opts.portable;

  ipcMain.handle('update.check', () => { check(); return last; });
  ipcMain.handle('update.install', () => {
    if (last.state === 'available-portable' && last.url) { shell.openExternal(last.url); return true; }
    if (last.state === 'downloaded' && runInstaller(true)) { setTimeout(() => app.quit(), 300); return true; }
    return false;
  });
  ipcMain.handle('update.state', () => last);

  if (!app.isPackaged) return;
  // Si une mise à jour est prête quand on ferme le logiciel, elle s'installe en silence.
  app.on('will-quit', () => { if (process.platform === 'win32') runInstaller(false); });
  win.webContents.once('did-finish-load', () => setTimeout(check, 8000));
  setInterval(check, 4 * 60 * 60 * 1000); // puis toutes les 4 heures
}

module.exports = { init };
