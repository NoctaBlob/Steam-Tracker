# Stream-NoctaBlob

Stack de streaming pour la chaîne Twitch **NoctaBlob**.  
Direction artistique : style microscopique organique — fond noir `#0a0a0c`, blobs blancs `#f0f0ee`, typographie IBM Plex Mono.

---

## Structure du projet

```
Stream-NoctaBlob/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD → build & push image sur ghcr.io
├── data/
│   ├── .gitkeep
│   └── tuna_track.txt          # Écrit par TUNA (ignoré par git)
├── scenes/
│   ├── Scene1-EnJeu.html       # Scène principale — gameplay
│   ├── Scene2-JustChatting.html
│   ├── Scene3-PauseBRB.html
│   ├── Scene4-Intro.html
│   └── Scene5-FinDeStream.html
├── widgets/
│   ├── Steam-Library.html      # Backlog Steam avec progression
│   ├── Steam-Tracker.html      # Succès du jeu en cours
│   └── Twitch-Overlay.html     # Chat + barre infos en temps réel
├── .env                        # Variables d'environnement (non commité)
├── .gitignore
├── docker-compose.yml
├── Dockerfile
└── server.js                   # API Node.js
```

---

## Prérequis

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows)
- [OBS Studio](https://obsproject.com/) + plugin [TUNA](https://obsproject.com/forum/resources/tuna.843/)
- Clé API Steam → [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)
- Application Twitch → [dev.twitch.tv/console](https://dev.twitch.tv/console)

---

## Installation

### 1. Variables d'environnement

Créer un fichier `.env` à la racine :

```env
# Steam
STEAM_API_KEY=ta_clé_steam
STEAM_ID=ton_steam_id_64

# Twitch
TWITCH_CLIENT_ID=ton_client_id
TWITCH_CLIENT_SECRET=ton_client_secret
TWITCH_CHANNEL=noctablob
TWITCH_CHANNEL_ID=ton_channel_id_numérique
```

> Le Channel ID numérique est disponible sur [streamweasels.com/tools/convert-twitch-username-to-user-id](https://www.streamweasels.com/tools/convert-twitch-username-to-user-id/)

### 2. Lancer les services

```bash
docker compose up
```

L'image est automatiquement tirée depuis `ghcr.io/noctablob/stream-noctablob:latest`.

### 3. Configurer TUNA dans OBS

- **Source de musique** → `Windows Media Control`
- **Chemin de l'info** → `C:\Developpement\Stream-NoctaBlob\data\tuna_track.txt`
- **Format de la sortie** → `{json_compact}`
- Cliquer sur **Démarrer**

---

## API — Routes disponibles

Le serveur tourne sur `http://localhost:3000`.

### Steam

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/achievements` | Jeu Steam en cours + liste des succès |
| `GET` | `/api/library` | Progression de tous les jeux du backlog |

**Exemple `/api/achievements` (jeu en cours) :**
```json
{
  "playing": true,
  "gameName": "Baldur's Gate 3",
  "gameId": "1086940",
  "achievements": [
    { "name": "Héros de la République", "icon": "https://...", "achieved": true }
  ]
}
```

**Exemple `/api/achievements` (hors jeu) :**
```json
{ "playing": false, "message": "Aucun jeu Steam en cours." }
```

**Exemple `/api/library` :**
```json
[
  { "gameName": "Baldur's Gate 3", "gameId": "1086940", "unlocked": 31, "total": 54, "percent": 57 },
  { "gameName": "Cyberpunk 2077",  "gameId": "1091500", "unlocked": 4,  "total": 57, "percent": 7  }
]
```

---

### Twitch

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/twitch/info` | Dernier follower, sub et don |
| `GET` | `/api/stream` | Flux SSE — chat en temps réel |

**Exemple `/api/twitch/info` :**
```json
{
  "lastFollower": "specimen_07",
  "lastSub": "culture_petri",
  "lastDon": null,
  "lastDonAmount": null
}
```

**`/api/stream` — Server-Sent Events :**  
Connexion persistante. Émet un événement `chat` à chaque message du chat Twitch :
```json
{
  "id": "abc123",
  "username": "noct_viewer",
  "color": "#f0f0ee",
  "badges": "subscriber/1",
  "text": "bonsoir l'organisme",
  "ts": 1719183600000
}
```

Usage dans un widget HTML :
```js
const es = new EventSource('http://localhost:3000/api/stream');
es.addEventListener('chat', (e) => {
  const msg = JSON.parse(e.data);
  console.log(msg.username, msg.text);
});
```

---

### TUNA (musique)

| Méthode | Route | Description |
|---------|-------|-------------|
| `GET` | `/api/tuna` | Titre et artiste en cours de lecture |

**Exemple `/api/tuna` (musique en cours) :**
```json
{ "title": "Demon Mode", "artist": "Fearless Mix", "playing": true }
```

**Exemple `/api/tuna` (aucune musique) :**
```json
{ "title": null, "artist": null, "playing": false }
```

> TUNA écrit le fichier `data/tuna_track.txt` toutes les secondes.  
> Le serveur poll ce fichier toutes les **2 secondes**.

---

## Widgets HTML — Usage dans OBS

Ajouter chaque fichier comme **Browser Source** dans OBS.

| Fichier | Port / URL | Résolution | Description |
|---------|-----------|------------|-------------|
| `Scene1-EnJeu.html` | Fichier local | 3840×2160 | Scène gameplay principale |
| `Scene2-JustChatting.html` | Fichier local | 3840×2160 | Scène discussion |
| `Scene3-PauseBRB.html` | Fichier local | 3840×2160 | Écran de pause |
| `Scene4-Intro.html` | Fichier local | 3840×2160 | Écran de démarrage |
| `Scene5-FinDeStream.html` | Fichier local | 3840×2160 | Écran de fin |
| `Steam-Library.html` | `http://localhost:8080/widgets/Steam-Library.html` | 3840×2160 | Backlog Steam |
| `Steam-Tracker.html` | `http://localhost:8080/widgets/Steam-Tracker.html` | 800×400 | Succès jeu en cours |
| `Twitch-Overlay.html` | `http://localhost:8080/widgets/Twitch-Overlay.html` | 3840×2160 | Chat + barre infos |

> Les widgets qui consomment l'API doivent être servis via `http://localhost:8080` (Nginx),  
> pas en `file://` — les requêtes vers `localhost:3000` seraient bloquées sinon.

---

## Déploiement

Tout push sur la branche `main` déclenche le workflow GitHub Actions qui :
1. Build l'image Docker depuis le `Dockerfile`
2. Push l'image sur `ghcr.io/noctablob/stream-noctablob:latest`

Sur la machine de stream, un simple `docker compose up` suffit pour avoir la dernière version.

---

## Direction artistique

| Rôle | Valeur |
|------|--------|
| Fond | `#0a0a0c` |
| Blobs / texte principal | `#f0f0ee` |
| Texte secondaire | `#b6b6bc` |
| Texte tertiaire | `#8a8a90` |
| Texte discret | `#6a6a72` |
| Texte labo | `#3a3a40` |
| Grille | `#1e1e24` |
| Police | IBM Plex Mono (400 / 500 / 600) |

Style : organique microscopique nocturne. Formes blob abstraites asymétriques, règles de mesure en μm, grille pointillée quasi-invisible.
