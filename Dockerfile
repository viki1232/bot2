FROM node:18-bullseye as bot

# ✅ Instala dependencias necesarias para compilar sharp
RUN apt-get update && apt-get install -y \
    libvips-dev \
    build-essential \
    python3

WORKDIR /app

COPY package*.json ./

# ✅ Instala las dependencias con flags que evitan conflictos y aseguran compatibilidad
RUN npm install --platform=linux --arch=x64 --legacy-peer-deps

COPY . .

ARG RAILWAY_STATIC_URL
ARG PUBLIC_URL
ARG PORT

CMD ["npm", "start"]
