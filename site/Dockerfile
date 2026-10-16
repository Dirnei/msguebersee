FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG PUBLIC_RELAY_URL=http://localhost:8089
ENV PUBLIC_RELAY_URL=$PUBLIC_RELAY_URL
# only used while building, it does not end up in the final image's environment
ARG WHATSAPP_NUMMER=
RUN npm run build

FROM nginx:1.29-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
