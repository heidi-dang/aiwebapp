# Dockerfile for Browser Proxy
FROM mcr.microsoft.com/playwright:v1.41.2-jammy

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY . .

# Environment variables
ENV PORT=3003
ENV NODE_ENV=production

# Expose API port and VNC/Debug port (optional)
EXPOSE 3003

# Command to run
CMD ["npm", "start"]
