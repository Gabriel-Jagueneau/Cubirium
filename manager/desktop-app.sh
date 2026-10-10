#!/usr/bin/env bash

# Minecraft Server Manager - Desktop Launcher
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if [ -d "$ROOT_DIR/Minecraft Server Manager.app" ]; then
    open "$ROOT_DIR/Minecraft Server Manager.app"
else
    # Fallback si le .app n'est pas trouvé
    PORT=4567
    URL="http://localhost:$PORT"
    open "$URL"
fi
