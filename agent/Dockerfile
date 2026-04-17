# Agent image — lightweight Node.js container
# Contains: axios (HTTP to backend) + dockerode (Docker API access)

FROM node:20-alpine

# Working directory for the agent
WORKDIR /app

# Install dependencies only
COPY package.json .
RUN npm install --production

# Copy both agent files so either can be used
COPY metrics_agent.js .
COPY network_agent.js .

# Default: run the general metrics agent
# agent-3 (network intrusion detector) overrides this in docker-compose
CMD ["node", "metrics_agent.js"]