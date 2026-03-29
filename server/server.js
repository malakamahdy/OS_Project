const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const app = express();

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET ||
    (process.platform === 'darwin'
      ? `${process.env.HOME}/.docker/run/docker.sock`
      : '/var/run/docker.sock')
});

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// ─────────────────────────────────────────────
// THRESHOLDS — tweak these as needed
// ─────────────────────────────────────────────

const THRESHOLDS = {
  cpuWarn:    70,   // % CPU — warning
  cpuCrit:    90,   // % CPU — critical
  memWarn:    75,   // % memory — warning
  memCrit:    90,   // % memory — critical
};

// ─────────────────────────────────────────────
// IN-MEMORY ALERT STORE
// Alerts persist while the server is running.
// Replace with a database for production.
// ─────────────────────────────────────────────

let alertStore = [];
let alertIdCounter = 0;

function addAlert({ title, description, severity, source }) {
  // Deduplicate: don't add same alert if already open for same source+title
  const exists = alertStore.find(
    a => !a.acknowledged && a.title === title && a.source === source
  );
  if (exists) return;

  alertStore.push({
    id: `alert-${alertIdCounter++}`,
    title,
    description,
    severity,   // 'critical' | 'warning' | 'info'
    source,     // container name or system
    timestamp: new Date().toISOString(),
    acknowledged: false,
  });
}

function resolveAlert(title, source) {
  // Mark alert as acknowledged when the condition clears
  alertStore = alertStore.map(a =>
    a.title === title && a.source === source && !a.acknowledged
      ? { ...a, acknowledged: true }
      : a
  );
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
// MONITORING LOOP
// Runs every 15 seconds, checks all containers
// and generates alerts based on thresholds.
// ─────────────────────────────────────────────

async function runMonitoringCheck() {
  try {
    const rawContainers = await docker.listContainers({ all: true });

    for (const c of rawContainers) {
      const name = (c.Names[0] || '').replace(/^\//, '');
      const state = c.State;

      // ── Container down ──
      if (state === 'exited' || state === 'dead') {
        addAlert({
          title: 'Container Down',
          description: `${name} has stopped unexpectedly (state: ${state}).`,
          severity: 'critical',
          source: name,
        });
      } else {
        resolveAlert('Container Down', name);
      }

      // ── Container restarting ──
      if (state === 'restarting') {
        addAlert({
          title: 'Container Restarting',
          description: `${name} is in a restart loop. Check logs for crash reasons.`,
          severity: 'warning',
          source: name,
        });
      } else {
        resolveAlert('Container Restarting', name);
      }

      // ── CPU / Memory thresholds (running only) ──
      if (state === 'running') {
        try {
          const container = docker.getContainer(c.Id);
          const stats = await container.stats({ stream: false });

          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          const numCpus = stats.cpu_stats.online_cpus || 1;
          const cpuPct = (cpuDelta / systemDelta) * numCpus * 100;

          const memUsage = stats.memory_stats.usage || 0;
          const memLimit = stats.memory_stats.limit || 1;
          const memPct = (memUsage / memLimit) * 100;

          // CPU alerts
          if (cpuPct >= THRESHOLDS.cpuCrit) {
            addAlert({
              title: 'Critical CPU Usage',
              description: `${name} is using ${cpuPct.toFixed(1)}% CPU, exceeding the ${THRESHOLDS.cpuCrit}% threshold.`,
              severity: 'critical',
              source: name,
            });
          } else if (cpuPct >= THRESHOLDS.cpuWarn) {
            addAlert({
              title: 'High CPU Usage',
              description: `${name} is using ${cpuPct.toFixed(1)}% CPU, exceeding the ${THRESHOLDS.cpuWarn}% warning threshold.`,
              severity: 'warning',
              source: name,
            });
          } else {
            resolveAlert('Critical CPU Usage', name);
            resolveAlert('High CPU Usage', name);
          }

          // Memory alerts
          if (memPct >= THRESHOLDS.memCrit) {
            addAlert({
              title: 'Critical Memory Usage',
              description: `${name} is using ${memPct.toFixed(1)}% of its memory limit.`,
              severity: 'critical',
              source: name,
            });
          } else if (memPct >= THRESHOLDS.memWarn) {
            addAlert({
              title: 'High Memory Usage',
              description: `${name} is using ${memPct.toFixed(1)}% of its memory limit.`,
              severity: 'warning',
              source: name,
            });
          } else {
            resolveAlert('Critical Memory Usage', name);
            resolveAlert('High Memory Usage', name);
          }

        } catch { /* stats unavailable for this container */ }
      }
    }
  } catch (err) {
    console.error('Monitoring check failed:', err.message);
  }
}

// Start monitoring loop immediately and repeat every 15s
runMonitoringCheck();
setInterval(runMonitoringCheck, 15000);

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

// GET /api/containers
app.get('/api/containers', async (req, res) => {
  try {
    const rawContainers = await docker.listContainers({ all: true });

    const containers = await Promise.all(
      rawContainers.map(async (c) => {
        const { image, tag } = parseImage(c.Image);
        let cpuPct = null;
        let memPct = null;

        if (c.State === 'running') {
          try {
            const container = docker.getContainer(c.Id);
            const stats = await container.stats({ stream: false });
            const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
            const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
            const numCpus = stats.cpu_stats.online_cpus || 1;
            cpuPct = parseFloat(((cpuDelta / systemDelta) * numCpus * 100).toFixed(1));
            const memUsage = stats.memory_stats.usage || 0;
            const memLimit = stats.memory_stats.limit || 1;
            memPct = parseFloat(((memUsage / memLimit) * 100).toFixed(1));
          } catch { /* stats unavailable */ }
        }

        return {
          id: c.Id.slice(0, 12),
          name: (c.Names[0] || '').replace(/^\//, ''),
          image, tag, env: 'local',
          status: c.State,
          health: getHealth(c),
          cpuPct, memPct,
        };
      })
    );

    res.json(containers);
  } catch (err) {
    console.error('Error fetching containers:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alerts
// Returns all active (unacknowledged) alerts, newest first
app.get('/api/alerts', (req, res) => {
  const active = alertStore
    .filter(a => !a.acknowledged)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  res.json(active);
});

// POST /api/alerts/:id/acknowledge
// Mark a single alert as acknowledged
app.post('/api/alerts/:id/acknowledge', (req, res) => {
  const alert = alertStore.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ error: 'Alert not found' });
  alert.acknowledged = true;
  res.json({ ok: true });
});

// POST /api/alerts/acknowledge-all
// Clear all active alerts
app.post('/api/alerts/acknowledge-all', (req, res) => {
  alertStore = alertStore.map(a => ({ ...a, acknowledged: true }));
  res.json({ ok: true });
});

// GET /api/vulnerabilities
app.get('/api/vulnerabilities', async (req, res) => {
  try {
    const rawContainers = await docker.listContainers({ all: false });

    const seen = new Set();
    const targets = rawContainers
      .map(c => ({ containerName: (c.Names[0] || '').replace(/^\//, ''), image: c.Image }))
      .filter(t => { if (seen.has(t.image)) return false; seen.add(t.image); return true; });

    const allVulns = [];
    let idCounter = 0;

    for (const { containerName, image } of targets) {
      try {
        const { stdout } = await execAsync(
          `trivy image --format json --quiet --scanners vuln "${image}"`,
          { timeout: 120000 }
        );
        const result = JSON.parse(stdout);

        for (const r of result.Results || []) {
          for (const v of r.Vulnerabilities || []) {
            allVulns.push({
              id: `vuln-${idCounter++}`,
              cveId: v.VulnerabilityID,
              container: containerName,
              package: v.PkgName,
              version: v.InstalledVersion,
              fixedVersion: v.FixedVersion || null,
              severity: normalizeSeverity(v.Severity),
              cvss: v.CVSS
                ? parseFloat(Object.values(v.CVSS).map(s => s.V3Score || s.V2Score || 0).sort((a, b) => b - a)[0].toFixed(1))
                : null,
              status: 'open',
              description: v.Description || null,
            });
          }
        }
      } catch (err) {
        console.error(`Trivy scan failed for ${image}:`, err.message);
      }
    }

    // Generate alerts for critical vulns found
    const criticals = allVulns.filter(v => v.severity === 'critical');
    if (criticals.length > 0) {
      addAlert({
        title: 'Critical Vulnerabilities Detected',
        description: `${criticals.length} critical CVE(s) found across your running containers. Immediate patching recommended.`,
        severity: 'critical',
        source: 'vulnerability-scanner',
      });
    }

    const ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
    allVulns.sort((a, b) => (ORDER[a.severity] ?? 9) - (ORDER[b.severity] ?? 9));

    res.json(allVulns);
  } catch (err) {
    console.error('Error running vulnerability scan:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stats
app.get('/api/stats', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const totalContainers = containers.filter(c => c.State === 'running').length;
    const activeAlerts = alertStore.filter(a => !a.acknowledged).length;

    res.json({
      totalContainers,
      criticalVulns: null,
      complianceScore: null,
      threatsBlocked: activeAlerts,
    });
  } catch (err) {
    console.error('Error fetching stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Monitoring containers every 15 seconds...`);
});
