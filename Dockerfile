# Imagen para desplegar Imperio en la nube (Railway / Render / Fly / cualquier host Docker).
# Incluye ffmpeg (análisis de video frame por frame) y curl (scraper vía proxy),
# que son binarios nativos que la app necesita.

FROM node:20-slim

# Dependencias del sistema: ffmpeg + curl + certificados.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar dependencias primero (mejor cache de capas).
COPY package.json package-lock.json ./
RUN npm ci

# Copiar el resto y compilar.
COPY . .
RUN npm run build

ENV NODE_ENV=production
# El host de nube inyecta PORT; escuchamos en 0.0.0.0 para ser accesibles.
EXPOSE 3000
CMD ["sh", "-c", "node_modules/.bin/next start -H 0.0.0.0 -p ${PORT:-3000}"]
