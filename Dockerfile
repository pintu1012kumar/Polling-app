
FROM node:18-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./

# Install development and production dependencies
RUN npm ci

# Copy the rest of the application code
COPY . .

RUN npm run build


FROM node:18-alpine AS runner


WORKDIR /app


ENV NODE_ENV production

# Only copy necessary files from the builder stage
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json




EXPOSE 3000


CMD ["npm", "start"]