<div align="center">

# 🎮 Minecraft Server Manager

**Gestionnaire de serveurs Minecraft haute performance avec tunnel public gratuit zéro-configuration, filtrage intelligent de modpacks et système d'auto-réparation.**

[![Version](https://img.shields.io/badge/version-1.0.4-emerald.svg)](https://github.com/Gabriel-Jagueneau/McS-Manager)
[![Plateformes](https://img.shields.io/badge/plateformes-macOS%20%7C%20Windows-blue.svg)](#installation)
[![Minecraft](https://img.shields.io/badge/Minecraft-1.7.10%20%E2%86%92%2026.3%20(Snapshots)-gold.svg)](https://www.minecraft.net/)
[![Java](https://img.shields.io/badge/Java-21%20%7C%2025%20Auto--Provisioned-orange.svg)](#caract%C3%A9ristiques)
[![Licence](https://img.shields.io/badge/licence-MIT-purple.svg)](LICENSE)

[Télécharger](#-installation--t%C3%A9l%C3%A9chargement) • [Fonctionnalités](#-fonctionnalit%C3%A9s-principales) • [Architecture](#-architecture-technique) • [Auto-Réparation](#-syst%C3%A8me-dauto-r%C3%A9paration--d%C3%A9tection-de-crash)

---

</div>

## 🌟 Présentation

**Minecraft Server Manager** est une application desktop ultra-fluide conçue pour créer, héberger et administrer des serveurs Minecraft locaux (Vanilla & Moddés) en toute simplicité.

Fini les casse-têtes d'ouverture de ports de box internet (NAT/PAT), d'incompatibilités de versions Java, de crashs de mods purement client ou de serveurs corrompus après une coupure. L'application automatise l'ensemble du cycle de vie de votre serveur.

---

## ✨ Fonctionnalités Principales

### 🌐 1. Tunnel Public Zéro-Configuration (Multijoueur Instantané)
- Dès que vous lancez un monde, un tunnel chiffré haut débit est initialisé en arrière-plan.
- Une adresse publique dédiée (ex: `bore.pub:54445`) est générée instantanément.
- Bouton **"Copier l'IP"** en 1 clic : vos amis collent l'adresse dans leur jeu sans installer aucun logiciel tiers ni VPN.
- Fermeture automatique et propre du tunnel lors de l'extinction du serveur.

### 🛡️ 2. Filtrage Intelligent des Modpacks (Server-Side Filter)
- Glissez-déposez une archive `.zip`, `.mrpack` (Modrinth) ou un dossier de mods.
- Détection automatique du modloader (**Fabric, NeoForge, Forge, Quilt**) et de la version de Minecraft.
- **Exclusion automatique des mods purement client** (plus de 100 signatures reconnues) :
  - *Shaders & Moteurs de rendu* : Iris, Oculus, Sodium, Rubidium, Embeddium, Distant Horizons...
  - *Interfaces & Menus* : FancyMenu, ModMenu, BetterF3, Controlling, Searchables...
  - *Cosmétiques & Animations* : 3D Skin Layers, Wavey Capes, Not Enough Animations, Eating Animation...
  - *Minimaps client* : Xaero's Minimap, JourneyMap (mode client)...
- Rapport d'analyse clair détaillant chaque mod conservé ou exclu.

### 🔧 3. Système d'Auto-Réparation & Détection de Crash
- Détection proactive des pannes de démarrage et des arrêts anormaux.
- En cas de problème, le bouton vert "Lancer" se transforme automatiquement en bouton orange **"Réparer"** :
  - Nettoyage des verrous obsolètes `session.lock`.
  - Réinitialisation et validation de `eula.txt`.
  - Restauration des scripts `run.sh` / `run.bat` et de leurs droits d'exécution.
  - Correction syntaxique de `server.properties` et résolution des conflits de ports.
  - Réinstallation transparente du `server.jar` en cas de binaire manquant.
- Si le monde présente une corruption irréversible, le bouton affiche **"Corrompu"** et ouvre directement le dossier concerné dans l'explorateur pour inspection.

### 📦 4. Gestion Dynamique des Versions & Auto-Provisioning Java
- Liste toujours à jour des versions officielles Mojang (Releases & Snapshots, incluant Minecraft 26.3).
- **Auto-détection multi-Java** :
  - Java 25 (Class 69.0) pour les versions récentes (26.x, 25.x).
  - Java 21 pour les versions intermédiaires.
  - Détection et provisionnement silencieux des runtimes OpenJDK adaptés sur Windows et macOS.

### 💻 5. Console en Direct & Commandes Administrateur
- Flux temps réel avec auto-défilement intelligent et coloration syntaxique (`[INFO]`, `[WARN]`, `[ERROR]`, retours d'exécution).
- Barre de commande interactive avec autocomplétion intelligente (`op <pseudo>`, `whitelist on`, `gamemode creative`, `time set day`...).

### 👥 6. Gestionnaire Avancé de Joueurs
- Panneau dédié aux Opérateurs, Whitelist, Joueurs Bannis et Bannissements IP.
- Résolution dynamique des pseudonymes et UUID (compatible Mojang standard et `usernamecache.json` de Forge/NeoForge).
- Affichage des têtes de skin et statut de connexion.

### 📊 7. Diagnostic Matériel & Recommandations d'Hébergement
- Benchmark matériel intégré en 2 étapes lors du premier lancement.
- Analyse de la RAM totale, des cœurs CPU et du système d'exploitation.
- Conseils personnalisés : **"Héberger et Jouer"**, **"Hébergement Dédié"** ou **"Configuration Limitée"**.

### 🔄 8. Mises à Jour Automatiques Connectées à GitHub
- Vérification périodique des nouvelles versions via l'API GitHub Releases.
- Bannière discrète de notification avec lien de téléchargement direct en 1 clic.
- Bouton de vérification manuelle dans les paramètres de l'application.

---

## 🚀 Installation & Téléchargement

### Option A : macOS (Apple Silicon & Intel)
1. Téléchargez la dernière version du package `.pkg` depuis les [Releases GitHub](https://github.com/Gabriel-Jagueneau/McS-Manager/releases).
2. Double-cliquez sur le fichier d'installation et suivez les instructions.
3. L'application **Minecraft Server Manager** s'installe directement dans vos Applications avec un raccourci bureau.

### Option B : Windows (10 & 11)
1. Téléchargez le programme d'installation `MinecraftServerManager-Setup.exe` depuis les [Releases](https://github.com/Gabriel-Jagueneau/McS-Manager/releases).
2. Lancez l'installateur (avec prise en charge automatique de Java et des dépendances système).
3. Ouvrez le raccourci créé sur votre Bureau.

### Option C : Lancement depuis les Sources (Développeurs)
```bash
# Cloner le dépôt
git clone https://github.com/Gabriel-Jagueneau/McS-Manager.git
cd McS-Manager

# Démarrer le serveur manager
cd manager
npm start
```
Puis accédez à l'interface sur [http://localhost:4567](http://localhost:4567).

---

## 📂 Organisation du Projet

```text
Minecraft-Server-Manager/
├── games/                     # Dossier local de stockage de tous vos mondes
├── manager/                   # Moteur backend et interface graphique
│   ├── public/                # Interface HTML5 / CSS Vanilla / JS ES6
│   │   ├── index.html         # Application Single Page
│   │   ├── styles.css         # Thème sombre glassmorphism natif
│   │   └── app.js             # Logique cliente, SSE, gestionnaire d'état
│   └── src/                   # Backend Node.js
│       ├── server.js          # Serveur HTTP, SSE et routage d'API
│       ├── minecraft-service.js # Cycle de vie des processus, auto-réparation
│       ├── tunnel-service.js  # Tunnel public automatisé
│       ├── mod-filter-service.js # Analyse et filtrage intelligent des mods
│       └── vanilla-installer-service.js # Téléchargement & setup Mojang
├── scripts/                   # Scripts de packaging (macOS .pkg, Windows .exe)
├── package.json
└── README.md
```

---

## 🛠️ Architecture Technique

- **Frontend** : Vanilla HTML5, CSS pur (Zéro framework utilitaire, 100% conforme design system sobre Apple / Linear), JavaScript natif moderne.
- **Backend** : Node.js HTTP natif avec Server-Sent Events (SSE) pour une synchronisation temps réel ultra-légère.
- **Tunneling** : Processus de reverse proxy public chiffré sans NAT avec reprise sur incident.
- **Filtrage Modpack** : Extraction et inspection des manifestes JAR (`fabric.mod.json`, `mods.toml`, `neoforge.mods.toml`, `quilt.mod.json`).

---

## 👤 Auteur

Conçu et développé par **Gabriel Jagueneau**.

* GitHub : [@Gabriel-Jagueneau](https://github.com/Gabriel-Jagueneau)
* Portfolio : [Gabriel Jagueneau](https://github.com/Gabriel-Jagueneau/Portfolio)

---

## 📄 Licence

Ce projet est distribué sous licence MIT. Consultez le fichier [LICENSE](LICENSE) pour plus de détails.
