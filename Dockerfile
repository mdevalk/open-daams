FROM node:26-slim AS prod-dependencies
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:26-slim AS dev-dependencies
COPY ./package.json package-lock.json /app/
COPY ./scripts/generate-signing-key.ts /app/scripts/
COPY ./prisma /app/prisma
COPY ./prisma.config.ts /app/
WORKDIR /app
RUN npm ci
RUN npm run generate-signing-key
RUN npm run db:generate

FROM node:26-slim AS build-env
COPY . /app/
COPY --from=dev-dependencies /app/node_modules /app/node_modules
COPY --from=dev-dependencies /app/src/generated/prisma /app/src/generated/prisma
COPY --from=dev-dependencies /app/keys /app/keys
WORKDIR /app
RUN npm run build

FROM node:26-slim
COPY ./package.json package-lock.json /app/
COPY --from=prod-dependencies /app/node_modules /app/node_modules
COPY --from=build-env /app/.next /app/.next
WORKDIR /app
CMD ["npm", "run", "start"]
