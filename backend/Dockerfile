# ─── Stage 1: Builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Install dependencies first (cache layer)
COPY package*.json ./
RUN npm ci

# Copy source and generate Prisma client before compiling
COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN npm run build

# ─── Stage 2: Runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Install only production dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy generated Prisma client and compiled output
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/dist ./dist
COPY prisma ./prisma/

# Persistent volume for uploaded files (boletas)
RUN mkdir -p /usr/src/app/uploads && chown -R node:node /usr/src/app
VOLUME ["/usr/src/app/uploads"]

USER node

EXPOSE 3001

CMD ["node", "dist/main.js"]
