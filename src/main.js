// SikaGest — processus principal Electron
'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { createStore, AppError } = require('./db');
const updater = require('./updater');

// Version portable (clé USB) : un fichier « portable.flag » à côté du .exe.
// Les données restent alors dans le dossier du logiciel, sur la clé.
const EXE_DIR = path.dirname(process.execPath);
const PORTABLE_DIR = process.env.PORTABLE_EXECUTABLE_DIR
  || (app.isPackaged && fs.existsSync(path.join(EXE_DIR, 'portable.flag')) ? EXE_DIR : null);
// Moteur SQLite précompilé pour Windows, livré avec le logiciel
const NATIVE = path.join(__dirname, '..', 'native', `better_sqlite3-${process.platform}-${process.arch}.node`);
const storeOpts = fs.existsSync(NATIVE) ? { nativeBinding: NATIVE } : {};
const DATA_DIR = PORTABLE_DIR ? path.join(PORTABLE_DIR, 'SikaGest-donnees') : path.join(app.getPath('userData'), 'donnees');
const DB_FILE = path.join(DATA_DIR, 'sikagest.db');

let store;
let win;

if (!app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1024, minHeight: 640,
    title: 'SikaGest', backgroundColor: '#f6f4f0', show: false,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  updater.init(win, { portable: !!PORTABLE_DIR });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  store = createStore(DB_FILE, storeOpts);

  ipcMain.handle('api', (_e, method, args) => {
    try { return { ok: true, data: store.call(method, args) }; }
    catch (e) { return { ok: false, error: e instanceof AppError ? e.message : `Erreur interne : ${e.message}` }; }
  });

  ipcMain.handle('app.info', () => ({ version: app.getVersion(), portable: !!PORTABLE_DIR, dataDir: DATA_DIR, engine: store.driver }));
  ipcMain.handle('app.openDataDir', () => shell.openPath(DATA_DIR));

  // Sauvegarde : copie du fichier de base de données
  ipcMain.handle('backup.export', async () => {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const res = await dialog.showSaveDialog(win, {
      title: 'Enregistrer la sauvegarde', defaultPath: `SikaGest-sauvegarde-${stamp}.sikagest`,
      filters: [{ name: 'Sauvegarde SikaGest', extensions: ['sikagest'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false };
    store.checkpoint();
    fs.copyFileSync(DB_FILE, res.filePath);
    return { ok: true, path: res.filePath };
  });
  ipcMain.handle('backup.import', async () => {
    const res = await dialog.showOpenDialog(win, {
      title: 'Restaurer une sauvegarde', properties: ['openFile'],
      filters: [{ name: 'Sauvegarde SikaGest', extensions: ['sikagest', 'db'] }],
    });
    if (res.canceled || !res.filePaths[0]) return { ok: false };
    const confirm = await dialog.showMessageBox(win, {
      type: 'warning', buttons: ['Annuler', 'Restaurer'], defaultId: 0, cancelId: 0,
      title: 'Restaurer', message: 'Toutes les données actuelles seront remplacées par celles de la sauvegarde. Continuer ?',
    });
    if (confirm.response !== 1) return { ok: false };
    store.checkpoint();
    fs.copyFileSync(DB_FILE, DB_FILE + '.avant-restauration');
    store.close();
    for (const ext of ['-wal', '-shm']) { try { fs.unlinkSync(DB_FILE + ext); } catch (e) { /* absent */ } }
    fs.copyFileSync(res.filePaths[0], DB_FILE);
    store = createStore(DB_FILE, storeOpts);
    return { ok: true };
  });

  // Sauvegarde automatique quotidienne (garde les 10 dernières)
  try {
    const dir = path.join(DATA_DIR, 'sauvegardes-auto');
    fs.mkdirSync(dir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const target = path.join(dir, `auto-${today}.sikagest`);
    if (!fs.existsSync(target) && fs.existsSync(DB_FILE)) { store.checkpoint(); fs.copyFileSync(DB_FILE, target); }
    const files = fs.readdirSync(dir).filter((f) => f.startsWith('auto-')).sort();
    while (files.length > 10) fs.unlinkSync(path.join(dir, files.shift()));
  } catch (e) { /* non bloquant */ }

  createWindow();
});

app.on('window-all-closed', () => { if (store) { store.checkpoint(); store.close(); } app.quit(); });
