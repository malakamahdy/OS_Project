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

## How to wire up your data

All data lives in custom hooks at the top of `Dashboard.jsx`. Each one returns `{ data, loading, error }` and has a comment showing what shape the data should be.

To connect a real backend, find the hook and replace the empty array with your fetch call. Example:

```js
function useContainers() {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/containers')
      .then(res => res.json())
      .then(data => {
        setContainers(data);
        setLoading(false);
      });
  }, []);

  return { containers, loading, error: null };
}
```

The hooks and the expected data shapes:

| Hook | What it feeds | Expected fields |
|---|---|---|
| `useContainers` | Container health list | `id, name, image, tag, env, cpuPct, memPct, health` |
| `useVulnerabilities` | Vuln table | `id, cveId, container, package, version, severity, cvss, status` |
| `useAlerts` | Alerts feed | `id, title, description, severity, timestamp, acknowledged` |
| `useCompliance` | Compliance bars | `id, name, standard, passPct, passCount, totalCount` |
| `useSecurityEvents` | 24h chart | `hour, networkAnomalies, accessViolations` |
| `useStats` | Stat cards | `totalContainers, criticalVulns, complianceScore, threatsBlocked` |
| `useScanHistory` | Scan log | `id, target, timestamp, type, vulnCount, status` |

---

## Dependencies

- [React](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [lucide-react](https://lucide.dev/) — icons

---

## Team

Add your names here.
