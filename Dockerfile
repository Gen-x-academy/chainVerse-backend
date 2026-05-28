
# --- Build Stage ---
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runner Stage ---
FROM node:20-alpine AS runner
WORKDIR /app
# Create non-root user and group
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
USER appuser
EXPOSE 3000
CMD ["node", "dist/main"]
