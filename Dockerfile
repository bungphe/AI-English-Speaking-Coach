# Build stage
FROM node:20-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN npm run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /docker-entrypoint.d/99-inject-keys.sh

RUN chmod +x /docker-entrypoint.d/99-inject-keys.sh

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

