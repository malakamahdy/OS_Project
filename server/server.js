const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const Docker = require('dockerode');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execAsync = promisify(exec);
const app = express();
const httpServer = http.createServer(app);

// ─────────────────────────────────────────────
// SOCKET.IO — real-time push to dashboard
// ─────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Send current state immediately on connect
  socket.emit('agents:update', getAgentSummary());
  socket.emit('alerts:update', alertStore.filter(a => !a.acknowledged));

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

function broadcast(event, data) {
  io.emit(event, data);
}

// ─────────────────────────────────────────────
// DOCKER (local — for compliance + vuln scans)
// ─────────────────────────────────────────────

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET ||
    (process.platform === 'darwin'
      ? `${process.env.HOME}/.docker/run/docker.sock`
      : '/var/run/docker.sock')
});

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));

// ─────────────────────────────────────────────
// THRESHOLDS
// ─────────────────────────────────────────────

const THRESHOLDS = {
  cpuWarn:       70,
  cpuCrit:       90,
  memWarn:       75,
  memCrit:       90,
  agentTimeoutMs: 30000, // agent considered down after 30s no heartbeat
};

// ─────────────────────────────────────────────
// AGENT REGISTRY
// Tracks all agents that have reported in.
// ─────────────────────────────────────────────

const agentRegistry = new Map();
// agentId → { agentId, agentLabel, lastSeen, hostInfo, containers, containerCount, status }

function registerAgent(payload) {
  const { agentId, agentLabel, timestamp, hostInfo, containers, containerCount } = payload;
  const existing = agentRegistry.get(agentId);

  agentRegistry.set(agentId, {
    agentId,
    agentLabel,
    lastSeen: new Date(timestamp),
    hostInfo,
    containers,
    containerCount,
    status: 'online',
  });

  // If agent was previously offline, generate recovery alert
  if (existing && existing.status === 'offline') {
    addAlert({
      title: 'Agent Recovered',
      description: `Monitoring agent "${agentLabel}" is back online.`,
      severity: 'info',
      source: agentId,
    });
  }
}

function getAgentSummary() {
  return Array.from(agentRegistry.values()).map(a => ({
    agentId: a.agentId,
    agentLabel: a.agentLabel,
    lastSeen: a.lastSeen,
    status: a.status,
    containerCount: a.containerCount,
    hostInfo: a.hostInfo,
  }));
}

function getAllContainersFromAgents() {
  const seen = new Set();
  const all = [];
  for (const agent of agentRegistry.values()) {
    if (agent.status === 'online') {
      for (const c of agent.containers || []) {
        if (!seen.has(c.name)) {
          seen.add(c.name);
          all.push({ ...c, agentId: agent.agentId, agentLabel: agent.agentLabel, env: agent.agentLabel });
        }
      }
    }
  }
  return all;
}

// ─────────────────────────────────────────────
// AGENT HEALTH WATCHDOG
// Marks agents as offline if no heartbeat
// received within THRESHOLDS.agentTimeoutMs
// ─────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  let changed = false;

  for (const [id, agent] of agentRegistry.entries()) {
    const age = now - new Date(agent.lastSeen).getTime();

    if (age > THRESHOLDS.agentTimeoutMs && agent.status === 'online') {
      agent.status = 'offline';
      changed = true;
      console.warn(`[Watchdog] Agent offline: ${agent.agentLabel} (${id})`);

      addAlert({
        title: 'Monitoring Agent Offline',
        description: `Agent "${agent.agentLabel}" has not reported in ${Math.round(age / 1000)}s. Containers on this host are no longer being monitored.`,
        severity: 'critical',
        source: id,
      });
    }
  }

  if (changed) {
    broadcast('agents:update', getAgentSummary());
    broadcast('alerts:update', alertStore.filter(a => !a.acknowledged));
  }
}, 10000);

// ─────────────────────────────────────────────
// ALERT STORE
// ─────────────────────────────────────────────

let alertStore = [];
let alertIdCounter = 0;

function addAlert({ title, description, severity, source }) {
  const exists = alertStore.find(a => !a.acknowledged && a.title === title && a.source === source);
  if (exists) return;

  const alert = {
    id: `alert-${alertIdCounter++}`,
    title, description, severity, source,
    timestamp: new Date().toISOString(),
    acknowledged: false,
  };
  alertStore.push(alert);

  // Push to all connected dashboard clients immediately
  broadcast('alerts:update', alertStore.filter(a => !a.acknowledged));
}

function resolveAlert(title, source) {
  const before = alertStore.filter(a => !a.acknowledged).length;
  alertStore = alertStore.map(a =>
    a.title === title && a.source === source && !a.acknowledged
      ? { ...a, acknowledged: true }
      : a
  );
  const after = alertStore.filter(a => !a.acknowledged).length;
  if (before !== after) broadcast('alerts:update', alertStore.filter(a => !a.acknowledged));
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function getHealth(container) {
  const state = container.State;
  const status = container.Status || '';
  if (state === 'running') {
    if (status.includes('unhealthy')) return 'crit';
    if (status.includes('health: starting')) return 'warn';
    return 'ok';
  }
  if (state === 'exited' || state === 'dead') return 'crit';
  if (state === 'paused' || state === 'restarting') return 'warn';
  return 'warn';
}

function parseImage(imageString) {
  const parts = (imageString || '').split(':');
  return { image: parts[0] || 'unknown', tag: parts[1] || 'latest' };
}

function normalizeSeverity(s) {
  return (s || 'unknown').toLowerCase();
}

// ─────────────────────────────────────────────
// THRESHOLD ALERTS FROM AGENT DATA
// Checks each container report for threshold
// violations and generates alerts.
// ─────────────────────────────────────────────

function checkThresholds(agentLabel, containers) {
  for (const c of containers) {
    const name = `${c.name} (${agentLabel})`;

    if (c.status === 'exited' || c.status === 'dead') {
      addAlert({ title: 'Container Down', description: `${c.name} on ${agentLabel} has stopped (state: ${c.status}).`, severity: 'critical', source: `${c.name}-${agentLabel}` });
    } else {
      resolveAlert('Container Down', `${c.name}-${agentLabel}`);
    }

    if (c.status === 'restarting') {
      addAlert({ title: 'Container Restarting', description: `${c.name} on ${agentLabel} is in a restart loop.`, severity: 'warning', source: `${c.name}-${agentLabel}` });
    } else {
      resolveAlert('Container Restarting', `${c.name}-${agentLabel}`);
    }

    if (c.cpuPct != null) {
      if (c.cpuPct >= THRESHOLDS.cpuCrit) {
        addAlert({ title: 'Critical CPU Usage', description: `${c.name} on ${agentLabel} is using ${c.cpuPct}% CPU.`, severity: 'critical', source: `cpu-${c.name}-${agentLabel}` });
      } else if (c.cpuPct >= THRESHOLDS.cpuWarn) {
        addAlert({ title: 'High CPU Usage', description: `${c.name} on ${agentLabel} is using ${c.cpuPct}% CPU.`, severity: 'warning', source: `cpu-${c.name}-${agentLabel}` });
      } else {
        resolveAlert('Critical CPU Usage', `cpu-${c.name}-${agentLabel}`);
        resolveAlert('High CPU Usage', `cpu-${c.name}-${agentLabel}`);
      }
    }

    if (c.memPct != null) {
      if (c.memPct >= THRESHOLDS.memCrit) {
        addAlert({ title: 'Critical Memory Usage', description: `${c.name} on ${agentLabel} is using ${c.memPct}% memory.`, severity: 'critical', source: `mem-${c.name}-${agentLabel}` });
      } else if (c.memPct >= THRESHOLDS.memWarn) {
        addAlert({ title: 'High Memory Usage', description: `${c.name} on ${agentLabel} is using ${c.memPct}% memory.`, severity: 'warning', source: `mem-${c.name}-${agentLabel}` });
      } else {
        resolveAlert('Critical Memory Usage', `mem-${c.name}-${agentLabel}`);
        resolveAlert('High Memory Usage', `mem-${c.name}-${agentLabel}`);
      }
    }
  }
}

// ─────────────────────────────────────────────
// TRIVY MUTEX LOCK
// Ensures only one Trivy scan runs at a time.
// Prevents cache conflicts when vuln + compliance
// scans are triggered simultaneously.
// ─────────────────────────────────────────────

let trivyLocked = false;
const trivyQueue = [];

function acquireTrivyLock() {
  return new Promise((resolve) => {
    if (!trivyLocked) {
      trivyLocked = true;
      resolve();
    } else {
      trivyQueue.push(resolve);
    }
  });
}

function releaseTrivyLock() {
  if (trivyQueue.length > 0) {
    const next = trivyQueue.shift();
    next();
  } else {
    trivyLocked = false;
  }
}

// ─────────────────────────────────────────────
// CONCURRENT VULNERABILITY SCANNING
// Uses worker threads to scan multiple images
// in parallel — true concurrent execution.
// ─────────────────────────────────────────────

function scanImageInWorker(image) {
  return new Promise((resolve, reject) => {
    const workerCode = `
      const { execSync } = require('child_process');
      const { workerData, parentPort } = require('worker_threads');
      try {
        const out = execSync(
          \`trivy image --format json --quiet --scanners vuln "\${workerData.image}"\`,
          { timeout: 120000, maxBuffer: 50 * 1024 * 1024 }
        );
        const result = JSON.parse(out.toString());
        parentPort.postMessage({ ok: true, result });
      } catch (err) {
        parentPort.postMessage({ ok: false, error: err.message });
      }
    `;

    const worker = new Worker(workerCode, {
      eval: true,
      workerData: { image },
    });

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}

// ─────────────────────────────────────────────
// COMPLIANCE CHECKS — Trivy CIS Docker Benchmark
// Uses official CIS Docker Benchmark v1.6.0 via
// Trivy's built-in compliance mode.
// ─────────────────────────────────────────────

async function runComplianceChecks() {
  // Get all running images to scan
  const rawContainers = await docker.listContainers({ all: false });
  const seen = new Set();
  const images = rawContainers
    .map(c => c.Image)
    .filter(img => { if (seen.has(img)) return false; seen.add(img); return true; });

  if (images.length === 0) {
    return { results: [], overallScore: 0 };
  }

  // Run Trivy CIS compliance scan on first image
  // (CIS checks are image-level, results apply to all containers using that image)
  const allControls = [];

  for (const image of images.slice(0, 3)) { // scan up to 3 images to avoid timeout
    try {
      const { stdout } = await execAsync(
        `trivy image --compliance docker-cis-1.6.0 --format json --quiet "${image}"`,
        { timeout: 180000, maxBuffer: 50 * 1024 * 1024 }
      );
      const result = JSON.parse(stdout);
      if (result.SummaryControls) {
        for (const control of result.SummaryControls) {
          // Only add if not already present
          if (!allControls.find(c => c.ID === control.ID)) {
            allControls.push({ ...control, image });
          }
        }
      }
    } catch (err) {
      console.error(`[Compliance] Scan failed for ${image}:`, err.message);
    }
  }

  if (allControls.length === 0) {
    return { results: [], overallScore: 0 };
  }

  // Group controls by section (4.x = Image, 5.x = Runtime, etc.)
  const groups = {
    image:   { id: 'image',   name: 'Image Security',      standard: 'CIS Docker Benchmark 4.x', controls: [] },
    runtime: { id: 'runtime', name: 'Container Runtime',   standard: 'CIS Docker Benchmark 5.x', controls: [] },
    other:   { id: 'other',   name: 'General Controls',    standard: 'CIS Docker Benchmark',      controls: [] },
  };

  for (const control of allControls) {
    const section = control.ID.split('.')[0];
    if (section === '4') groups.image.controls.push(control);
    else if (section === '5') groups.runtime.controls.push(control);
    else groups.other.controls.push(control);
  }

  const results = [];

  for (const group of Object.values(groups)) {
    if (group.controls.length === 0) continue;

    const checks = group.controls.map(c => {
      const isManual = c.Name?.includes('(Manual)');
      const failed = c.TotalFail > 0;
      return {
        check: `${c.ID} — ${c.Name}`,
        pass: isManual ? true : !failed, // manual checks can't be auto-assessed
        detail: isManual
          ? 'Manual check — requires human review'
          : failed
          ? `${c.TotalFail} finding(s) detected`
          : 'No issues found',
        severity: (c.Severity || 'LOW').toLowerCase(),
        manual: isManual,
      };
    });

    const autoChecks = checks.filter(c => !c.manual);
    const passCount = autoChecks.filter(c => c.pass).length;
    const totalCount = autoChecks.length;
    const passPct = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 100;

    results.push({
      id: group.id,
      name: group.name,
      standard: group.standard,
      passPct,
      passCount,
      totalCount,
      checks,
    });
  }

  const totalPass = results.reduce((s, r) => s + r.passCount, 0);
  const totalChecks = results.reduce((s, r) => s + r.totalCount, 0);
  const overallScore = totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 0;

  if (overallScore < 60) {
    addAlert({
      title: 'Low Compliance Score',
      description: `CIS Docker Benchmark score is ${overallScore}%. Review findings.`,
      severity: 'warning',
      source: 'compliance-checker',
    });
  }

  return { results, overallScore };
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

// POST /api/agent/report
// Agents POST their metrics here every 10s
app.post('/api/agent/report', (req, res) => {
  try {
    const payload = req.body;
    if (!payload.agentId) return res.status(400).json({ error: 'Missing agentId' });

    registerAgent(payload);

    if (payload.agentType === 'network') {
      // agent-3 (Network-Intrusion-Detector) sends threats instead of container metrics
      for (const threat of payload.threats || []) {
        addAlert({
          title: threat.threat,
          description: threat.detail,
          severity: threat.severity === 'critical' ? 'critical'
                  : threat.severity === 'high'     ? 'warning'
                  : 'info',
          source: `network-agent:${threat.containerName}`,
        });
      }
    } else {
      // agent-1 and agent-2 send container metrics
      checkThresholds(payload.agentLabel, payload.containers || []);
    }

    // Broadcast live updates to dashboard
    broadcast('containers:update', getAllContainersFromAgents());
    broadcast('agents:update', getAgentSummary());

    res.json({ ok: true });
  } catch (err) {
    console.error('Agent report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents
// Returns all registered agents and their status
app.get('/api/agents', (req, res) => {
  res.json(getAgentSummary());
});

// GET /api/containers
// Returns containers aggregated from all online agents
// Falls back to direct Docker API if no agents registered
app.get('/api/containers', async (req, res) => {
  try {
    const agentContainers = getAllContainersFromAgents();

    if (agentContainers.length > 0) {
      return res.json(agentContainers);
    }

    // Fallback: direct Docker API (no agents running)
    const rawContainers = await docker.listContainers({ all: true });
    const containers = await Promise.all(rawContainers.map(async (c) => {
      const { image, tag } = parseImage(c.Image);
      let cpuPct = null, memPct = null;
      if (c.State === 'running') {
        try {
          const container = docker.getContainer(c.Id);
          const stats = await container.stats({ stream: false });
          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          cpuPct = parseFloat(((cpuDelta / systemDelta) * (stats.cpu_stats.online_cpus || 1) * 100).toFixed(1));
          memPct = parseFloat(((stats.memory_stats.usage || 0) / (stats.memory_stats.limit || 1) * 100).toFixed(1));
        } catch { /* unavailable */ }
      }
      return { id: c.Id.slice(0, 12), name: (c.Names[0] || '').replace(/^\//, ''), image, tag, env: 'local', status: c.State, health: getHealth(c), cpuPct, memPct };
    }));
    res.json(containers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alerts
app.get('/api/alerts', (req, res) => {
  res.json(alertStore.filter(a => !a.acknowledged).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
});

// POST /api/alerts/:id/acknowledge
app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const alert = alertStore.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Not found' });
  alert.acknowledged = true;
  broadcast('alerts:update', alertStore.filter(a => !a.acknowledged));
  res.json({ ok: true });
});

// POST /api/alerts/acknowledge-all
app.post('/api/alerts/acknowledge-all', (req, res) => {
  alertStore = alertStore.map(a => ({ ...a, acknowledged: true }));
  broadcast('alerts:update', []);
  res.json({ ok: true });
});

// GET /api/vulnerabilities — concurrent scanning via worker threads
app.get('/api/vulnerabilities', async (req, res) => {
  await acquireTrivyLock();
  try {
    const rawContainers = await docker.listContainers({ all: false });
    const seen = new Set();
    const targets = rawContainers
      .map(c => ({ containerName: (c.Names[0] || '').replace(/^\//, ''), image: c.Image }))
      .filter(t => { if (seen.has(t.image)) return false; seen.add(t.image); return true; });

    console.log(`[Vuln] Scanning ${targets.length} images concurrently...`);
    const scanResults = await Promise.allSettled(
      targets.map(({ image }) => scanImageInWorker(image))
    );

    const allVulns = [];
    let idCounter = 0;

    scanResults.forEach((result, i) => {
      const { containerName, image } = targets[i];
      if (result.status === 'fulfilled' && result.value.ok) {
        for (const r of result.value.result.Results || []) {
          for (const v of r.Vulnerabilities || []) {
            allVulns.push({
              id: `vuln-${idCounter++}`,
              cveId: v.VulnerabilityID,
              container: containerName,
              package: v.PkgName,
              version: v.InstalledVersion,
              fixedVersion: v.FixedVersion || null,
              severity: normalizeSeverity(v.Severity),
              cvss: v.CVSS ? parseFloat(Object.values(v.CVSS).map(s => s.V3Score || s.V2Score || 0).sort((a, b) => b - a)[0].toFixed(1)) : null,
              status: 'open',
              description: v.Description || null,
            });
          }
        }
      } else {
        console.error(`[Vuln] Scan failed for ${image}:`, result.reason || result.value?.error);
      }
    });

    const criticals = allVulns.filter(v => v.severity === 'critical');
    if (criticals.length > 0) {
      addAlert({ title: 'Critical Vulnerabilities Detected', description: `${criticals.length} critical CVE(s) found across running containers.`, severity: 'critical', source: 'vulnerability-scanner' });
    }

    const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    allVulns.sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));
    res.json(allVulns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    releaseTrivyLock();
  }
});

// GET /api/compliance
app.get('/api/compliance', async (req, res) => {
  await acquireTrivyLock();
  try {
    const { results, overallScore } = await runComplianceChecks();
    res.json({ results, overallScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    releaseTrivyLock();
  }
});

// GET /api/stats
app.get('/api/stats', async (req, res) => {
  try {
    const allContainers = getAllContainersFromAgents();
    const totalContainers = allContainers.filter(c => c.status === 'running').length ||
      (await docker.listContainers({ all: false })).length;

    const activeAlerts = alertStore.filter(a => !a.acknowledged).length;
    const onlineAgents = Array.from(agentRegistry.values()).filter(a => a.status === 'online').length;

    res.json({ totalContainers, criticalVulns: null, complianceScore: null, threatsBlocked: activeAlerts, onlineAgents });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), agents: getAgentSummary().length });
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, () => {
  console.log(`[Backend] Running on http://localhost:${PORT}`);
  console.log(`[Backend] Socket.io ready for live push`);
  console.log(`[Backend] Waiting for agents to connect...`);
});