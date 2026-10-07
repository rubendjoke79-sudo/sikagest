#!/usr/bin/env bash
# Fabrique les fichiers Windows de SikaGest depuis Linux (ou GitHub Actions) :
#   dist/SikaGest-Installation-<version>.exe   (installateur, mises à jour automatiques)
#   dist/SikaGest-Portable-<version>.zip       (à décompresser sur une clé USB)
# Usage : bash tools/build-windows.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
ELECTRON_VERSION="37.2.0"   # Electron 37 = ABI 136
NODE_ABI="136"
BS3_VERSION="12.2.0"
CACHE="${CACHE:-$ROOT/.build-cache}"
OUT="$ROOT/dist"
STAGE="$CACHE/stage"
APPNAME="SikaGest"

mkdir -p "$CACHE/dl" "$OUT"
fetch() { [ -s "$2" ] || curl -fsSL --retry 3 -o "$2" "$1"; }

echo "▶ Téléchargement des composants…"
fetch "https://github.com/electron/electron/releases/download/v${ELECTRON_VERSION}/electron-v${ELECTRON_VERSION}-win32-x64.zip" "$CACHE/dl/electron.zip"
fetch "https://github.com/WiseLibs/better-sqlite3/releases/download/v${BS3_VERSION}/better-sqlite3-v${BS3_VERSION}-electron-v${NODE_ABI}-win32-x64.tar.gz" "$CACHE/dl/bs3-win.tar.gz"
fetch "https://github.com/ip7z/7zip/releases/download/24.09/7z2409-linux-x64.tar.xz" "$CACHE/dl/7z.tar.xz"
fetch "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z" "$CACHE/dl/nsis.7z"
[ -d "$CACHE/bs3src/lib" ] || git clone -q --depth 1 --branch "v${BS3_VERSION}" https://github.com/WiseLibs/better-sqlite3 "$CACHE/bs3src"
[ -x "$CACHE/7z/7zz" ] || { mkdir -p "$CACHE/7z"; tar -xJf "$CACHE/dl/7z.tar.xz" -C "$CACHE/7z"; }
[ -x "$CACHE/nsis/linux/makensis" ] || { "$CACHE/7z/7zz" x -y -o"$CACHE/nsis" "$CACHE/dl/nsis.7z" >/dev/null; chmod +x "$CACHE/nsis/linux/makensis"; }

echo "▶ Assemblage de l'application $VERSION…"
rm -rf "$STAGE"; mkdir -p "$STAGE/$APPNAME"
unzip -q "$CACHE/dl/electron.zip" -d "$STAGE/$APPNAME"
mv "$STAGE/$APPNAME/electron.exe" "$STAGE/$APPNAME/$APPNAME.exe"
rm -f "$STAGE/$APPNAME/resources/default_app.asar" "$STAGE/$APPNAME/LICENSES.chromium.html"
APP="$STAGE/$APPNAME/resources/app"
mkdir -p "$APP/build" "$APP/native" "$APP/node_modules/better-sqlite3"
cp -r "$ROOT/src" "$ROOT/renderer" "$APP/"
cp "$ROOT/build/icon.png" "$APP/build/"
node -e "
  const p=require('$ROOT/package.json');
  const out={name:p.name,productName:p.productName,version:p.version,description:p.description,main:p.main,updates:p.updates,server:p.server};
  require('fs').writeFileSync('$APP/package.json', JSON.stringify(out,null,2));"
cp -r "$CACHE/bs3src/lib" "$CACHE/bs3src/package.json" "$CACHE/bs3src/LICENSE" "$APP/node_modules/better-sqlite3/"
tar -xzf "$CACHE/dl/bs3-win.tar.gz" -C "$CACHE" build/Release/better_sqlite3.node
cp "$CACHE/build/Release/better_sqlite3.node" "$APP/native/better_sqlite3-win32-x64.node"

echo "▶ Installateur…"
INSTALLER="$OUT/$APPNAME-Installation-$VERSION.exe"
NSISDIR="$CACHE/nsis" "$CACHE/nsis/linux/makensis" -V2 \
  -DVERSION="$VERSION" -DSRC="$STAGE/$APPNAME" -DOUTFILE="$INSTALLER" -DICON="$ROOT/build/icon.ico" \
  "$ROOT/tools/installer.nsi"

echo "▶ Version portable…"
PORT="$STAGE/portable/$APPNAME"
rm -rf "$STAGE/portable"; mkdir -p "$STAGE/portable"
cp -r "$STAGE/$APPNAME" "$PORT"
echo "Ce fichier indique que SikaGest fonctionne en mode portable : les données sont gardées dans le dossier SikaGest-donnees." > "$PORT/portable.flag"
printf 'SikaGest %s - version portable\r\n\r\n1. Copiez ce dossier sur une clé USB (ou n importe où).\r\n2. Double-cliquez sur SikaGest.exe.\r\n\r\nVos données sont enregistrées dans le dossier SikaGest-donnees, juste à côté.\r\nPour changer d ordinateur, emportez simplement tout le dossier.\r\n' "$VERSION" > "$PORT/LISEZ-MOI.txt"
rm -f "$OUT/$APPNAME-Portable-$VERSION.zip"
(cd "$STAGE/portable" && "$CACHE/7z/7zz" a -tzip -mx=7 "$OUT/$APPNAME-Portable-$VERSION.zip" "$APPNAME" >/dev/null)

echo "✔ Terminé :"
ls -lh "$OUT"
