FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npx tsc

FROM base AS runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

ENV NODE_ENV=production
EXPOSE 3100
CMD ["node", "dist/index.js"]
