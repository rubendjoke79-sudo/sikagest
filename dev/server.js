// Aperçu dans un navigateur (sans Electron) : node dev/server.js puis http://localhost:5178
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createStore, AppError } = require('../src/db');

const store = createStore(process.env.DB || path.join(__dirname, 'dev-data', 'sikagest.db'));
const ROOT = path.join(__dirname, '..', 'renderer');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/api') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let out;
      try { const { method, args } = JSON.parse(body); out = { ok: true, data: store.call(method, args) }; }
      catch (e) { out = { ok: false, error: e instanceof AppError ? e.message : `Erreur interne : ${e.message}` }; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    });
    return;
  }
  const file = path.join(ROOT, req.url === '/' ? 'index.html' : path.normalize(req.url.split('?')[0]).replace(/^([/\\])+/, ''));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(process.env.PORT || 5178, () => console.log(`SikaGest (aperçu) : http://localhost:${process.env.PORT || 5178}`));
