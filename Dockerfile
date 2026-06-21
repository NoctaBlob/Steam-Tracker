FROM node:lts-alpine

WORKDIR /app

# On installe directement express et axios (évite d'avoir à gérer un package.json en local)
RUN npm install express axios

# Copie du code source du serveur
COPY server.js .

EXPOSE 3000

CMD ["node", "server.js"]