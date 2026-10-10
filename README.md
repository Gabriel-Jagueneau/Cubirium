# Minecraft Server Manager

Application desktop pour la gestion, l'hébergement et l'administration de serveurs Minecraft locaux (Vanilla et Moddés), avec tunnel public automatisé, filtrage de modpacks et système d'auto-réparation.

[![Version](https://img.shields.io/github/v/release/Gabriel-Jagueneau/McS-Manager?color=10b981&label=version)](https://github.com/Gabriel-Jagueneau/McS-Manager/releases/latest)
[![Plateformes](https://img.shields.io/badge/plateformes-macOS%20%7C%20Windows-3b82f6.svg)](#installation)
[![Minecraft](https://img.shields.io/badge/Minecraft-1.7.10%20%E2%86%92%2026.3-f59e0b.svg)](https://www.minecraft.net/)
[![Licence](https://img.shields.io/badge/licence-MIT-8b5cf6.svg)](LICENSE)

---

## Fonctionnalités principales

- **Mise à jour intégrée transparente (In-App)** : mise à niveau automatique en un clic directement depuis l'application, sans devoir retélécharger ni réexécuter d'installeur externe.
- **Tunnel public zero-configuration** : hébergement multijoueur instantané sans ouverture de ports ni configuration NAT de box internet.
- **Sauvegarde et persistance intégrale** : préservation totale du temps de jeu cumulé, des logs de console et des données des joueurs (`usercache.json` et `usernamecache.json` pour Forge/NeoForge) lors des exports et imports.
- **Diagnostic matériel & Benchmark** : évaluation automatique de la configuration (CPU, RAM, OS) et recommandations concrètes d'hébergement (*Hôte & Jeu*, *Hôte dédié*, *Limité*).
- **Filtrage intelligent de modpacks** : détection automatique des modloaders (Fabric, NeoForge, Forge, Quilt) et exclusion des mods purement client (shaders, interfaces, cosmétiques).
- **Auto-réparation et détection d'incidents** : détection proactive des arrêts anormaux avec bouton de réparation automatique (nettoyage des verrous `session.lock`, validation de l'EULA, restauration des scripts de démarrage et binaires).
- **Support des versions récentes & Java 25** : gestion dynamique des versions Mojang (jusqu'à Minecraft 26.3) et détection/provisioning automatique des runtimes Java adaptés (Java 21 et Java 25).
- **Console en direct et gestion des joueurs** : flux de logs en temps réel, commandes administratives et gestion centralisée des opérateurs, de la whitelist et des bannissements.

---

## Installation

### macOS
1. Télécharger l'installeur [mac-McS-Manager.pkg](https://github.com/Gabriel-Jagueneau/McS-Manager/releases/latest/download/mac-McS-Manager.pkg).
2. Lancer l'installateur et suivre les instructions à l'écran.

### Windows
1. Télécharger l'exécutable [win-McS-Manager.exe](https://github.com/Gabriel-Jagueneau/McS-Manager/releases/latest/download/win-McS-Manager.exe).
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
