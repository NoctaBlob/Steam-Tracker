FROM node:lts-alpine

WORKDIR /app

# ws : WebSocket pour le chat Twitch IRC
RUN npm install express axios ws

COPY server.js .

EXPOSE 3000

CMD ["node", "server.js"]
