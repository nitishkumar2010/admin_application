# ===============================
# 1️⃣ BUILDER STAGE
# ===============================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files first (cache)
COPY package.json package-lock.json ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

# Required for Next.js build
ENV NEXTAUTH_SECRET="dummy-secret"
ENV NEXTAUTH_URL="http://localhost:3000"

# 🔥 CRITICAL: Generate Prisma client
RUN npx prisma generate

# Build Next.js
RUN npm run build


# ===============================
# 2️⃣ RUNTIME STAGE
# ===============================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy runtime artifacts
COPY --from=builder /app/package.json ./
COPY --from=builder /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["npm", "start"]
