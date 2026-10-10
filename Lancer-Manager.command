#!/usr/bin/env bash
# Double-clique sur ce fichier pour lancer l'application Minecraft Server Manager

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "🚀 Lancement de Minecraft Server Manager..."
open "$DIR/Minecraft Server Manager.app"
echo "✅ Application démarrée."
