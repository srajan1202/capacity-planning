
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm install -g typescript
RUN tsc
EXPOSE 3000
CMD ["node", "dist/index.js"]
