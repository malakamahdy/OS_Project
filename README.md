# OS Project — Container Security Monitoring Platform

A web dashboard for monitoring containerized application security. Built with React + Vite on the frontend and Node.js + Express on the backend, connected to Docker via the Docker Engine API.

---

## Getting started

Make sure you have Node.js v20.19+ or v22.12+ and Docker Desktop installed and running.

**Frontend:**
```bash
npm install
npm run dev
```
Opens at `http://localhost:5173`

**Backend:**
```bash
cd server
npm install
node server.js
```
Runs at `http://localhost:3002`

---

## Project structure

```
OS_Project/
├── src/
│   ├── Dashboard.jsx     # main dashboard — all UI components and data hooks
│   ├── App.jsx           # root — renders Dashboard
│   └── index.css         # global reset
├── server/
│   └── server.js         # Express API — connects to Docker, serves container data
├── index.html            # fonts loaded here
└── vite.config.js
```

---
