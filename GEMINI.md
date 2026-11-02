# Directives et Règles du Projet Cubirium

Ce document recense les règles d'architecture technique, d'ergonomie et de conception pour l'application Cubirium.

---

## 1. Design System & Icônes macOS

* **Intégrité absolue des assets visuels** :
  * Ne jamais incruster, peindre ou forcer manuellement un fond sombre ou un cadre dans les fichiers images sources (`AppIcon.png`, `AppIcon.icns`, `AppIcon.ico`).
  * Les logos, badges et illustrations doivent impérativement conserver leur transparence native (sans fond artificiel).
* **Gestion native macOS du Dock et des tuiles d'icône** :
  * Laisser macOS gérer nativement la tuile, l'habillage et l'adaptation chromatique (mode sombre, teinté, transparent) sans hack de dessin en dur ni injection de composants de vibration (`NSVisualEffectView`) dans `NSDockTile`.
  * Ne pas surcharger `NSDockTile.contentView` avec des fonds opaques ou des vues arbitraires qui cassent l'harmonie du Dock.
  * Conserver le chargement standard de l'image de l'application via `NSApp.applicationIconImage`.

---

## 2. Multiplateforme & Exécution Système (macOS / Windows)

* **Parité stricte macOS et Windows** :
  * Toute fonctionnalité ajoutée ou ajustée doit fonctionner de manière transparente et sans friction sur les deux systèmes d'exploitation.
* **Exécution discrète et silencieuse** :
  * Aucun terminal ou invite de commande `cmd.exe` intempestive ne doit s'afficher lors du lancement ou de l'exécution sur Windows.
* **Réseau & Tunnels** :
  * Prise en charge universelle du protocole de tunnel (relais public ou serveur dédié haute performance avec authentification optionnelle et ping/pong keepalive).

---

## 3. Ergonomie, Rédaction & Sobriété d'Interface

* **Aller à l'essentiel (Zéro blabla technique ou marketing)** :
  * Ne pas exposer les mécanismes d'infrastructure internes (Anycast, capacité de charge théorique, etc.).
  * Les champs doivent être directement modifiables et l'information concise, professionnelle et sans verbiage.
* **Assets authentiques et structure épurée** :
  * Utiliser systématiquement les assets graphiques réels du projet (`assets/logo.png`) et bannir les flat icons génériques.
  * Pas d'empilement de boîtes secondaires ou de cartes imbriquées superflues.
  * Pas de répétition d'informations déjà visibles ailleurs (comme le numéro de version).
* **Hiérarchie des liens externes** :
  * Le site officiel du produit (`cubirium.fr`) est le lien principal mis en avant.
  * Le portfolio de l'auteur (`gjagueneau.fr`) reste secondaire et discret.
* **Navigation par onglets (Sliding Pill)** :
  * Privilégier les contrôles segmentés avec pilule glissante fluide (`sliding pill`) pour les sélecteurs d'onglets.
* **Jamais d'emojis** :
  * Toujours privilégier l'usage de flat icons plutôt que d'emojis.
* **Ton sobre et professionnel des journaux système** :
  * Tous les messages préfixés par le système (`[Système]`, `[Serveur]`, `[Tunnel]`, etc.) doivent adopter un style sobre, direct et d'entreprise. Bannir les formulations familières ou théâtrales.
* **Intégrité absolue du chat et du feedback de jeu** :
  * Ne jamais désactiver ou masquer le retour visuel des commandes exécutées en jeu par les joueurs (`sendCommandFeedback`, `/locate`, etc.). Seuls les messages d'enregistrement périodique du monde (*"Saved the game"*, *"Saving chunks"*) doivent être filtrés du terminal.

---

## 4. Diagnostic & Réparation Résiliente de Mondes

* **Sauvegarde préalable obligatoire** :
  * Toute procédure de réparation ou de diagnostic de corruption doit proposer en premier lieu une sauvegarde complète (export) du monde avant toute altération.
* **Diagnostic méthodique en timeline** :
  * Structurer l'analyse selon les pannes types (ports occupés, mémoire vive, version Java, fichiers NBT/régions `level.dat`, dépendances mods/plugins).
  * Afficher la progression par étapes avec retour visuel clair et passer le monde en état corrompu sécurisé (avec accès direct au dossier du monde) en cas d'échec définitif.


