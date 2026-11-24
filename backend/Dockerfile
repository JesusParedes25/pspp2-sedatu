# PSPP Backend — Dockerfile de desarrollo
# Node 22 Alpine — igual que backend/Dockerfile.sedatu y que la instancia
# nativa (paso 11 DGTIC): Node 18 llegó a su fin de soporte de seguridad en
# abril de 2025 y era lo único que bloqueaba subir nodemailer a una versión
# sin ese límite.
FROM node:22-alpine

WORKDIR /app

# Copiar archivos de dependencias primero para aprovechar cache de Docker
COPY package*.json ./

# Instalar dependencias (incluye devDependencies para nodemon)
RUN npm install

# Copiar el código fuente (en dev se monta como volumen, esto es fallback)
COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
