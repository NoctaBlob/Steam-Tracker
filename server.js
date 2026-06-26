const express = require('express');
const axios   = require('axios');
const http    = require('http');
const fs      = require('fs');
const WebSocket = require('ws');

const app  = express();
const PORT = 3000;

app.use(express.json());

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID      = process.env.STEAM_ID;

const TWITCH_CLIENT_ID     = process.env.TWITCH_CLIENT_ID;
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET;
const TWITCH_CHANNEL       = process.env.TWITCH_CHANNEL;   // ex: "noctablob"
const TWITCH_CHANNEL_ID    = process.env.TWITCH_CHANNEL_ID; // ID numérique du channel

// ─────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
});

// ─────────────────────────────────────────────
// Configuration jeux Steam
// ─────────────────────────────────────────────
const JEUX_DU_MOMENT = {
    "289650": "Assassin's Creed Unity",
    "812140": "Assassin's Creed Odyssey",
    "3064970": "Assassin's Creed Shadows",
    "2208920": "Assassin's Creed Valhalla",
    "1086940": "Baldur's Gate 3",
    "2928010": "Clair Obscur: Expedition 33",
    "1091500": "Cyberpunk 2077",
    "239140": "Dying Light",
    "990080": "Hogwarts Legacy",
    "214510": "LEGO® The Lord of the Rings™",
    "1627720": "Lies of P",
    "1817190": "Marvel's Spider-Man: Miles Morales",
    "1817070": "Marvel's Spider-Man Remastered",
    "601360": "Portal: Revolution",
    "526870": "Satisfactory",
    "250900": "The Binding of Isaac: Rebirth"
};

// ─────────────────────────────────────────────
// ROUTE 1 : Steam Tracker (succès en cours)
// ─────────────────────────────────────────────
app.get('/api/achievements', async (req, res) => {
    console.log(`\n[ROUTE] /api/achievements`);
    try {
        if (!STEAM_API_KEY || !STEAM_ID)
            return res.status(500).json({ error: "Variables Steam manquantes." });

        const playerSummary = await axios.get(
            `http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${STEAM_ID}`
        );
        const player = playerSummary.data.response.players[0];
        if (!player) return res.status(404).json({ error: "Joueur introuvable." });

        const gameId = player.gameid;
        if (!gameId) return res.json({ playing: false, message: "Aucun jeu Steam en cours." });

        const [playerAchievements, gameSchema] = await Promise.all([
            axios.get(`http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${gameId}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}`),
            axios.get(`http://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${STEAM_API_KEY}&appid=${gameId}&l=french`)
        ]);

        const achievementsList = playerAchievements.data.playerstats.achievements;
        const schemaList = gameSchema.data.game.availableGameStats.achievements;

        const fullAchievements = achievementsList.map(ach => {
            const details = schemaList.find(s => s.name === ach.apiname);
            return {
                name: details ? details.displayName : ach.apiname,
                icon: details ? (ach.achieved === 1 ? details.icon : details.icongray) : '',
                achieved: ach.achieved === 1
            };
        });

        const gameName = JEUX_DU_MOMENT[gameId] || gameSchema.data.game.gameName;
        res.json({ playing: true, gameName, gameId, achievements: fullAchievements });

    } catch (error) {
        console.error(`[ERROR] /api/achievements : ${error.message}`);
        res.status(500).json({ error: "Erreur Steam API." });
    }
});

// ─────────────────────────────────────────────
// ROUTE 2 : Steam Library (backlog)
// ─────────────────────────────────────────────
app.get('/api/library', async (req, res) => {
    console.log(`\n[ROUTE] /api/library`);
    try {
        if (!STEAM_API_KEY || !STEAM_ID)
            return res.status(500).json({ error: "Variables Steam manquantes." });

        let libraryData = [];
        const appIds = Object.keys(JEUX_DU_MOMENT);

        for (const appId of appIds) {
            const customName = JEUX_DU_MOMENT[appId];
            try {
                const stats = await axios.get(
                    `http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}`
                );
                if (stats.data?.playerstats?.achievements) {
                    const total    = stats.data.playerstats.achievements.length;
                    const unlocked = stats.data.playerstats.achievements.filter(a => a.achieved === 1).length;
                    libraryData.push({ gameName: customName, gameId: appId, unlocked, total, percent: total > 0 ? Math.round((unlocked / total) * 100) : 0 });
                }
            } catch {
                libraryData.push({ gameName: customName, gameId: appId, unlocked: 0, total: 0, percent: 0 });
            }
        }

        libraryData.sort((a, b) => a.gameName.localeCompare(b.gameName));
        res.json(libraryData);

    } catch (error) {
        console.error(`[ERROR] /api/library : ${error.message}`);
        res.status(500).json({ error: "Erreur Library API." });
    }
});

// ─────────────────────────────────────────────
// TWITCH — token OAuth app (Client Credentials)
// ─────────────────────────────────────────────
let twitchToken = null;
let twitchTokenExpiry = 0;

async function getTwitchToken() {
    if (twitchToken && Date.now() < twitchTokenExpiry) return twitchToken;
    console.log("[TWITCH] Renouvellement du token OAuth...");
    const r = await axios.post(
        `https://id.twitch.tv/oauth2/token`,
        null,
        { params: { client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'client_credentials' } }
    );
    twitchToken = r.data.access_token;
    twitchTokenExpiry = Date.now() + (r.data.expires_in - 60) * 1000;
    console.log("[TWITCH] Token obtenu.");
    return twitchToken;
}

// ─────────────────────────────────────────────
// ROUTE 3 : Twitch — dernier follower / sub / don
// ─────────────────────────────────────────────
app.get('/api/twitch/info', async (req, res) => {
    console.log(`\n[ROUTE] /api/twitch/info`);
    try {
        if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TWITCH_CHANNEL_ID)
            return res.status(500).json({ error: "Variables Twitch manquantes." });

        const token = await getTwitchToken();
        const headers = { 'Client-Id': TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` };

        const [followersRes, subsRes] = await Promise.allSettled([
            axios.get(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${TWITCH_CHANNEL_ID}&first=1`, { headers }),
            axios.get(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${TWITCH_CHANNEL_ID}&first=1`, { headers })
        ]);

        const lastFollower = followersRes.status === 'fulfilled' && followersRes.value.data.data.length > 0
            ? followersRes.value.data.data[0].user_name : null;

        const lastSub = subsRes.status === 'fulfilled' && subsRes.value.data.data.length > 0
            ? subsRes.value.data.data[0].user_name : null;

        // Les dons (bits) nécessitent le scope bits:read — retournés depuis le cache local
        res.json({
            lastFollower: lastFollower || twitchCache.lastFollower,
            lastSub:      lastSub      || twitchCache.lastSub,
            lastDon:      twitchCache.lastDon,
            lastDonAmount: twitchCache.lastDonAmount
        });

    } catch (error) {
        console.error(`[ERROR] /api/twitch/info : ${error.message}`);
        res.status(500).json({ error: "Erreur Twitch API." });
    }
});

// ─────────────────────────────────────────────
// ROUTE 4 : TUNA — musique en cours (OBS Plugin)
// TUNA écrit dans un fichier local monté via Docker volume.
// Le chemin dans le container est toujours /tuna/track.txt
// (mappé depuis le chemin Windows dans docker-compose.yml)
// ─────────────────────────────────────────────
const TUNA_FILE = '/tuna/track.txt';
let currentTrack = { title: null, artist: null, playing: false };

function parseTunaFile() {
    try {
        if (!fs.existsSync(TUNA_FILE)) return;
        const raw = fs.readFileSync(TUNA_FILE, 'utf8').trim();
        if (!raw) return;

        // TUNA écrit du JSON compact avec {json_compact}
        const data = JSON.parse(raw);

        const title  = data.title  || data.name  || null;
        const artist = data.artists?.[0] || data.artist || data.first_artist || null;

        if (title !== currentTrack.title || artist !== currentTrack.artist) {
            currentTrack = { title, artist, playing: !!title };
            console.log(`[TUNA] ${artist} — ${title}`);
        }
    } catch (e) {
        // Fichier en cours d'écriture ou format inattendu — on ignore
    }
}

// Polling toutes les 2s — fs.watch peu fiable sur Docker/Windows
parseTunaFile();
setInterval(parseTunaFile, 2000);
console.log(`[TUNA] Polling de ${TUNA_FILE} toutes les 2s.`);

app.get('/api/tuna', (req, res) => {
    res.json(currentTrack);
});

// ─────────────────────────────────────────────
// TWITCH IRC — WebSocket pour le chat
// Connexion anonyme en lecture seule (justwatch)
// Les messages sont broadcastés aux clients SSE
// ─────────────────────────────────────────────
let sseClients = [];
let twitchCache = { lastFollower: null, lastSub: null, lastDon: null, lastDonAmount: null };

function broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients = sseClients.filter(client => {
        try { client.write(payload); return true; }
        catch { return false; }
    });
}

function connectTwitchIRC() {
    if (!TWITCH_CHANNEL) { console.warn("[IRC] TWITCH_CHANNEL non défini, skip."); return; }
    console.log(`[IRC] Connexion au chat Twitch de #${TWITCH_CHANNEL}...`);
    const ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

    ws.on('open', () => {
        ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
        ws.send('PASS SCHMOOPIIE');
        ws.send('NICK justinfan12345');
        ws.send(`JOIN #${TWITCH_CHANNEL.toLowerCase()}`);
        console.log(`[IRC] Connecté et rejoint #${TWITCH_CHANNEL}`);
    });

    ws.on('message', (raw) => {
        const msg = raw.toString();

        // Log RAW — utile pour diagnostiquer les problèmes de parsing
        console.log('[IRC RAW]', msg.trimEnd());

        // Keepalive
        if (msg.includes('PING')) { ws.send('PONG :tmi.twitch.tv'); return; }

        // Les messages Twitch IRC peuvent arriver en plusieurs lignes dans un seul frame
        const lines = msg.split('\r\n').filter(l => l.trim());
        for (const line of lines) {
            parseIRCLine(line);
        }
    });
}

function parseIRCLine(line) {
        // Parse tags IRCv3
        const match = line.match(/^@([^ ]+) :([^!]+)![^ ]+ PRIVMSG #\S+ :(.+)$/);
        if (!match) return;

        const tagStr = match[1];
        const username = match[2];
        const text = match[3].trimEnd();

        const tags = {};
        tagStr.split(';').forEach(t => {
            const [k, v] = t.split('=');
            tags[k] = v;
        });

        // ─── Détection des Bits (dons natifs Twitch) ───
        if (tags['bits']) {
            const amount = parseInt(tags['bits'], 10);
            twitchCache.lastDon       = tags['display-name'] || username;
            twitchCache.lastDonAmount = amount + ' bits';
            broadcastSSE('tip', {
                username: tags['display-name'] || username,
                amount:   amount + ' bits'
            });
            console.log(`[EVENT] tip : ${tags['display-name'] || username} — ${amount} bits`);
        }

        const chatMsg = {
            id:       tags['id'] || Date.now().toString(),
            username: tags['display-name'] || username,
            color:    tags['color'] || '#f0f0ee',
            badges:   tags['badges'] || '',
            bits:     tags['bits'] ? parseInt(tags['bits'], 10) : 0,
            text,
            ts: Date.now()
        };

        console.log(`[IRC] chat : ${chatMsg.username} — ${chatMsg.text}`);
        broadcastSSE('chat', chatMsg);

    ws.on('close', () => {
        console.warn("[IRC] Déconnecté. Reconnexion dans 5s...");
        setTimeout(connectTwitchIRC, 5000);
    });

    ws.on('error', (e) => console.error("[IRC] Erreur:", e.message));
}

// ─────────────────────────────────────────────
// ROUTE 5 : SSE — flux temps réel pour les widgets
// ─────────────────────────────────────────────
app.get('/api/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Heartbeat toutes les 20s pour garder la connexion ouverte
    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); } catch { clearInterval(heartbeat); }
    }, 20000);

    sseClients.push(res);
    console.log(`[SSE] Nouveau client connecté (total: ${sseClients.length})`);

    req.on('close', () => {
        clearInterval(heartbeat);
        sseClients = sseClients.filter(c => c !== res);
        console.log(`[SSE] Client déconnecté (total: ${sseClients.length})`);
    });
});

// ─────────────────────────────────────────────
// Démarrage
// ─────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(` Serveur NoctaBlob actif sur le port ${PORT}`);
    console.log(`=============================================`);
    connectTwitchIRC();
});