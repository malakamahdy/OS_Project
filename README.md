# ⛫󠁱 Citadel — Distributed Container Security Platform ⛫󠁱

## File Structure

```
OS_Project/
├── server/
│   ├── server.js           # Central backend
│   ├── Dockerfile
│   └── package.json
├── agent/
│   ├── metrics_agent.js    # CPU/memory monitoring agent
│   ├── network_agent.js    # Network intrusion detection agent
│   ├── Dockerfile
│   ├── Dockerfile.secrets-demo
│   └── package.json
├── nginx/
│   └── nginx.conf
├── src/
│   └── Dashboard.jsx       # React frontend
├── docker-compose.yml      # Main stack
├── docker-compose.demo.yml # Demo containers
├── .env                    # API keys (not committed)
└── package.json
```

---

## Setup

### 1. Create your `.env` file

In the project root, create a file called `.env`:

```
OPENAI_API_KEY=your-openai-api-key-here
```

> If you don't have an OpenAI key, leave it blank. LLM analysis will be disabled but everything else works.

---

### 2. Install frontend dependencies

```bash
npm install
```

---

## Running the Project

### Start the main stack (backend + agents)

```bash
docker-compose up --build
```

### Start the demo containers (in a separate terminal)

```bash
docker-compose -f docker-compose.demo.yml up -d
```

### Start the frontend (in a separate terminal)

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

---

## Stopping the Project

```bash
docker-compose down
docker-compose -f docker-compose.demo.yml down
```

---

## Features

- **Live Monitoring** — Real-time container CPU, memory, and health metrics via Socket.io. Sparkline charts per container updated every 10 seconds.
- **Vulnerability Scanning** — Trivy scans all running container images for CVEs, sorted by severity with full CVE details and reference links.
- **Secrets Detection** — Trivy secret scanner finds hardcoded API keys, tokens, and private keys baked into image layers. Runs in parallel with isolated cache dirs to avoid conflicts.
- **CIS Compliance** — CIS Docker Benchmark 1.6.0 checks grouped into Image Security and Container Runtime categories with PASS/FAIL per check.
- **Autonomous Fault Correction** — Watchdog detects offline agents and crashed containers within 30 seconds and restarts them automatically via the Docker socket.
- **Network Agent Failover** — If Agent-3 (network intrusion detector) goes offline, Agent-1 is promoted as fallback and a yellow banner appears on the dashboard.
- **Alert Deduplication** — Same alert title + source never creates duplicate entries regardless of how many agents report it.
- **LLM Integration** — Agents call OpenAI GPT-4o-mini when a container exceeds 90% CPU or memory and send remediation advice back to the dashboard.
- **Role-Based Access Control** — Three roles (Security Admin, Compliance Analyst, DevOps Engineer) each with a restricted sidebar and role-specific task list.
- **Audit Log** — Permanent record of every event: alerts, scans, container restarts, agent recovery, config changes. Capped at 500 events.
- **Scan History** — Dashboard homepage tracks every completed vulnerability, compliance, and secrets scan with result counts.
- **PDF Export** — Full security report exported via jsPDF including agents, alerts, vulnerabilities, compliance results, and audit log.
- **Config Page** — CPU, memory, and agent timeout thresholds editable at runtime from the dashboard and applied immediately to the backend.
- **Dark / Light Mode** — Full theme switching with a warm beige light mode and dark default.

---

## Terminal Commands for Features

### Trigger autonomous fault correction — stop an agent
```bash
docker stop cs-agent-1
# Watch the dashboard — fault panel appears within 30s, agent auto-restarts
docker start cs-agent-1
```

### Trigger network agent failover
```bash
docker stop cs-agent-3
# Yellow failover banner appears on dashboard
docker start cs-agent-3
```

### Trigger container auto-restart
```bash
docker stop cs-redis-cache
# Backend detects exited state and restarts automatically
```

### Trigger CPU spike for LLM analysis
```bash
docker exec cs-alpine-logger sh -c "while true; do :; done &"
# LLM analysis appears on Live Monitor within ~30s (requires OpenAI key)
docker exec cs-alpine-logger pkill sh   # stop the spike
```

### Inject demo LLM analysis (no OpenAI key needed)
```bash
curl -X POST http://localhost:3002/api/demo/llm-test \
  -H "Content-Type: application/json" \
  -d '{"containerName":"cs-alpine-logger"}'
```
This is just to see the visual UI if you do not have API key access.

---

## Ports

| Service | Port |
|---|---|
| Frontend (React) | 5173 |
| Backend (Express) | 3002 |
| Demo nginx proxy | 8080 |