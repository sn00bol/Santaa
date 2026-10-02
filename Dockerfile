FROM node:22-trixie-slim

ENV NODE_ENV=production

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=node:node . .

USER node

CMD ["npm", "start"]