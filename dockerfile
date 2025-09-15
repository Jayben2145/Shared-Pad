# Use a small, current Node image
FROM node:20-alpine

# Create app dir
WORKDIR /usr/src/app

# Install deps separately for better layer caching
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# Copy the rest
COPY . .

# Ensure data dir exists at runtime
RUN mkdir -p /usr/src/app/data /usr/src/app/data/pads \
 && chown -R node:node /usr/src/app

USER node
ENV NODE_ENV=production PORT=3000

EXPOSE 3000

# Optional: basic healthcheck hitting /health
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD [ "node", "server.js" ]
