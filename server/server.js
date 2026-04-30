// ─────────────────────────────────────────────────────────────────────────────
// Citadel — Central Backend
//
// This is the brain of the platform. Agents POST their metrics here every 10s,
// we aggregate everything, run Trivy scans on demand, track alerts and faults,
// and push live updates to the dashboard via Socket.io.
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const { Worker } = require('worker_threads');
const Docker     = require('dockerode');
const cors       = require('cors');
const { exec }   = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app        = express();
const httpServer = http.createServer(app);

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '5mb' }));


// ─────────────────────────────────────────────────────────────────────────────
// SOCKET.IO
// Pushes live updates to the dashboard. On connect, we immediately send the
// current state so the dashboard doesn't have to wait for the next tick.
// ─────────────────────────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: { origin: 'http://localhost:5173', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);
  socket.emit('agents:update',  getAgentSummary());
  socket.emit('alerts:update',  alertStore.filter(a => !a.acknowledged));
  socket.emit('fault:status',   getFaultStatus());
  socket.on('disconnect', () => console.log(`[Socket] Client disconnected: ${socket.id}`));
});

function broadcast(event, data) {
  io.emit(event, data);
}


// ─────────────────────────────────────────────────────────────────────────────
// DOCKER
// Used locally for Trivy scans and container actions (restart, stop, start).
// Agents connect to their own Docker sockets independently.
// ─────────────────────────────────────────────────────────────────────────────

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET ||
    (process.platform === 'darwin'
      ? `${process.env.HOME}/.docker/run/docker.sock`
      : '/var/run/docker.sock')
});


// ─────────────────────────────────────────────────────────────────────────────
// THRESHOLDS
// Change these if you want alerts to fire at different CPU/memory levels.
// Agent timeout: how long before we consider an agent offline (in ms).
// ─────────────────────────────────────────────────────────────────────────────

const THRESHOLDS = {
  cpuWarn:        70,
  cpuCrit:        90,
  memWarn:        75,
  memCrit:        90,
  agentTimeoutMs: 30000,
};

const SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };


// ─────────────────────────────────────────────────────────────────────────────
// FAULT EVENT STORE
// Tracks active fault events and broadcasts them to the dashboard.
// Each event type can only have one active (unresolved) entry at a time —
// calling addFaultEvent with the same type is a no-op if one already exists.
// ─────────────────────────────────────────────────────────────────────────────

const faultEvents = [];
let faultIdCounter = 0;
let networkAgentFallbackActive = false;
let networkAgentFallbackAgent  = null;

function addFaultEvent({ type, title, description, severity = 'warning' }) {
  if (faultEvents.find(e => !e.resolved && e.type === type)) return;
  faultEvents.unshift({
    id: `fault-${faultIdCounter++}`,
    type, title, description, severity,
    resolved: false,
    timestamp: new Date().toISOString(),
  });
  if (faultEvents.length > 50) faultEvents.pop();
  broadcast('fault:status', getFaultStatus());
  console.log(`[Fault] ${severity.toUpperCase()}: ${title}`);
}

function resolveFaultEvent(type) {
  let changed = false;
  faultEvents.forEach(e => {
    if (e.type === type && !e.resolved) {
      e.resolved    = true;
      e.resolvedAt  = new Date().toISOString();
      changed       = true;
    }
  });
  if (changed) broadcast('fault:status', getFaultStatus());
}

function getFaultStatus() {
  return {
    active:               faultEvents.filter(e => !e.resolved),
    recent:               faultEvents.slice(0, 20),
    networkAgentFallback: networkAgentFallbackActive,
    fallbackAgent:        networkAgentFallbackAgent,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// ALERT STORE + AUDIT LOG
// Alerts are the live "something is wrong right now" view.
// Audit events are the permanent record of everything that happened.
// Both feed into the dashboard — alerts for the bell icon, audit for the log page.
// ─────────────────────────────────────────────────────────────────────────────

let alertStore    = [], alertIdCounter = 0;
let auditStore    = [], auditIdCounter = 0;

function addAuditEvent({ type, severity = 'info', source = 'system', title, description, meta = null }) {
  auditStore.unshift({
    id: `audit-${auditIdCounter++}`,
    type, severity, source, title, description, meta,
    timestamp: new Date().toISOString(),
  });
  // Keep the last 500 events — anything older gets dropped
  if (auditStore.length > 500) auditStore = auditStore.slice(0, 500);
}

function addAlert({ title, description, severity, source }) {
  // Don't create a duplicate if the same alert is already active
  if (alertStore.find(a => !a.acknowledged && a.title === title && a.source === source)) return;
  const alert = {
    id: `alert-${alertIdCounter++}`,
    title, description, severity, source,
    timestamp:    new Date().toISOString(),
    acknowledged: false,
  };
  alertStore.push(alert);
  addAuditEvent({ type: 'alert_created', severity, source, title, description, meta: { alertId: alert.id } });
  broadcast('alerts:update', alertStore.filter(a => !a.acknowledged));
}

function resolveAlert(title, source) {
  const matching = alertStore.filter(a => a.title === title && a.source === source && !a.acknowledged);
  matching.forEach(a => addAuditEvent({
    type: 'alert_resolved', severity: a.severity, source: a.source,
    title: a.title, description: a.description, meta: { alertId: a.id },
  }));
  const before = alertStore.filter(a => !a.acknowledged).length;
  alertStore = alertStore.map(a =>
    a.title === title && a.source === source && !a.acknowledged ? { ...a, acknowledged: true } : a
  );
  if (before !== alertStore.filter(a => !a.acknowledged).length) {
    broadcast('alerts:update', alertStore.filter(a => !a.acknowledged));
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// SCAN HISTORY
// Every time a scan completes, we log a summary here.
// This powers the "Scan History" panel on the dashboard homepage.
// ─────────────────────────────────────────────────────────────────────────────

const scanHistory   = [];
let scanIdCounter   = 0;

function recordScan({ type, targetCount, resultCount, status = 'complete' }) {
  scanHistory.unshift({
    id:          `scan-${scanIdCounter++}`,
    type,        // 'vulnerability' | 'compliance' | 'secrets'
    targetCount, // how many images were scanned
    resultCount, // how many findings came back
    status,      // 'complete' | 'error'
    timestamp:   new Date().toISOString(),
  });
  // Keep the last 50 scans
  if (scanHistory.length > 50) scanHistory.pop();
  broadcast('scan:history', scanHistory);
}


// ─────────────────────────────────────────────────────────────────────────────
// AGENT REGISTRY
// Agents check in every 10s. We track their last-seen time, status, and
// the containers they're monitoring. When an agent recovers after being offline,
// we resolve any fault events and send a recovery alert.
// ─────────────────────────────────────────────────────────────────────────────

const agentRegistry = new Map();

function registerAgent(payload) {
  const { agentId, agentLabel, timestamp, hostInfo, containers, containerCount } = payload;
  const existing = agentRegistry.get(agentId);
  agentRegistry.set(agentId, {
    agentId, agentLabel,
    lastSeen: new Date(timestamp),
    hostInfo, containers, containerCount,
    status: 'online',
  });

  // If this agent was previously offline, clean up all associated fault events
  if (existing && existing.status === 'offline') {
    addAlert({ title: 'Agent Recovered', description: `Monitoring agent "${agentLabel}" is back online.`, severity: 'info', source: agentId });
    addAuditEvent({ type: 'agent_recovered', severity: 'info', source: agentId, title: 'Agent Recovered', description: `Agent "${agentLabel}" came back online.` });
    resolveFaultEvent(`agent_offline_${agentId}`);
    resolveFaultEvent(`agent_auto_restart_${agentId}`);
    if (agentId === 'agent-3') {
      networkAgentFallbackActive = false;
      networkAgentFallbackAgent  = null;
      resolveFaultEvent('network_agent_offline');
    }
  }
}

function getAgentSummary() {
  return Array.from(agentRegistry.values()).map(a => ({
    agentId:        a.agentId,
    agentLabel:     a.agentLabel,
    lastSeen:       a.lastSeen,
    status:         a.status,
    containerCount: a.containerCount,
    hostInfo:       a.hostInfo,
  }));
}


// ─────────────────────────────────────────────────────────────────────────────
// CONTAINER HISTORY (for sparklines)
// We keep the last 60 data points per container (10 min at 10s intervals).
// When the dashboard renders a sparkline, it pulls from this buffer.
// ─────────────────────────────────────────────────────────────────────────────

const containerHistory = new Map();

function updateContainerHistory(containers) {
  const ts = Date.now();
  for (const c of containers) {
    if (c.cpuPct == null && c.memPct == null) continue;
    if (!containerHistory.has(c.name)) containerHistory.set(c.name, []);
    const hist = containerHistory.get(c.name);
    hist.push({ ts, cpu: c.cpuPct ?? 0, mem: c.memPct ?? 0 });
    if (hist.length > 60) hist.shift();
  }
}

function getAllContainersFromAgents() {
  const seen = new Set();
  const all  = [];
  for (const agent of agentRegistry.values()) {
    if (agent.status !== 'online') continue;
    for (const c of agent.containers || []) {
      if (seen.has(c.name)) continue;
      seen.add(c.name);
      all.push({
        ...c,
        agentId:    agent.agentId,
        agentLabel: agent.agentLabel,
        env:        agent.agentLabel,
        history:    containerHistory.get(c.name) || [],
      });
    }
  }
  return all;
}


// ─────────────────────────────────────────────────────────────────────────────
// LLM ANALYSIS STORE
// Agents with an OpenAI key send back AI-generated remediation advice
// for containers that are misbehaving. We keep the latest analysis per
// container and push them to the dashboard in real time.
// ─────────────────────────────────────────────────────────────────────────────

const llmAnalysisStore = [];
let llmAnalysisIdCounter = 0;

function handleLLMAnalyses(analyses, agentLabel) {
  for (const analysis of analyses) {
    const existing = llmAnalysisStore.find(a => a.containerName === analysis.containerName);
    if (existing) {
      Object.assign(existing, analysis, { id: existing.id, agentLabel });
    } else {
      llmAnalysisStore.unshift({ id: `llm-${llmAnalysisIdCounter++}`, ...analysis, agentLabel });
    }
    addAlert({
      title:       `AI Analysis: ${analysis.containerName}`,
      description: analysis.analysis,
      severity:    'warning',
      source:      `llm-analysis:${analysis.containerName}`,
    });
  }
  if (llmAnalysisStore.length > 50) llmAnalysisStore.splice(50);
  broadcast('llm:analyses', llmAnalysisStore);
}


// ─────────────────────────────────────────────────────────────────────────────
// AUTONOMOUS FAULT CORRECTION
// When a container or agent goes down, we try to restart it automatically.
// There's a 2-minute cooldown per container so we don't hammer a broken service.
// The fault event auto-resolves after 60s if the agent doesn't check back in first.
// ─────────────────────────────────────────────────────────────────────────────

const autoRestartCooldown = new Map();
const COOLDOWN_MS = 120000;

async function autonomousRestart(containerName, containerId, reason) {
  const last = autoRestartCooldown.get(containerName);
  if (last && Date.now() - last < COOLDOWN_MS) return;
  try {
    console.log(`[AutoFix] Restarting ${containerName} — reason: ${reason}`);
    autoRestartCooldown.set(containerName, Date.now());
    await docker.getContainer(containerId).start();
    addFaultEvent({ type: `auto_restart_${containerName}`, title: `Auto-Restarted: ${containerName}`, description: `Autonomous fault correction restarted "${containerName}". Reason: ${reason}`, severity: 'warning' });
    addAuditEvent({ type: 'autonomous_restart', severity: 'warning', source: 'fault-correction', title: 'Container Auto-Restarted', description: `"${containerName}" was automatically restarted. Reason: ${reason}` });
    addAlert({ title: 'Autonomous Fault Correction', description: `"${containerName}" was automatically restarted. Reason: ${reason}`, severity: 'warning', source: `auto-fix:${containerName}` });
    setTimeout(() => resolveFaultEvent(`auto_restart_${containerName}`), 60000);
  } catch (err) {
    console.error(`[AutoFix] Failed to restart ${containerName}:`, err.message);
  }
}

async function autonomousAgentRestart(agentId, agentLabel) {
  const containerName = `cs-${agentId}`;
  const last = autoRestartCooldown.get(containerName);
  if (last && Date.now() - last < COOLDOWN_MS) return;
  try {
    console.log(`[AutoFix] Restarting agent container: ${containerName}`);
    autoRestartCooldown.set(containerName, Date.now());
    await docker.getContainer(containerName).start();
    addFaultEvent({ type: `agent_auto_restart_${agentId}`, title: `Agent Auto-Restarted: ${agentLabel}`, description: `Autonomous fault correction restarted monitoring agent "${agentLabel}".`, severity: 'warning' });
    addAuditEvent({ type: 'autonomous_agent_restart', severity: 'warning', source: 'fault-correction', title: 'Agent Auto-Restarted', description: `Agent "${agentLabel}" was automatically restarted by the system.` });
    setTimeout(() => resolveFaultEvent(`agent_auto_restart_${agentId}`), 60000);
  } catch (err) {
    console.error(`[AutoFix] Failed to restart agent ${containerName}:`, err.message);
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// WATCHDOG
// Runs every 10s and checks if any agent has gone quiet.
// If agent-3 (the network detector) goes offline, we promote the first
// available metric agent as a temporary fallback — this triggers the
// yellow banner on the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

setInterval(async () => {
  const now     = Date.now();
  let changed   = false;

  for (const [id, agent] of agentRegistry.entries()) {
    const age = now - new Date(agent.lastSeen).getTime();
    if (age <= THRESHOLDS.agentTimeoutMs || agent.status !== 'online') continue;

    agent.status = 'offline';
    changed      = true;
    console.warn(`[Watchdog] Agent offline: ${agent.agentLabel} (${id})`);

    addAlert({ title: 'Monitoring Agent Offline', description: `Agent "${agent.agentLabel}" has not reported in ${Math.round(age / 1000)}s.`, severity: 'critical', source: id });
    addFaultEvent({ type: `agent_offline_${id}`, title: `Agent Offline: ${agent.agentLabel}`, description: `"${agent.agentLabel}" stopped reporting. Autonomous restart in progress...`, severity: 'critical' });
    addAuditEvent({ type: 'agent_offline', severity: 'critical', source: id, title: 'Agent Went Offline', description: `Agent "${agent.agentLabel}" missed heartbeat for ${Math.round(age / 1000)}s.` });

    if (id === 'agent-3') {
      // Network agent went down — promote the first available metric agent as fallback
      const fallback = Array.from(agentRegistry.values()).find(a => a.status === 'online' && a.agentId !== 'agent-3');
      if (fallback) {
        networkAgentFallbackActive = true;
        networkAgentFallbackAgent  = fallback.agentLabel;
        addFaultEvent({ type: 'network_agent_offline', title: 'Network Agent Failover Active', description: `Agent-3 (Network-Intrusion-Detector) is offline. ${fallback.agentLabel} is now handling basic network security monitoring until agent-3 recovers.`, severity: 'warning' });
      }
    } else {
      autonomousAgentRestart(id, agent.agentLabel);
    }
  }

  if (changed) {
    broadcast('agents:update', getAgentSummary());
    broadcast('alerts:update', alertStore.filter(a => !a.acknowledged));
    broadcast('fault:status',  getFaultStatus());
  }
}, 10000);


// ─────────────────────────────────────────────────────────────────────────────
// THRESHOLD CHECKS
// Called every time an agent reports container metrics. Fires alerts when
// CPU or memory is over threshold, and resolves them when things calm down.
// Uses container name (not agent label) as the source key so agent-1 and
// agent-2 reporting the same container don't create duplicate alerts.
// ─────────────────────────────────────────────────────────────────────────────

function checkThresholds(agentLabel, containers) {
  for (const c of containers) {
    const src = c.name;

    // Container state
    if (c.status === 'exited' || c.status === 'dead') {
      addAlert({ title: 'Container Down', description: `${c.name} has stopped (state: ${c.status}).`, severity: 'critical', source: `down-${src}` });
      autonomousRestart(c.name, c.id, `container entered ${c.status} state`);
    } else {
      resolveAlert('Container Down', `down-${src}`);
    }
    if (c.status === 'restarting') {
      addAlert({ title: 'Container Restarting', description: `${c.name} is in a restart loop.`, severity: 'warning', source: `restart-${src}` });
    } else {
      resolveAlert('Container Restarting', `restart-${src}`);
    }

    // CPU
    if (c.cpuPct != null) {
      if (c.cpuPct >= THRESHOLDS.cpuCrit)       addAlert({ title: 'Critical CPU Usage', description: `${c.name} is using ${c.cpuPct}% CPU.`, severity: 'critical', source: `cpu-${src}` });
      else if (c.cpuPct >= THRESHOLDS.cpuWarn)  addAlert({ title: 'High CPU Usage',      description: `${c.name} is using ${c.cpuPct}% CPU.`, severity: 'warning', source: `cpu-${src}` });
      else { resolveAlert('Critical CPU Usage', `cpu-${src}`); resolveAlert('High CPU Usage', `cpu-${src}`); }
    }

    // Memory
    if (c.memPct != null) {
      if (c.memPct >= THRESHOLDS.memCrit)       addAlert({ title: 'Critical Memory Usage', description: `${c.name} is using ${c.memPct}% memory.`, severity: 'critical', source: `mem-${src}` });
      else if (c.memPct >= THRESHOLDS.memWarn)  addAlert({ title: 'High Memory Usage',     description: `${c.name} is using ${c.memPct}% memory.`, severity: 'warning', source: `mem-${src}` });
      else { resolveAlert('Critical Memory Usage', `mem-${src}`); resolveAlert('High Memory Usage', `mem-${src}`); }
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// TRIVY MUTEX
// Trivy writes to a shared cache directory. If two scans run at the same time
// they'll fight over it and both fail. This simple queue ensures only one
// Trivy process runs at a time — others wait their turn.
// ─────────────────────────────────────────────────────────────────────────────

let trivyLocked    = false;
const trivyQueue   = [];

function acquireTrivyLock() {
  return new Promise(resolve => {
    if (!trivyLocked) { trivyLocked = true; resolve(); }
    else trivyQueue.push(resolve);
  });
}

function releaseTrivyLock() {
  if (trivyQueue.length > 0) trivyQueue.shift()();
  else trivyLocked = false;
}


// ─────────────────────────────────────────────────────────────────────────────
// TRIVY SCANNERS (worker threads)
// Each image scan runs in its own worker thread so Node's event loop isn't
// blocked during the scan. Vuln scans share the default Trivy cache (they're
// sequential within the lock). Secrets scans each get an isolated temp cache
// directory so they can run in parallel safely.
// ─────────────────────────────────────────────────────────────────────────────

function scanImageInWorker(image) {
  return new Promise((resolve, reject) => {
    const code = `
      const { execSync } = require('child_process');
      const { workerData, parentPort } = require('worker_threads');
      try {
        const out = execSync(
          \`trivy image --format json --quiet --scanners vuln "\${workerData.image}"\`,
          { timeout: 120000, maxBuffer: 50 * 1024 * 1024 }
        );
        parentPort.postMessage({ ok: true, result: JSON.parse(out.toString()) });
      } catch (err) {
        parentPort.postMessage({ ok: false, error: err.message });
      }
    `;
    const w = new Worker(code, { eval: true, workerData: { image } });
    w.on('message', resolve);
    w.on('error',   reject);
    w.on('exit', c => { if (c !== 0) reject(new Error(`Worker exited ${c}`)); });
  });
}

function scanSecretsInWorker(image, cacheDir) {
  return new Promise((resolve, reject) => {
    const code = `
      const { execSync } = require('child_process');
      const { workerData, parentPort } = require('worker_threads');
      try {
        const out = execSync(
          \`trivy image --format json --quiet --scanners secret --cache-dir "\${workerData.cacheDir}" --image-src docker "\${workerData.image}"\`,
          { timeout: 120000, maxBuffer: 50 * 1024 * 1024 }
        );
        parentPort.postMessage({ ok: true, result: JSON.parse(out.toString()) });
      } catch (err) {
        parentPort.postMessage({ ok: false, error: err.message });
      }
    `;
    const w = new Worker(code, { eval: true, workerData: { image, cacheDir } });
    w.on('message', resolve);
    w.on('error',   reject);
    w.on('exit', c => { if (c !== 0) reject(new Error(`Worker exited ${c}`)); });
  });
}


// ─────────────────────────────────────────────────────────────────────────────
// CIS COMPLIANCE CHECKS
// Runs Trivy's CIS Docker Benchmark 1.6.0 against up to 3 images.
// Groups results by section (4.x = Image Security, 5.x = Container Runtime).
// Manual checks are excluded from the score — they can't be auto-assessed.
// ─────────────────────────────────────────────────────────────────────────────

let cachedComplianceScore = null;

async function runComplianceChecks() {
  const raw    = await docker.listContainers({ all: false });
  const seen   = new Set();
  const images = raw.map(c => c.Image).filter(img => {
    if (seen.has(img)) return false;
    seen.add(img);
    return true;
  });

  if (images.length === 0) return { results: [], overallScore: 0 };

  const allControls = [];
  for (const image of images.slice(0, 3)) {
    try {
      const { stdout } = await execAsync(
        `trivy image --compliance docker-cis-1.6.0 --format json --quiet "${image}"`,
        { timeout: 180000, maxBuffer: 50 * 1024 * 1024 }
      );
      const result = JSON.parse(stdout);
      if (result.SummaryControls) {
        for (const c of result.SummaryControls) {
          if (!allControls.find(x => x.ID === c.ID)) allControls.push({ ...c, image });
        }
      }
    } catch (err) {
      console.error(`[Compliance] Scan failed for ${image}:`, err.message);
    }
  }

  if (allControls.length === 0) return { results: [], overallScore: 0 };

  const groups = {
    image:   { id: 'image',   name: 'Image Security',    standard: 'CIS Docker Benchmark 4.x', controls: [] },
    runtime: { id: 'runtime', name: 'Container Runtime', standard: 'CIS Docker Benchmark 5.x', controls: [] },
    other:   { id: 'other',   name: 'General Controls',  standard: 'CIS Docker Benchmark',     controls: [] },
  };

  for (const c of allControls) {
    const section = c.ID.split('.')[0];
    if      (section === '4') groups.image.controls.push(c);
    else if (section === '5') groups.runtime.controls.push(c);
    else                      groups.other.controls.push(c);
  }

  const results = [];
  for (const g of Object.values(groups)) {
    if (!g.controls.length) continue;
    const checks = g.controls.map(c => {
      const manual = c.Name?.includes('(Manual)');
      return {
        check:    `${c.ID} — ${c.Name}`,
        pass:     manual ? true : !c.TotalFail,
        detail:   manual ? 'Manual check — requires human review' : c.TotalFail > 0 ? `${c.TotalFail} finding(s) detected` : 'No issues found',
        severity: (c.Severity || 'LOW').toLowerCase(),
        manual,
      };
    });
    const auto = checks.filter(c => !c.manual);
    results.push({
      id:         g.id,
      name:       g.name,
      standard:   g.standard,
      passPct:    auto.length ? Math.round((auto.filter(c => c.pass).length / auto.length) * 100) : 100,
      passCount:  auto.filter(c => c.pass).length,
      totalCount: auto.length,
      checks,
    });
  }

  const totalPass   = results.reduce((s, r) => s + r.passCount,  0);
  const totalChecks = results.reduce((s, r) => s + r.totalCount, 0);
  const overallScore = totalChecks > 0 ? Math.round((totalPass / totalChecks) * 100) : 0;

  if (overallScore < 60) addAlert({ title: 'Low Compliance Score', description: `CIS Docker Benchmark score is ${overallScore}%.`, severity: 'warning', source: 'compliance-checker' });
  return { results, overallScore };
}


// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getHealth(c) {
  const st = c.State, s = c.Status || '';
  if (st === 'running') {
    if (s.includes('unhealthy'))      return 'crit';
    if (s.includes('health: starting')) return 'warn';
    return 'ok';
  }
  if (st === 'exited' || st === 'dead') return 'crit';
  return 'warn';
}

function parseImage(img) {
  const p = (img || '').split(':');
  return { image: p[0] || 'unknown', tag: p[1] || 'latest' };
}

function normalizeSeverity(s) {
  return (s || 'unknown').toLowerCase();
}


// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — AGENTS
// ─────────────────────────────────────────────────────────────────────────────

// Agents POST here every 10s with their metrics payload
app.post('/api/agent/report', (req, res) => {
  try {
    const payload = req.body;
    if (!payload.agentId) return res.status(400).json({ error: 'Missing agentId' });

    registerAgent(payload);

    if (payload.agentType === 'network') {
      // Agent-3 sends threat reports instead of container metrics
      for (const threat of payload.threats || []) {
        addAlert({
          title:       threat.threat,
          description: threat.detail,
          severity:    threat.severity === 'critical' ? 'critical' : threat.severity === 'high' ? 'warning' : 'info',
          source:      `network-agent:${threat.containerName}`,
        });
      }
    } else {
      // Agent-1 and agent-2 send container metrics + optional LLM analyses
      updateContainerHistory(payload.containers || []);
      checkThresholds(payload.agentLabel, payload.containers || []);
      if (payload.analyses?.length > 0) handleLLMAnalyses(payload.analyses, payload.agentLabel);
    }

    broadcast('containers:update', getAllContainersFromAgents());
    broadcast('agents:update',     getAgentSummary());
    res.json({ ok: true });
  } catch (err) {
    console.error('Agent report error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/agents', (req, res) => res.json(getAgentSummary()));


// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — CONTAINERS
// ─────────────────────────────────────────────────────────────────────────────

// Returns containers from agents if available, falls back to direct Docker API
app.get('/api/containers', async (req, res) => {
  try {
    const fromAgents = getAllContainersFromAgents();
    if (fromAgents.length > 0) return res.json(fromAgents);

    // Fallback: query Docker directly (no agents running)
    const raw = await docker.listContainers({ all: true });
    const containers = await Promise.all(raw.map(async c => {
      const { image, tag } = parseImage(c.Image);
      let cpuPct = null, memPct = null;
      if (c.State === 'running') {
        try {
          const s   = await docker.getContainer(c.Id).stats({ stream: false });
          const cd  = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
          const sd  = s.cpu_stats.system_cpu_usage - s.precpu_stats.system_cpu_usage;
          cpuPct    = parseFloat(((cd / sd) * (s.cpu_stats.online_cpus || 1) * 100).toFixed(1));
          memPct    = parseFloat(((s.memory_stats.usage || 0) / (s.memory_stats.limit || 1) * 100).toFixed(1));
        } catch { /* stats unavailable for this container */ }
      }
      return { id: c.Id.slice(0, 12), name: (c.Names[0] || '').replace(/^\//, ''), image, tag, env: 'local', status: c.State, health: getHealth(c), cpuPct, memPct, history: [] };
    }));
    res.json(containers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/containers/:id/restart', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    await container.restart();
    const info = await container.inspect();
    const name = info.Name.replace(/^\//, '');
    addAuditEvent({ type: 'container_restarted', severity: 'info', source: 'dashboard', title: 'Container Restarted', description: `"${name}" was restarted from the dashboard.` });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/containers/:id/stop', async (req, res) => {
  try {
    const container = docker.getContainer(req.params.id);
    const info = await container.inspect();
    const name = info.Name.replace(/^\//, '');
    await container.stop();
    addAuditEvent({ type: 'container_stopped', severity: 'warning', source: 'dashboard', title: 'Container Stopped', description: `"${name}" was stopped from the dashboard.` });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/containers/:id/start', async (req, res) => {
  try {
    await docker.getContainer(req.params.id).start();
    const info = await docker.getContainer(req.params.id).inspect();
    const name = info.Name.replace(/^\//, '');
    addAuditEvent({ type: 'container_started', severity: 'info', source: 'dashboard', title: 'Container Started', description: `"${name}" was started from the dashboard.` });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — ALERTS + AUDIT
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/alerts', (req, res) => {
  res.json(alertStore.filter(a => !a.acknowledged).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
});

app.get('/api/audit', (req, res) => res.json(auditStore));

app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const alert = alertStore.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Not found' });
  alert.acknowledged = true;
  addAuditEvent({ type: 'alert_acknowledged', severity: alert.severity, source: alert.source, title: alert.title, description: alert.description, meta: { alertId: alert.id } });
  broadcast('alerts:update', alertStore.filter(a => !a.acknowledged));
  res.json({ ok: true });
});

app.post('/api/alerts/acknowledge-all', (req, res) => {
  alertStore.filter(a => !a.acknowledged).forEach(a => {
    addAuditEvent({ type: 'alert_acknowledged', severity: a.severity, source: a.source, title: a.title, description: a.description, meta: { alertId: a.id, bulk: true } });
  });
  alertStore = alertStore.map(a => ({ ...a, acknowledged: true }));
  broadcast('alerts:update', []);
  res.json({ ok: true });
});


// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — SCANS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/vulnerabilities', async (req, res) => {
  await acquireTrivyLock();
  try {
    const raw     = await docker.listContainers({ all: false });
    const seen    = new Set();
    const targets = raw
      .map(c => ({ containerName: (c.Names[0] || '').replace(/^\//, ''), image: c.Image }))
      .filter(t => { if (seen.has(t.image)) return false; seen.add(t.image); return true; });

    console.log(`[Vuln] Scanning ${targets.length} images concurrently...`);
    addAuditEvent({ type: 'vulnerability_scan_started', severity: 'info', source: 'vulnerability-scanner', title: 'Vulnerability Scan Started', description: `Started vulnerability scan for ${targets.length} image(s).` });

    const scanResults = await Promise.allSettled(targets.map(({ image }) => scanImageInWorker(image)));
    const allVulns = [];
    let n = 0;

    scanResults.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.ok) {
        for (const result of r.value.result.Results || []) {
          for (const v of result.Vulnerabilities || []) {
            allVulns.push({
              id:              `vuln-${n++}`,
              cveId:           v.VulnerabilityID,
              container:       targets[i].containerName,
              image:           targets[i].image,
              package:         v.PkgName,
              version:         v.InstalledVersion,
              fixedVersion:    v.FixedVersion || null,
              severity:        normalizeSeverity(v.Severity),
              cvss:            v.CVSS ? parseFloat(Object.values(v.CVSS).map(s => s.V3Score || s.V2Score || 0).sort((a, b) => b - a)[0].toFixed(1)) : null,
              status:          'open',
              description:     v.Description    || null,
              references:      v.References      || [],
              publishedDate:   v.PublishedDate   || null,
              target:          result.Target      || null,
            });
          }
        }
      }
    });

    const crits = allVulns.filter(v => v.severity === 'critical');
    if (crits.length > 0) addAlert({ title: 'Critical Vulnerabilities Detected', description: `${crits.length} critical CVE(s) found.`, severity: 'critical', source: 'vulnerability-scanner' });

    allVulns.sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
    recordScan({ type: 'vulnerability', targetCount: targets.length, resultCount: allVulns.length });
    res.json(allVulns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    releaseTrivyLock();
  }
});

app.get('/api/compliance', async (req, res) => {
  await acquireTrivyLock();
  try {
    addAuditEvent({ type: 'compliance_scan_started', severity: 'info', source: 'compliance-checker', title: 'Compliance Scan Started', description: 'Started CIS Docker Benchmark compliance scan.' });
    const { results, overallScore } = await runComplianceChecks();
    cachedComplianceScore = overallScore;
    recordScan({ type: 'compliance', targetCount: results.length, resultCount: results.reduce((s, r) => s + (r.totalCount - r.passCount), 0) });
    res.json({ results, overallScore });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    releaseTrivyLock();
  }
});

app.get('/api/secrets', async (req, res) => {
  await acquireTrivyLock();
  try {
    const raw     = await docker.listContainers({ all: false });
    const seen    = new Set();
    const targets = raw
      .map(c => ({ containerName: (c.Names[0] || '').replace(/^\//, ''), image: c.Image }))
      .filter(t => { if (seen.has(t.image)) return false; seen.add(t.image); return true; });

    console.log(`[Secrets] Scanning ${targets.length} images in parallel with isolated cache dirs...`);
    addAuditEvent({ type: 'secrets_scan_started', severity: 'info', source: 'secrets-scanner', title: 'Secrets Scan Started', description: `Started secrets scan for ${targets.length} image(s).` });

    // Each worker gets its own temp cache dir to avoid Trivy cache conflicts
    const scanResults = await Promise.allSettled(
      targets.map(({ image }, i) => {
        const cacheDir = `/tmp/trivy-secrets-${i}-${Date.now()}`;
        return scanSecretsInWorker(image, cacheDir).finally(() => {
          try { require('child_process').execSync(`rm -rf ${cacheDir}`); } catch {}
        });
      })
    );

    const allSecrets = [];
    let n = 0;

    scanResults.forEach((r, i) => {
      if (r.status === 'fulfilled' && r.value.ok) {
        for (const result of r.value.result.Results || []) {
          for (const s of result.Secrets || []) {
            allSecrets.push({
              id:       `secret-${n++}`,
              container: targets[i].containerName,
              image:     targets[i].image,
              ruleId:    s.RuleID,
              category:  s.Category || 'secret',
              title:     s.Title,
              severity:  (s.Severity || 'unknown').toLowerCase(),
              match:     s.Match ? s.Match.slice(0, 80) + (s.Match.length > 80 ? '…' : '') : null,
              target:    result.Target,
            });
          }
        }
      } else {
        console.error(`[Secrets] Scan failed for ${targets[i]?.image}:`, r.reason || r.value?.error);
      }
    });

    if (allSecrets.length > 0) addAlert({ title: 'Secrets Detected in Images', description: `${allSecrets.length} secret(s) found hardcoded in container images.`, severity: 'critical', source: 'secrets-scanner' });
    allSecrets.sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9));
    recordScan({ type: 'secrets', targetCount: targets.length, resultCount: allSecrets.length });
    res.json(allSecrets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    releaseTrivyLock();
  }
});


// ─────────────────────────────────────────────────────────────────────────────
// ROUTES — DASHBOARD DATA
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const ac = getAllContainersFromAgents();
    const totalContainers = ac.filter(c => c.status === 'running').length || (await docker.listContainers({ all: false })).length;
    res.json({
      totalContainers,
      complianceScore:  cachedComplianceScore,
      threatsBlocked:   alertStore.filter(a => !a.acknowledged).length,
      onlineAgents:     Array.from(agentRegistry.values()).filter(a => a.status === 'online').length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/scan-history', (req, res) => res.json(scanHistory));
app.get('/api/fault-status', (req, res) => res.json(getFaultStatus()));
app.get('/api/llm-analyses', (req, res) => res.json(llmAnalysisStore));
app.get('/api/health',       (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString(), agents: getAgentSummary().length }));


// ─────────────────────────────────────────────────────────────────────────────
// DEMO HELPERS
// Useful for the presentation — inject a fake LLM analysis without needing
// a real CPU spike to trigger it. Hit this endpoint from the terminal:
// curl -X POST http://localhost:3002/api/demo/llm-test -H "Content-Type: application/json" -d '{"containerName":"cs-backend"}'
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/demo/llm-test', (req, res) => {
  const sample = {
    id:            `llm-demo-${Date.now()}`,
    containerName: req.body.containerName || 'cs-backend',
    agentLabel:    'Host-Primary',
    issues:        ['Critical CPU usage: 94.2% (sustained for 3 report cycles)', 'Container has restarted 2 time(s) in last 5 minutes'],
    analysis:      'The cs-backend container is experiencing a sustained CPU spike likely caused by concurrent Trivy scans running without resource limits. Immediately add a CPU limit of 1.0 to the container in docker-compose.yml and consider staggering scan schedules to prevent simultaneous execution.',
    timestamp:     new Date().toISOString(),
  };
  llmAnalysisStore.unshift(sample);
  if (llmAnalysisStore.length > 50) llmAnalysisStore.splice(50);
  broadcast('llm:analyses', llmAnalysisStore);
  res.json({ ok: true, sample });
});


// ─────────────────────────────────────────────────────────────────────────────
// START
// ─────────────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, () => {
  console.log(`[Backend] Running on http://localhost:${PORT}`);
  console.log(`[Backend] Socket.io ready for live push`);
  console.log(`[Backend] Fault tolerance + autonomous correction active`);
  console.log(`[Backend] Waiting for agents to check in...`);
});