# Backend WhatsApp Scheduler — imagen de producción.
# Corre con tsx (ejecuta TypeScript directo, sin paso de build), igual que en dev.
FROM node:22-alpine

WORKDIR /app

# Instala dependencias primero para aprovechar la cache de capas.
# Incluimos devDependencies porque tsx vive ahí y lo usamos para arrancar.
COPY package.json package-lock.json ./
RUN npm ci

# Código fuente.
COPY tsconfig.json ./
COPY src ./src

# El puerto real lo define PORT en el entorno; 3000 por defecto.
EXPOSE 3000

# Arranca el servidor (config.ts lee las variables de entorno inyectadas por compose).
CMD ["npm", "run", "start"]
