# --- Stage 1 : build --------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
RUN npm run build

# --- Stage 2 : runtime --------------------------------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps

COPY --from=build /app/dist ./dist

RUN addgroup -S nest && adduser -S nest -G nest
USER nest

EXPOSE 8080
CMD ["node", "dist/main.js"]
