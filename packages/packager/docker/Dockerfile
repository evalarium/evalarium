# Packages the Evalarium CLI and runtime into a container that serves a
# frozen environment bundle:
#
#   docker build -f packages/packager/docker/Dockerfile -t evalarium-env .
#   docker run --rm -p 3901:3901 -p 3924:3924 -p 5000-5007:5000-5007 \
#     -v /path/to/name.evalbundle:/bundle:ro evalarium-env
#
# The control API listens on 3901 and the frozen browser's CDP endpoint on
# 3924; agents attach over CDP (see packages/adapter-browsergym/python).

FROM node:22-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /src
COPY . .
RUN pnpm install --frozen-lockfile \
  && pnpm boundaries \
  && pnpm exec turbo run build --filter=@evalarium/cli... \
  && pnpm --filter @evalarium/cli deploy --prod --legacy /deploy

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium fonts-liberation ca-certificates dumb-init \
  && rm -rf /var/lib/apt/lists/*
ENV EVALARIUM_CHROMIUM_PATH=/usr/bin/chromium \
    EVALARIUM_CHROMIUM_NO_SANDBOX=1 \
    NODE_ENV=production
WORKDIR /evalarium
COPY --from=build /deploy .
EXPOSE 3901 3924 5000-5007
ENTRYPOINT ["dumb-init", "node", "dist/index.js"]
CMD ["serve", "/bundle", "--host", "0.0.0.0", "--port", "3901", "--cdp-port", "3924"]
