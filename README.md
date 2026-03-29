# OS Project — Container Security Monitoring Platform

A web dashboard for monitoring containerized application security. Built with React + Vite.

The dashboard covers real-time container health, vulnerability tracking, compliance checks, and alerting — all wired up to empty data hooks so you can connect your own backend.

---

## Getting started

Make sure you have Node.js v20.19+ or v22.12+ installed, then:

```bash
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## Project structure

```
OS_Project/
├── src/
│   ├── Dashboard.jsx     # main dashboard component
│   ├── App.jsx           # root — just renders Dashboard
│   └── index.css         # global reset
├── index.html            # Google Fonts loaded here
└── vite.config.js
```

---

## Dependencies

- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [lucide-react](https://lucide.dev/) — icons

---
