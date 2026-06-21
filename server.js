const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3000;

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID; 

// Liste des AppID pour ta scène Just Chatting (steam-library.html)
const JEUX_DU_MOMENT = [
    "289650", "812140", "3064970", "2208920", "1086940", 
    "2928010", "1091500", "990080", "214510", "1627720", 
    "1817190", "1817070", "601360", "526870", "250900", 
    "239140"
];

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

// ROUTE 1 : Pour ton widget en jeu (Steam-Tracker.html)
app.get('/api/achievements', async (req, res) => {
    console.log(`\n[ROUTE] Requête reçue sur /api/achievements`);
    try {
        if (!STEAM_API_KEY || !STEAM_ID) {
            console.error("[ERROR] Clé API ou SteamID manquant dans les variables d'environnement.");
            return res.status(500).json({ error: "Variables manquantes." });
        }

        console.log(`[STEAM API] Récupération du statut du joueur pour le SteamID: ${STEAM_ID}`);
        const playerSummary = await axios.get(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${STEAM_ID}`);
        const player = playerSummary.data.response.players[0];
        
        if (!player) {
            console.warn("[WARN] Aucun joueur trouvé avec ce SteamID.");
            return res.status(404).json({ error: "Joueur introuvable." });
        }

        const gameId = player.gameid;

        if (!gameId) {
            console.log("[INFO] Statut récupéré : Le joueur ne joue à aucun jeu actuellement.");
            return res.json({ playing: false, message: "Aucun jeu Steam en cours." });
        }

        console.log(`[STEAM API] Joueur détecté en jeu ! AppID: ${gameId}. Récupération des succès et du schéma...`);
        const playerAchievements = await axios.get(`http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${gameId}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}`);
        const gameSchema = await axios.get(`http://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${STEAM_API_KEY}&appid=${gameId}&l=french`);

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

        console.log(`[SUCCESS] Données compilées pour le jeu : ${gameSchema.data.game.gameName} (${fullAchievements.length} succès trouvés)`);
        res.json({
            playing: true,
            gameName: gameSchema.data.game.gameName,
            gameId: gameId,
            achievements: fullAchievements
        });

    } catch (error) {
        console.error(`[ERROR] Erreur sur /api/achievements : ${error.message}`);
        res.status(500).json({ error: "Erreur lors de la synchronisation Steam." });
    }
});

// ROUTE 2 : Pour ton avancée globale (Steam-Library.html)
app.get('/api/library', async (req, res) => {
    console.log(`\n[ROUTE] Requête reçue sur /api/library`);
    try {
        if (!STEAM_API_KEY || !STEAM_ID) {
            console.error("[ERROR] Clé API ou SteamID manquant dans les variables d'environnement.");
            return res.status(500).json({ error: "Variables manquantes." });
        }

        let libraryData = [];
        console.log(`[INFO] Début de la boucle sur les ${JEUX_DU_MOMENT.length} jeux de la collection...`);

        for (const appId of JEUX_DU_MOMENT) {
            try {
                console.log(`[STEAM API] Traitement AppID ${appId}...`);
                const stats = await axios.get(`http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}`);
                const schema = await axios.get(`http://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${STEAM_API_KEY}&appid=${appId}&l=french`);
                
                if (stats.data && stats.data.playerstats && stats.data.playerstats.achievements) {
                    const total = stats.data.playerstats.achievements.length;
                    const unlocked = stats.data.playerstats.achievements.filter(a => a.achieved === 1).length;
                    const name = schema.data.game.gameName;

                    console.log(`   -> [OK] ${name} : ${unlocked}/${total} succès.`);

                    libraryData.push({
                        gameName: name,
                        gameId: appId,
                        unlocked: unlocked,
                        total: total,
                        percent: total > 0 ? Math.round((unlocked / total) * 100) : 0
                    });
                } else {
                    console.warn(`   -> [WARN] Structure de données invalide de Valve pour l'AppID ${appId}`);
                }
            } catch (e) {
                console.error(`   -> [API SKIPPED] Impossible de charger l'AppID ${appId}. Raison: ${e.message}`);
            }
        }

        console.log(`[SUCCESS] Envoi des données de la librairie (${libraryData.length} jeux chargés avec succès)`);
        res.json(libraryData);
    } catch (error) {
        console.error(`[ERROR] Erreur critique sur /api/library : ${error.message}`);
        res.status(500).json({ error: "Erreur Library API" });
    }
});

app.listen(PORT, () => {
    console.log(`=============================================`);
    console.log(` Serveur API actif sur le port ${PORT}`);
    console.log(`=============================================`);
});