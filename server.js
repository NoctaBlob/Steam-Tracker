const express = require('express');
const axios = require('axios');

const app = express();
const PORT = 3000;

// Récupération sécurisée des variables définies dans le docker-compose
const STEAM_API_KEY = process.env.STEAM_API_KEY;
const STEAM_ID = process.env.STEAM_ID; 

app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    next();
});

app.get('/api/achievements', async (req, res) => {
    try {
        if (!STEAM_API_KEY || !STEAM_ID) {
            return res.status(500).json({ error: "Variables STEAM_API_KEY ou STEAM_ID manquantes." });
        }

        // 1. Statut actuel du joueur
        const playerSummary = await axios.get(`http://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${STEAM_API_KEY}&steamids=${STEAM_ID}`);
        const player = playerSummary.data.response.players[0];
        const gameId = player.gameid;

        if (!gameId) {
            return res.json({ playing: false, message: "Aucun jeu Steam en cours." });
        }

        // 2. Progression des succès
        const playerAchievements = await axios.get(`http://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v0001/?appid=${gameId}&key=${STEAM_API_KEY}&steamid=${STEAM_ID}`);
        
        // 3. Noms francophones et icônes du jeu
        const gameSchema = await axios.get(`http://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v0002/?key=${STEAM_API_KEY}&appid=${gameId}&l=french`);

        const achievementsList = playerAchievements.data.playerstats.achievements;
        const schemaList = gameSchema.data.game.availableGameStats.achievements;

        const fullAchievements = achievementsList.map(ach => {
            const details = schemaList.find(s => s.name === ach.apiname);
            return {
                name: details ? details.displayName : ach.apiname,
                description: details ? details.description : '',
                icon: details ? (ach.achieved === 1 ? details.icon : details.icongray) : '',
                achieved: ach.achieved === 1
            };
        });

        res.json({
            playing: true,
            gameName: gameSchema.data.game.gameName,
            gameId: gameId,
            achievements: fullAchievements
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ error: "Erreur lors de la synchronisation Steam." });
    }
});

app.listen(PORT, () => {
    console.log(`Serveur API actif sur le port ${PORT}`);
});