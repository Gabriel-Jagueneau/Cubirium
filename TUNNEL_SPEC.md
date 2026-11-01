# Spécification Technique du Protocole Relais Tunnel Cubirium

Ce document décrit l'architecture et les spécifications du protocole réseau utilisé par Cubirium pour relier les serveurs Minecraft locaux à Internet via un serveur relais sans ouverture de port box.

---

## 1. Vue d'ensemble de l'Architecture

Le système repose sur un modèle TCP multiplexé composé de deux types de flux :

1. **Flux de Contrôle (Control Stream)** :
   - Établi par le client Cubirium vers le port de contrôle du serveur relais (par défaut TCP `7835`).
   - Maintient la session active, notifie les nouvelles arrivées de joueurs et gère le heartbeat / keepalive.

2. **Flux de Données (Proxy / Data Streams)** :
   - Établis à la demande par le client Cubirium vers le port de contrôle du relais lorsqu'un joueur distant se connecte.
   - Une fois la poignée de main `Accept` effectuée, la connexion bascule en transfert brut TCP direct (zéro encadrement applicatif, zéro surcoût de latence).

---

## 2. Format des Messages (Wire Protocol)

Tous les échanges sur la liaison de contrôle sont formatés en **JSON UTF-8 terminé par un octet nul** (`\0` soit `0x00`).

### 2.1. Initialisation & Attribution de Port

#### Requête Client -> Serveur Relais
Dès la connexion TCP au port de contrôle, le client envoie :
```json
{
  "Hello": 0,
  "auth": "token_optionnel"
}
```
- `"Hello"` : entier représentant le port public souhaité (`0` pour laisser le serveur choisir un port disponible aléatoire, ou un port spécifique comme `25565`).
- `"auth"` / `"token"` : chaîne optionnelle contenant le jeton d'authentification configuré dans Cubirium.

#### Réponse Serveur Relais -> Client
Si la demande est acceptée et le port réservé :
```json
{
  "Hello": 28419
}
```
*(Le format alternatif `{"port": 28419}` est également supporté).*

Si le port demandé est indisponible ou si une erreur survient :
```json
{
  "Error": "port already in use"
}
```

---

### 2.2. Connexion d'un Joueur Distant & Déclenchement de Flux

1. Un joueur Minecraft se connecte à `<relais_host>:<port_public>`.
2. Le serveur relais génère un identifiant unique (UUID ou chaîne hexadécimale) et le transmet au client sur le flux de contrôle :
```json
{
  "Connection": "4b68e7d2-7c39-4d22-811c-d76077ff68ba"
}
```
*(Les clés alternatives `"connection"` ou `"id"` sont également reconnues).*

3. Dès réception, Cubirium ouvre une **nouvelle connexion TCP distincte** vers `<relais_host>:<port_controle>` et envoie la trame d'acceptation :
```json
{
  "Accept": "4b68e7d2-7c39-4d22-811c-d76077ff68ba",
  "auth": "token_optionnel"
}
```
4. Immédiatement après cette trame, le serveur relais et le client Cubirium raccordent les flux TCP de manière transparente :
   - Côté client : le flux est directement relié au port local Minecraft (`127.0.0.1:25565`).
   - Côté relais : le flux est directement relié au socket du joueur distant.

---

### 2.3. Maintien de Liaison (Heartbeat & Keepalive)

Pour éviter les déconnexions par les pare-feux d'état (stateful NAT / firewalls) :
- Le serveur relais peut envoyer périodiquement (toutes les 1 à 5 secondes) :
  - Soit la chaîne brute `"Heartbeat"\0` (format Bore natif).
  - Soit l'objet JSON `{"Heartbeat": true}\0`.
  - Soit un ping explicite `{"ping": true}\0`.
- À la réception d'un ping `{"ping": true}\0`, Cubirium répond immédiatement `{"pong": true}\0`.
- En cas de silence radio supérieur à 35 secondes, Cubirium relance automatiquement la connexion.

---

## 3. Optimisations Recommandées pour la Haute Performance

1. **Désactiver l'algorithme de Nagle (`TCP_NODELAY`)** :
   Indispensable sur tous les sockets (serveur et client) pour éliminer la latence tampon et garantir une transmission immédiate des paquets de mouvement Minecraft.
2. **Transfert Zéro-Copie (`splice` / `sendfile` / `io.Copy`)** :
   Le relais ne doit pas décoder ni analyser les paquets Minecraft en cours de partie ; un pontage direct en mémoire noyau maximise le débit et minimise l'usage CPU.
3. **Keepalive Système (`SO_KEEPALIVE`)** :
   Activer les sondes TCP keepalive système toutes les 10 à 15 secondes.
4. **Buffer Pool** :
   Réutiliser les tampons mémoire (ex: `sync.Pool` en Go) pour supprimer la pression du Garbage Collector lors de charges élevées.

---

## 4. Exemple d'Implémentation de Référence en Go

Ci-dessous une structure minimale ultra-légère et performante en Go :

```go
package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"sync"
)

type ControlMsg struct {
	Hello int    `json:"Hello,omitempty"`
	Accept string `json:"Accept,omitempty"`
	Auth   string `json:"auth,omitempty"`
}

var (
	pendingConns = make(map[string]net.Conn)
	mu           sync.Mutex
	validToken   = "mon_token_secret" // Laissez vide pour accès public
)

func randomUUID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func handleClient(conn net.Conn) {
	defer conn.Close()
	// Activer TCP_NODELAY
	if tc, ok := conn.(*net.TCPConn); ok {
		tc.SetNoDelay(true)
	}

	reader := bufio.NewReader(conn)
	data, err := reader.ReadBytes(0x00)
	if err != nil {
		return
	}
	data = data[:len(data)-1] // retirer \0

	var msg ControlMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	// Vérification de jeton optionnelle
	if validToken != "" && msg.Auth != validToken {
		conn.Write([]byte("{\"Error\":\"unauthorized\"}\x00"))
		return
	}

	// 1. Poignée de main de données (Accept)
	if msg.Accept != "" {
		mu.Lock()
		playerConn, ok := pendingConns[msg.Accept]
		delete(pendingConns, msg.Accept)
		mu.Unlock()

		if !ok {
			return
		}
		defer playerConn.Close()

		// Pontage bidirectionnel brut (zéro copie)
		go io.Copy(conn, playerConn)
		io.Copy(playerConn, conn)
		return
	}

	// 2. Initialisation du contrôle (Hello)
	publicListener, err := net.Listen("tcp", fmt.Sprintf(":%d", msg.Hello))
	if err != nil {
		// En cas d'indisponibilité, port aléatoire
		publicListener, err = net.Listen("tcp", ":0")
		if err != nil {
			return
		}
	}
	defer publicListener.Close()

	assignedPort := publicListener.Addr().(*net.TCPAddr).Port
	ack, _ := json.Marshal(map[string]int{"Hello": assignedPort})
	conn.Write(append(ack, 0x00))

	// Écoute des joueurs externes sur le port public
	go func() {
		for {
			player, err := publicListener.Accept()
			if err != nil {
				break
			}
			if tc, ok := player.(*net.TCPConn); ok {
				tc.SetNoDelay(true)
			}
			id := randomUUID()
			mu.Lock()
			pendingConns[id] = player
			mu.Unlock()

			notify, _ := json.Marshal(map[string]string{"Connection": id})
			conn.Write(append(notify, 0x00))
		}
	}()

	// Boucle de contrôle & Heartbeats
	for {
		_, err := reader.ReadBytes(0x00)
		if err != nil {
			break
		}
	}
}

func main() {
	controlListener, err := net.Listen("tcp", ":7835")
	if err != nil {
		panic(err)
	}
	fmt.Println("Serveur relais Cubirium actif sur :7835")
	for {
		c, err := controlListener.Accept()
		if err == nil {
			go handleClient(c)
		}
	}
}
```
