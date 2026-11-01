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
