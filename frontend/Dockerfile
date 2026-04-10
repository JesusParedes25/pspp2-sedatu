# PSPP Frontend — Dockerfile de desarrollo
# Usa Node 18 Alpine para imagen liviana
FROM node:18-alpine

WORKDIR /app

# Copiar archivos de dependencias primero para aprovechar cache de Docker
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el código fuente (en dev se monta como volumen)
COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev"]
