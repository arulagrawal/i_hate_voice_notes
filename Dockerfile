# Use an official Node runtime as the base image
FROM node:18-alpine as builder

# Set the working directory in the docker image
WORKDIR /usr/src/app

# Copy package.json and yarn.lock into the working directory
COPY package.json yarn.lock ./

# Install the application dependencies using 'yarn install'
RUN yarn install --frozen-lockfile --production

# Copy the rest of the application code into the working directory
COPY . .

# Second stage - distroless Node.js image
FROM gcr.io/distroless/nodejs:18

# Set the working directory again
WORKDIR /usr/src/app

# Copy over dependencies and built resources from first stage
COPY --from=builder /usr/src/app .

# Define the command that should be executed
# when the docker image is run.
CMD ["index.js"]
