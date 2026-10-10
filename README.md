# Minecraft Server Manager

Application desktop pour la gestion, l'hébergement et l'administration de serveurs Minecraft locaux (Vanilla et Moddés), avec tunnel public automatisé, filtrage de modpacks et système d'auto-réparation.

[![Version](https://img.shields.io/badge/version-1.0.4-10b981.svg)](https://github.com/Gabriel-Jagueneau/McS-Manager)
[![Plateformes](https://img.shields.io/badge/plateformes-macOS%20%7C%20Windows-3b82f6.svg)](#installation)
[![Minecraft](https://img.shields.io/badge/Minecraft-1.7.10%20%E2%86%92%2026.3-f59e0b.svg)](https://www.minecraft.net/)
[![Licence](https://img.shields.io/badge/licence-MIT-8b5cf6.svg)](LICENSE)

---

## Fonctionnalités principales

- **Tunnel public zero-configuration** : hébergement multijoueur instantané sans ouverture de ports ni configuration NAT de box internet.
- **Filtrage intelligent de modpacks** : détection automatique des modloaders (Fabric, NeoForge, Forge, Quilt) et exclusion des mods purement client (shaders, interfaces, cosmétiques).
- **Auto-réparation et détection d'incidents** : détection proactive des arrêts anormaux avec bouton de réparation automatique (nettoyage des verrous `session.lock`, validation de l'EULA, restauration des scripts de démarrage et binaires).
- **Support des versions récentes** : gestion dynamique des versions Mojang (jusqu'à Minecraft 26.3) et détection des runtimes Java adaptés (Java 21 et Java 25).
- **Console en direct et gestion des joueurs** : flux de logs en temps réel, commandes administratives et gestion centralisée des opérateurs, de la whitelist et des bannissements.
- **Mises à jour automatiques** : détection automatique des nouvelles versions publiées sur GitHub avec notification directe dans l'application.

---

## Installation

### macOS
1. Télécharger le package `.pkg` depuis les [Releases GitHub](https://github.com/Gabriel-Jagueneau/McS-Manager/releases).
2. Lancer l'installateur et suivre les instructions à l'écran.

### Windows
1. Télécharger `MinecraftServerManager-Setup.exe` depuis les [Releases GitHub](https://github.com/Gabriel-Jagueneau/McS-Manager/releases).
2. Exécuter l'assistant d'installation.

### Exécution depuis les sources
```bash
git clone https://github.com/Gabriel-Jagueneau/McS-Manager.git
cd McS-Manager/manager
npm start
```
L'interface est accessible localement à l'adresse `http://localhost:4567`.

---

## Architecture technique

- **Interface utilisateur** : HTML5, CSS Vanilla (thème sombre natif sans framework utilitaire), JavaScript ES6.
- **Backend applicatif** : Node.js, Server-Sent Events (SSE) pour les flux en direct.
- **Réseau** : reverse-proxy chiffré pour l'exposition publique sécurisée.
- **Intégration système** : lanceurs natifs macOS (Cocoa / WebKit) et Windows.

---

## Licence

Ce projet est distribué sous licence MIT. Consulter le fichier [LICENSE](LICENSE) pour plus d'informations.
