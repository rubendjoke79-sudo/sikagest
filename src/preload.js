'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('sika', {
  call: async (method, args) => {
    const r = await ipcRenderer.invoke('api', method, args);
    if (!r.ok) throw new Error(r.error);
    return r.data;
  },
  info: () => ipcRenderer.invoke('app.info'),
  openDataDir: () => ipcRenderer.invoke('app.openDataDir'),
  backupExport: () => ipcRenderer.invoke('backup.export'),
  backupImport: () => ipcRenderer.invoke('backup.import'),
  backupStatus: () => ipcRenderer.invoke('backup.status'),
  openBackupDir: () => ipcRenderer.invoke('backup.openAutoDir'),
  checkUpdates: () => ipcRenderer.invoke('update.check'),
  syncNow: () => ipcRenderer.invoke('register.sync'),
  installUpdate: () => ipcRenderer.invoke('update.install'),
  onUpdate: (cb) => ipcRenderer.on('update.status', (_e, s) => cb(s)),
});
