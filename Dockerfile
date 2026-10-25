FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY client ./client
COPY shared ./shared
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server ./server
COPY shared ./shared
COPY migrations ./migrations
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8888 AVATAR_DIR=/app/data/avatars
EXPOSE 8888
CMD ["node", "server/main.js", "--prod"]
