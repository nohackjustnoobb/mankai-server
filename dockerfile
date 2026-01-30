
FROM node:22-alpine AS admin-build
WORKDIR /app

COPY admin/ ./
RUN yarn install --frozen-lockfile

RUN yarn build

FROM node:22-alpine AS api-build
WORKDIR /app

COPY api/ ./
RUN yarn install --frozen-lockfile
RUN yarn build

RUN rm -rf node_modules
RUN yarn install --frozen-lockfile --production
RUN yarn cache clean

COPY --from=admin-build /app/dist ./static

RUN apk --no-cache add gcompat
EXPOSE 3000

CMD ["yarn", "start"]
