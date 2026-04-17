# ⇨ Container Security Monitoring Platform ⇦
A web dashboard for monitoring containerized application security. Built with React + Vite on the frontend and Node.js + Express on the backend, connected to Docker via the Docker Engine API.

---

## Getting started

Make sure you have Node.js v20.19+ or v22.12+ and Docker Desktop installed and running.

Also, you need to install Trivy:
```bash
brew install trivy
trivy image --download-db-only
```

**Start the distributed backend (agents + central server):**
```bash
docker-compose up --build
```
Runs the central backend at `http://localhost:3002` along with all monitoring agents.

**Start the demo containers:**
```bash
docker-compose -f docker-compose.demo.yml up -d
```
Starts postgres, redis, nginx, python-worker, node-api, and alpine-logger as containers to be monitored by the platform.

**Stop everything:**
```bash
docker-compose down
docker-compose -f docker-compose.demo.yml down
```

**Start the frontend:**
```bash
npm install
npm run dev
```
Opens at `http://localhost:5173`

---

## Project structure

```
OS_Project/
├── src/
│   ├── Dashboard.jsx            # main dashboard — all UI components and data hooks
│   ├── App.jsx                  # root — renders Dashboard
│   └── index.css                # global reset
├── server/
│   ├── server.js                # central backend — aggregates agent reports, runs Trivy scans, serves API
│   └── Dockerfile               # backend container image (includes Trivy)
├── agent/
│   ├── metrics_agent.js         # general monitoring agent — collects CPU, memory, health per container
│   ├── network_agent.js         # specialized agent — detects exposed ports and network threats
│   ├── package.json             # agent dependencies (axios, dockerode)
│   └── Dockerfile               # agent container image
├── docker-compose.yml           # starts backend + agent-1 + agent-2 + agent-3 (network detector)
├── docker-compose.demo.yml      # starts demo containers to be monitored (postgres, redis, nginx, etc.)
├── index.html                   # fonts loaded here
└── vite.config.js
```

---