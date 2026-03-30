FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL
ARG VITE_CLARITY_PROJECT_ID
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CLARITY_PROJECT_ID=$VITE_CLARITY_PROJECT_ID
RUN npm run build

FROM node:22-alpine
RUN npm install -g serve
WORKDIR /app
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["serve", "dist", "-s", "-l", "3000"]
