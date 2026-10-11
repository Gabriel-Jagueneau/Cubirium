#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Packaging de l'Installeur macOS Natif (.pkg) ==="
echo "Application : Minecraft Server Manager"

# 1. Dossiers de construction
BUILD_TMP="$PROJECT_ROOT/.build-pkg-tmp"
DIST_DIR="$PROJECT_ROOT/dist"
STAGING_APP="$BUILD_TMP/Minecraft Server Manager.app"
PKG_OUT="$DIST_DIR/mac-McS-Manager.pkg"

rm -rf "$BUILD_TMP"
mkdir -p "$BUILD_TMP" "$DIST_DIR"

# 2. Compilation de l'exécutable natif Swift
echo "-> Compilation de l'exécutable natif Swift..."
mkdir -p "$PROJECT_ROOT/.swift-cache"
swiftc -module-cache-path "$PROJECT_ROOT/.swift-cache" \
  -O -framework Cocoa -framework WebKit \
  "$PROJECT_ROOT/manager/src/native-app/main.swift" \
  -o "$PROJECT_ROOT/Minecraft Server Manager.app/Contents/MacOS/MinecraftServerManager"

# 2.1 Synchronisation des sources et de la version dans le bundle local
LOCAL_RESOURCES="$PROJECT_ROOT/Minecraft Server Manager.app/Contents/Resources"
mkdir -p "$LOCAL_RESOURCES/manager"
rm -rf "$LOCAL_RESOURCES/manager/src" "$LOCAL_RESOURCES/manager/public"
cp -R "$PROJECT_ROOT/manager/src" "$LOCAL_RESOURCES/manager/"
cp -R "$PROJECT_ROOT/manager/public" "$LOCAL_RESOURCES/manager/"
cp "$PROJECT_ROOT/manager/package.json" "$LOCAL_RESOURCES/manager/"
rm -rf "$LOCAL_RESOURCES/manager/logs" "$LOCAL_RESOURCES/manager/app-settings.json"
rm -f "$LOCAL_RESOURCES/manager/.welcome-completed"
find "$LOCAL_RESOURCES/bin" -type f ! -name "node" -delete 2>/dev/null || true

# Mise à jour automatique de Info.plist avec la version de package.json
APP_VERSION=$(node -e "try{console.log(require('$PROJECT_ROOT/manager/package.json').version)}catch(_){console.log('1.0.5')}")
PLIST_FILE="$PROJECT_ROOT/Minecraft Server Manager.app/Contents/Info.plist"
if [ -f "$PLIST_FILE" ]; then
  sed -i '' "s/<string>[0-9]*\.[0-9]*\.[0-9]*<\/string>/<string>$APP_VERSION<\/string>/g" "$PLIST_FILE" 2>/dev/null || true
fi

# 3. Préparation du bundle .app
echo "-> Préparation du bundle .app..."
cp -R "$PROJECT_ROOT/Minecraft Server Manager.app" "$STAGING_APP"

RESOURCES_DIR="$STAGING_APP/Contents/Resources"
BIN_DIR="$RESOURCES_DIR/bin"
mkdir -p "$BIN_DIR"

# 4. Intégration du binaire autonome Node.js
NODE_SRC="$(which node 2>/dev/null || true)"
if [ -z "$NODE_SRC" ] || [ ! -x "$NODE_SRC" ]; then
  for cand in "$HOME/.nvm/versions/node/"*/bin/node /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node; do
    if [ -x "$cand" ]; then
      NODE_SRC="$cand"
      break
    fi
  done
fi

echo "-> Intégration du binaire Node.js..."
cp "$NODE_SRC" "$BIN_DIR/node"
chmod +x "$BIN_DIR/node"

# 5. Intégration des fichiers web et backend
echo "-> Intégration des fichiers web et backend..."
mkdir -p "$RESOURCES_DIR/manager"
cp -R "$PROJECT_ROOT/manager/src" "$RESOURCES_DIR/manager/"
cp -R "$PROJECT_ROOT/manager/public" "$RESOURCES_DIR/manager/"
cp "$PROJECT_ROOT/manager/package.json" "$RESOURCES_DIR/manager/"

rm -rf "$RESOURCES_DIR/manager/logs"
rm -f "$RESOURCES_DIR/manager/app-settings.json"
rm -f "$RESOURCES_DIR/manager/.welcome-completed"

# 6. Signature de code ad-hoc
echo "-> Signature ad-hoc du bundle..."
codesign --force --deep --sign - "$STAGING_APP" 2>/dev/null || true

# 7. Préparation des scripts d'installation (postinstall)
PKG_SCRIPTS="$BUILD_TMP/pkg-scripts"
mkdir -p "$PKG_SCRIPTS"

cat << 'EOF' > "$PKG_SCRIPTS/postinstall"
#!/bin/bash
LOGGED_USER=$(stat -f "%Su" /dev/console 2>/dev/null || echo "")

if [ -z "$LOGGED_USER" ] || [ "$LOGGED_USER" = "root" ]; then
  LOGGED_USER=$(who | awk 'NR==1{print $1}')
fi

APP_TARGET="/Applications/Minecraft Server Manager.app"

# Retirer les restrictions de quarantaine Apple Gatekeeper
xattr -cr "$APP_TARGET" 2>/dev/null || true

if [ -n "$LOGGED_USER" ] && [ "$LOGGED_USER" != "root" ]; then
  USER_HOME=$(eval echo "~$LOGGED_USER")
  USER_UID=$(id -u "$LOGGED_USER" 2>/dev/null || echo "501")

  # Donner la pleine propriété à l'utilisateur connecté pour permettre la suppression
  chown -R "$LOGGED_USER:staff" "$APP_TARGET" 2>/dev/null || true
  chmod -R 775 "$APP_TARGET" 2>/dev/null || true

  # Nettoyer les anciens résidus WebKit pour réafficher le welcome à la réinstallation
  rm -rf "$USER_HOME/Library/WebKit/com.gabriel.minecraftservermanager" 2>/dev/null || true
  rm -rf "$USER_HOME/Library/WebKit/fr.gabriel.minecraftservermanager" 2>/dev/null || true
  rm -rf "$USER_HOME/Library/WebKit/Minecraft Server Manager" 2>/dev/null || true
  rm -rf "$USER_HOME/Library/Caches/com.gabriel.minecraftservermanager" 2>/dev/null || true
  rm -rf "$USER_HOME/Library/Caches/fr.gabriel.minecraftservermanager" 2>/dev/null || true
  rm -rf "$USER_HOME/Library/Saved Application State/com.gabriel.minecraftservermanager.savedState" 2>/dev/null || true
  rm -rf "$USER_HOME/Library/Saved Application State/fr.gabriel.minecraftservermanager.savedState" 2>/dev/null || true

  # Créer le raccourci sur le Bureau
  if [ -d "$USER_HOME/Desktop" ]; then
    rm -rf "$USER_HOME/Desktop/Minecraft Server Manager" 2>/dev/null || true
    DESKTOP_SHORTCUT="$USER_HOME/Desktop/Minecraft Server Manager.app"
    rm -rf "$DESKTOP_SHORTCUT" 2>/dev/null || true
    ln -sf "$APP_TARGET" "$DESKTOP_SHORTCUT"
    chown -h "$LOGGED_USER" "$DESKTOP_SHORTCUT" 2>/dev/null || true
  fi

  # Vérification et installation en arrière-plan d'OpenJDK 25 via Homebrew si manquant
  if ! /usr/libexec/java_home -v 25 >/dev/null 2>&1 && [ ! -d "/opt/homebrew/opt/openjdk@25" ] && [ ! -d "/Library/Java/JavaVirtualMachines/jdk-25.jdk" ]; then
    if su - "$LOGGED_USER" -c "which brew" >/dev/null 2>&1; then
      su - "$LOGGED_USER" -c "brew install openjdk@25" >/dev/null 2>&1 &
    fi
  fi

  # Lancer l'application dans la session graphique de l'utilisateur
  launchctl asuser "$USER_UID" open "$APP_TARGET" 2>/dev/null || \
  sudo -u "$LOGGED_USER" open "$APP_TARGET" 2>/dev/null || \
  open "$APP_TARGET" 2>/dev/null || true
else
  open "$APP_TARGET" 2>/dev/null || true
fi

exit 0
EOF

chmod +x "$PKG_SCRIPTS/postinstall"

# 8. Création de la racine du paquet
PKG_ROOT="$BUILD_TMP/pkg_root"
mkdir -p "$PKG_ROOT"
cp -R "$STAGING_APP" "$PKG_ROOT/"

# 9. Compilation du paquet .pkg natif
echo "-> Génération du paquet natif .pkg..."
rm -f "$PKG_OUT"
pkgbuild --root "$PKG_ROOT" \
  --identifier "com.gabriel.minecraftservermanager" \
  --version "1.0.5" \
  --install-location "/Applications" \
  --scripts "$PKG_SCRIPTS" \
  "$PKG_OUT"

rm -rf "$BUILD_TMP"

echo ""
echo "=== Paquet .pkg généré avec succès ! ==="
echo "Emplacement : $PKG_OUT"
ls -lh "$PKG_OUT"
