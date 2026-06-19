FROM node:20-slim

WORKDIR /usr/src/app

# Install system dependencies for Puppeteer and Chromium
RUN apt-get update && apt-get install -y \
  chromium \
  fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
  --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Set Puppeteer env variables to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy package catalogs and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source files and configurations
COPY src ./src

EXPOSE 4000

# Start Express JS server directly
CMD ["node", "src/app.js"]
