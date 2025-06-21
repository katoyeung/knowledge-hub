FROM node:22

# Install additional development tools and build dependencies for Sharp
RUN apt-get update && apt-get install -y \
    git \
    curl \
    wget \
    vim \
    nano \
    bash \
    build-essential \
    python3 \
    make \
    g++ \
    libvips-dev \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /workspace

# Create a non-root user
RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs nodejs

# Copy package files for dependency installation
COPY package*.json ./
COPY turbo.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package*.json ./apps/frontend/
COPY apps/cms/package*.json ./apps/cms/
COPY packages/shared-types/package*.json ./packages/shared-types/

# Install dependencies as root first
RUN npm install

# Fix Sharp for ARM64 architecture with proper permissions
RUN npm rebuild sharp --unsafe-perm

# Change ownership of the workspace directory
RUN chown -R nodejs:nodejs /workspace

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Default command
CMD ["sh"] 