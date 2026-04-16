# creation of the IMAGE for the agents 



# - an image in this sense is taking all the information we had here and freezing it. 

# mini Linux added
# /app folder created
#  axios and dockerode installed
# agent.js copied in




# mini linux for agents with node.js 
FROM node:20-alpine  #

# creating the app folder, this is where our agents will work 
WORKDIR /app




COPY package.json .

#guarantees that we only get the dependecies 
RUN npm install --production

# this are the dependencies 

 
#    "axios": "^1.6.0",       -----> so that the agent can POST the metrics to the backend
#    "dockerode": "^4.0.2"    -----> so the agent cant talk to Docker, and ask for the containers that it has
 




# gets the agent from agent.js
COPY agent.js .


# cmd is what starts everything, it will start our agents and it will run agent.js - starting that container as soon as we get dokcer-comnpose.yml
CMD ["node", "agent.js"]



# this will later on become a container with "docker-compose.yml , and our agents will be alive " - but for now is a freeze image



# to activate the agents we would do docker-compose up in the terminal 