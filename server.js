const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3000;

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID; 

// Centralisation de la configuration : AppID -> Nom propre
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

// ROUTE 2 : Pour ton avancée globale (steam-library.html)
app.get('/api/library', async (req, res) => {
    console.log(`\n[ROUTE] Requête reçue sur /api/library`);
    try {
        if (!STEAM_API_KEY || !STEAM_ID) {
            console.error("[ERROR] Clé API ou SteamID manquant.");
            return res.status(500).json({ error: "Variables manquantes." });
        }

        let libraryData = [];
        // Object.keys() permet de récupérer uniquement les AppIDs pour boucler dessus
        const appIds = Object.keys(JEUX_DU_MOMENT);
        console.log(`[INFO] Début de la boucle sur les ${appIds.length} jeux...`);

        for (const appId of appIds) {
            const customName = JEUX_DU_MOMENT[appId];
            try {
                console.log(`[STEAM API] Traitement AppID ${appId} (${customName})...`);
                
                const stats = await axios.get(`http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${appId}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}`);
                
                if (stats.data && stats.data.playerstats && stats.data.playerstats.achievements) {
                    const total = stats.data.playerstats.achievements.length;
                    const unlocked = stats.data.playerstats.achievements.filter(a => a.achieved === 1).length;
                    
                    console.log(`   -> [OK] ${customName} : ${unlocked}/${total} succès.`);

                    libraryData.push({
                        gameName: customName,
                        gameId: appId,
                        unlocked: unlocked,
                        total: total,
                        percent: total > 0 ? Math.round((unlocked / total) * 100) : 0
                    });
                }
            } catch (e) {
                // Mode secours : Si le jeu n'est pas initialisé ou plante, on utilise direct notre nom custom
                console.warn(`   -> [WARN] Impossible de fetch l'AppID ${appId}. Mode secours activé pour ${customName}.`);
                
                libraryData.push({
                    gameName: customName,
                    gameId: appId,
                    unlocked: 0,
                    total: 0,
                    percent: 0
                });
            }
        }

        // Tri alphabétique
        libraryData.sort((a, b) => a.gameName.localeCompare(b.gameName));
        console.log("[INFO] Tri alphabétique appliqué.");

        console.log(`[SUCCESS] Envoi des données (${libraryData.length} jeux chargés)`);
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