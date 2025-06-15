FROM node:22-slim AS base

WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
# Install build dependencies and required libraries
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    libc6 \
    procps \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci
RUN npm rebuild @xenova/transformers --build-from-source

# Development stage
FROM base AS development
# Install build dependencies and required libraries
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    libc6 \
    procps \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
RUN npm rebuild bcrypt --build-from-source
RUN npm rebuild @xenova/transformers --build-from-source
COPY . .
EXPOSE 3000
CMD ["npm", "run", "start:dev"]

# Production stage
FROM base AS production
# Install build dependencies and required libraries
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    gcc \
    libc6 \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies) for building
RUN npm ci
RUN npm rebuild bcrypt --build-from-source
RUN npm rebuild @xenova/transformers --build-from-source

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove development dependencies after build
RUN npm prune --production

EXPOSE 3000
CMD ["node", "dist/main.js"] 