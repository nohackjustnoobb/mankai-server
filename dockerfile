FROM oven/bun:1

WORKDIR /app

# Install dependencies (copy lockfile + manifest + patches first for layer caching)
COPY package.json bun.lock ./
COPY patches ./patches
RUN bun install --frozen-lockfile

# Copy the rest of the source and build the production bundle
COPY . .
RUN bun run build

EXPOSE 3000

# Ensure the entrypoint script is executable
RUN chmod +x entrypoint.sh

ENTRYPOINT ["./entrypoint.sh"]
