# PSPP Backend — Dockerfile de desarrollo
# Usa Node 18 Alpine para imagen liviana (~120MB)
FROM node:18-alpine

WORKDIR /app

# Copiar archivos de dependencias primero para aprovechar cache de Docker
COPY package*.json ./

# Instalar dependencias (incluye devDependencies para nodemon)
RUN npm install

# Copiar el código fuente (en dev se monta como volumen, esto es fallback)
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
