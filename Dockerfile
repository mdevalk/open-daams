FROM node:26-slim AS prod-dependencies
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:26-slim AS dev-dependencies
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci

FROM node:26-slim AS build-env
COPY . /app/
COPY --from=dev-dependencies /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run generate-signing-key
RUN npm run db:generate
RUN npm run build

FROM node:26-slim
COPY ./package.json package-lock.json /app/
COPY --from=prod-dependencies /app/node_modules /app/node_modules
COPY --from=build-env /app/.next /app/.next
WORKDIR /app
CMD ["npm", "run", "start"]
