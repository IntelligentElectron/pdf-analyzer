FROM node:22-slim AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src/ ./src/
RUN npm install
RUN npx tsc

FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY --from=build /app/dist/ ./dist/
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
