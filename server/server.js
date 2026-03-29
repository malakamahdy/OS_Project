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

// GET /api/vulnerabilities
// Runs Trivy sequentially against all running container images
app.get('/api/vulnerabilities', async (req, res) => {
  try {
    const rawContainers = await docker.listContainers({ all: false });

    // Deduplicate images so we don't scan the same image twice
    const seen = new Set();
    const targets = rawContainers
      .map(c => ({ containerName: (c.Names[0] || '').replace(/^\//, ''), image: c.Image }))
      .filter(t => { if (seen.has(t.image)) return false; seen.add(t.image); return true; });

    const allVulns = [];
    let idCounter = 0;

    // Sequential — avoids Trivy cache conflicts
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

    // Sort critical first
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

    res.json({
      totalContainers,
      criticalVulns: null,
      complianceScore: null,
      threatsBlocked: null,
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
});
