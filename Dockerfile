FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY client ./client
RUN npm run build

FROM node:24-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY server.js ./
COPY --from=build /app/dist ./dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8888
EXPOSE 8888
CMD ["node", "server.js", "--prod"]
