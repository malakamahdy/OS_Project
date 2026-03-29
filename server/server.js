const express = require('express');
const Docker = require('dockerode');
const cors = require('cors');

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

// Map container state to health: 'ok' | 'warn' | 'crit'
function getHealth(container) {
  const state = container.State;
  const status = container.Status || '';

  if (state === 'running') {
    // If restarting or unhealthy in status string
    if (status.includes('unhealthy')) return 'crit';
    if (status.includes('health: starting')) return 'warn';
    return 'ok';
  }
  if (state === 'exited' || state === 'dead') return 'crit';
  if (state === 'paused' || state === 'restarting') return 'warn';
  return 'warn';
}

// Parse image name and tag from full image string e.g. "nginx:1.21.3"
function parseImage(imageString) {
  const parts = (imageString || '').split(':');
  return {
    image: parts[0] || 'unknown',
    tag: parts[1] || 'latest',
  };
}

// ─────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────

// GET /api/containers
// Returns all containers with health, cpu, memory info
app.get('/api/containers', async (req, res) => {
  try {
    const rawContainers = await docker.listContainers({ all: true });

    const containers = await Promise.all(
      rawContainers.map(async (c) => {
        const { image, tag } = parseImage(c.Image);

        let cpuPct = null;
        let memPct = null;

        // Only get stats for running containers
        if (c.State === 'running') {
          try {
            const container = docker.getContainer(c.Id);
            const stats = await container.stats({ stream: false });

            // CPU %
            const cpuDelta =
              stats.cpu_stats.cpu_usage.total_usage -
              stats.precpu_stats.cpu_usage.total_usage;
            const systemDelta =
              stats.cpu_stats.system_cpu_usage -
              stats.precpu_stats.system_cpu_usage;
            const numCpus = stats.cpu_stats.online_cpus || 1;
            cpuPct = parseFloat(
              ((cpuDelta / systemDelta) * numCpus * 100).toFixed(1)
            );

            // Memory %
            const memUsage = stats.memory_stats.usage || 0;
            const memLimit = stats.memory_stats.limit || 1;
            memPct = parseFloat(((memUsage / memLimit) * 100).toFixed(1));
          } catch {
            // Stats unavailable for this container
          }
        }

        return {
          id: c.Id.slice(0, 12),
          name: (c.Names[0] || '').replace(/^\//, ''),
          image,
          tag,
          env: 'local',
          status: c.State,
          health: getHealth(c),
          cpuPct,
          memPct,
        };
      })
    );

    res.json(containers);
  } catch (err) {
      console.error('Error fetching containers:', err.message);
      res.status(500).json({ ok: 0, error: err.message, stack: err.stack });
  }
});

// GET /api/stats
// Returns aggregate numbers for the stat cards
app.get('/api/stats', async (req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });

    const totalContainers = containers.filter(
      (c) => c.State === 'running'
    ).length;

    res.json({
      totalContainers,
      criticalVulns: null,    // filled in once scanner is integrated
      complianceScore: null,  // filled in once compliance is integrated
      threatsBlocked: null,   // filled in once alerting is integrated
    });
  } catch (err) {
    console.error('Error fetching stats:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/health
// Simple health check so the frontend can verify backend is reachable
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Connecting to Docker at /var/run/docker.sock`);
});
