// SikaGest — sauvegardes automatiques
// - une copie toutes les 3 heures pendant l'utilisation, et une à la fermeture ;
// - chaque copie est vérifiée avant d'être gardée ;
// - historique : les 3 dernières copies, 1 par jour sur 7 jours, 1 par semaine sur 5 semaines, 1 par mois sur 12 mois ;
// - l'état (dernière réussite, dernier échec, dernière copie sur clé USB) est gardé pour prévenir l'utilisateur.
'use strict';
const fs = require('fs');
const path = require('path');
const { checkFile } = require('./db');

const NAME_RE = /^auto-(\d{4})-(\d{2})-(\d{2})(?:-(\d{2})(\d{2}))?\.sikagest$/;
const DAY = 24 * 3600 * 1000;
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const stamp = (d) => `${dayKey(d)}-${pad(d.getHours())}${pad(d.getMinutes())}`;
const weekKey = (d) => dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

function parseName(name) {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

// Choisit les copies à garder. Les plus récentes sont toujours gardées.
function planRetention(names, now = new Date()) {
  const list = names.map((name) => ({ name, date: parseName(name) })).filter((x) => x.date)
    .sort((a, b) => b.date - a.date);
  const keep = new Set();
  const seen = { day: new Set(), week: new Set(), month: new Set() };
  list.forEach((x, i) => {
    const age = now - x.date;
    if (i < 3) keep.add(x.name);
    const rules = [['day', dayKey, 7 * DAY], ['week', weekKey, 35 * DAY], ['month', monthKey, 366 * DAY]];
    for (const [k, fn, max] of rules) {
      const key = fn(x.date);
      if (age <= max && !seen[k].has(key)) { seen[k].add(key); keep.add(x.name); }
    }
  });
  return { keep: list.filter((x) => keep.has(x.name)).map((x) => x.name), remove: list.filter((x) => !keep.has(x.name)).map((x) => x.name) };
}

function createBackups({ dataDir, getStore, nativeBinding, intervalHours = 3, now = () => new Date() }) {
  const dir = path.join(dataDir, 'sauvegardes-auto');
  const stateFile = path.join(dataDir, 'sauvegardes-etat.json');
  let timer = null;

  function readState() { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch (e) { return {}; } }
  function writeState(patch) {
    const s = { ...readState(), ...patch };
    try { fs.mkdirSync(dataDir, { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(s, null, 2)); } catch (e) { /* rien */ }
    return s;
  }
  function listFiles() {
    try { return fs.readdirSync(dir).filter((f) => NAME_RE.test(f)); } catch (e) { return []; }
  }

  // Copie vérifiée de la base vers « dest ». Lève une erreur si la copie est mauvaise.
  function makeVerifiedCopy(dest) {
    const tmp = path.join(dataDir, `copie-en-cours-${process.pid}.tmp`);
    try {
      getStore().snapshot(tmp);
      const chk = checkFile(tmp, nativeBinding);
      if (!chk.ok) throw new Error(`la copie est illisible (${chk.error})`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(tmp, dest);
      if (fs.statSync(dest).size !== fs.statSync(tmp).size) throw new Error('la copie est incomplète (disque plein ?)');
      return chk;
    } finally {
      try { fs.unlinkSync(tmp); } catch (e) { /* absent */ }
    }
  }

  function prune() {
    const { remove } = planRetention(listFiles(), now());
    for (const f of remove) { try { fs.unlinkSync(path.join(dir, f)); } catch (e) { /* rien */ } }
  }

  function run(reason = 'auto') {
    const t = now();
    try {
      makeVerifiedCopy(path.join(dir, `auto-${stamp(t)}.sikagest`));
      prune();
      writeState({ lastOk: t.toISOString(), lastReason: reason, lastError: null, lastErrorAt: null });
      return { ok: true };
    } catch (e) {
      const msg = /ENOSPC/.test(e.code || e.message) ? 'le disque est plein' : e.message;
      writeState({ lastError: msg, lastErrorAt: t.toISOString() });
      return { ok: false, error: msg };
    }
  }

  function maybeRun() {
    const s = readState();
    const last = s.lastOk ? new Date(s.lastOk) : null;
    if (!last || now() - last >= intervalHours * 3600 * 1000 || listFiles().length === 0) return run('auto');
    return { ok: true, skipped: true };
  }

  function start() {
    if (!readState().firstSeen) writeState({ firstSeen: now().toISOString() });
    const health = getStore().quickCheck();
    writeState({ dbHealth: health, dbHealthAt: now().toISOString() });
    // Si la base est abîmée, on ne remplace pas les bonnes copies par une copie abîmée.
    if (health === 'ok') maybeRun();
    timer = setInterval(() => { if (readState().dbHealth === 'ok') maybeRun(); }, 15 * 60 * 1000);
    if (timer.unref) timer.unref();
  }

  // À la fermeture : copie si la dernière date de plus de 10 minutes
  function onClose() {
    if (timer) clearInterval(timer);
    const s = readState();
    if (s.dbHealth !== 'ok') return;
    if (!s.lastOk || now() - new Date(s.lastOk) > 10 * 60 * 1000) run('fermeture');
  }

  // Copie choisie par l'utilisateur (clé USB, disque externe…)
  function exportTo(dest) {
    makeVerifiedCopy(dest);
    writeState({ lastExternal: now().toISOString() });
  }

  function status() {
    const s = readState();
    const files = listFiles().map(parseName).filter(Boolean).sort((a, b) => b - a);
    const ref = s.lastExternal || s.firstSeen;
    const failing = !!(s.lastError && (!s.lastOk || new Date(s.lastErrorAt) > new Date(s.lastOk)));
    return {
      dir, count: files.length, oldest: files.length ? files[files.length - 1].toISOString() : null,
      lastOk: s.lastOk || null, lastError: failing ? s.lastError : null, lastErrorAt: failing ? s.lastErrorAt : null,
      lastExternal: s.lastExternal || null,
      daysSinceExternal: ref ? Math.floor((now() - new Date(ref)) / DAY) : 0,
      dbHealthy: !s.dbHealth || s.dbHealth === 'ok',
    };
  }

  return { dir, start, run, maybeRun, onClose, exportTo, status };
}

module.exports = { createBackups, planRetention, parseName };
