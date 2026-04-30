FROM node:22-alpine AS dependencies
WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json server.js ./

EXPOSE 3000
CMD ["node", "server.js"]
