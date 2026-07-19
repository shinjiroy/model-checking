FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/spec/package.json ./packages/spec/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci

COPY . .

CMD ["npm", "test"]
