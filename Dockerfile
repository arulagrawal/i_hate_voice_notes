# Use an official Node runtime as the base image
FROM node:18-alpine

# Set the working directory in the docker image
WORKDIR /usr/src/app

# Copy package.json and package-lock.json into the working directory
COPY package*.json ./

# Install the application dependencies using 'npm ci'
RUN yarn install --frozen-lockfile --production

# Copy the rest of the application code into the working directory
COPY . .

# Expose port 1337 for the app to be reachable
EXPOSE 1337

# Define the command that should be executed
# when the docker image is run.
CMD [ "node", "index.js" ]

