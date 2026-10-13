#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Packaging de l'Installeur Windows Universel (.exe) ==="
echo "Application : Cubirium"

DIST_DIR="$PROJECT_ROOT/dist"
CACHE_DIR="$PROJECT_ROOT/.cache-win"
mkdir -p "$DIST_DIR" "$CACHE_DIR"

# 1. Vérifier la présence des binaires ARM64 et x64
if [ ! -f "$CACHE_DIR/node-arm64.exe" ]; then
  echo "-> Téléchargement de Node.js portable ARM64 pour Windows..."
  curl -L -o "$CACHE_DIR/node-arm64.exe" "https://nodejs.org/dist/v20.18.0/win-arm64/node.exe"
fi

if [ ! -f "$CACHE_DIR/node-x64.exe" ]; then
  echo "-> Téléchargement de Node.js portable x64 pour Windows..."
  curl -L -o "$CACHE_DIR/node-x64.exe" "https://nodejs.org/dist/v20.18.0/win-x64/node.exe"
fi


# 2. Vérifier makensis
if ! command -v makensis >/dev/null 2>&1; then
  echo "[ERREUR] makensis (NSIS) est requis pour compiler l'installeur Windows."
  echo "Sur macOS : brew install makensis"
  exit 1
fi

cd "$SCRIPT_DIR"

# 3. Compiler l'exécutable natif de lancement (Cubirium.exe)
echo "-> Compilation de l'exécutable natif Windows (Cubirium.exe)..."
makensis launcher.nsi

# 4. Compiler l'installeur Windows .exe
echo "-> Compilation de l'installeur Windows avec NSIS..."
makensis installer.nsi

OUT_EXE="$DIST_DIR/win-Cubirium.exe"
if [ -f "$OUT_EXE" ]; then
  echo ""
  echo "=== Installeur Windows universel généré avec succès ! ==="
  echo "Emplacement : $OUT_EXE"
  ls -lh "$OUT_EXE"
else
  echo "[ERREUR] Échec de la génération de l'installeur Windows."
  exit 1
fi
