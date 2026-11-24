# PSPP Frontend — Dockerfile de desarrollo
# Node 22 Alpine — igual que backend/Dockerfile y backend/Dockerfile.sedatu
# (paso 13 DGTIC): esta imagen también la usa el servicio frontend-build de
# docker-compose.prod.yml para compilar el frontend de producción, así que
# seguía en Node 18 en el VPS real, no solo en desarrollo.
FROM node:22-alpine

WORKDIR /app

# Copiar archivos de dependencias primero para aprovechar cache de Docker
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente (en dev se monta como volumen)
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
