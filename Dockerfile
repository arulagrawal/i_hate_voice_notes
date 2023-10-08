# Use an official Node runtime as the base image
FROM docker.io/oven/bun:1-alpine as builder

# Set the working directory in the docker image
WORKDIR /usr/src/app

# Copy package.json and yarn.lock into the working directory
COPY package.json bun.lockb index.ts ./

# Install the application dependencies using 'yarn install'
RUN bun install --production --no-cache

# CMD bun index.js
FROM docker.io/oven/bun:1-distroless as final

WORKDIR /usr/src/app

# Copy over dependencies and built resources from first stage
COPY --from=builder /usr/src/app .

CMD ["index.ts"]