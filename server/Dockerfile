# creating our server for the agents 

FROM node:20-alpine

RUN apk add --no-cache curl

# Install Trivy
RUN curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh -s -- -b /usr/local/bin

WORKDIR /app

COPY package.json .
RUN npm install --production

COPY server.js .

EXPOSE 3002

CMD ["node", "server.js"]
