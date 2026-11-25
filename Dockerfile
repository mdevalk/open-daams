# Two images from one Dockerfile:
#   docker build --target migrate -t open-daams-migrate .   # one-shot: prisma db push + seed
#   docker build -t open-daams .                            # the app (Next.js standalone server)

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:26-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run db:generate && npm run build

FROM build AS migrate
CMD ["sh", "-c", "npm run db:push && npm run db:seed"]

FROM node:26-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
