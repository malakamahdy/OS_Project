const Docker = require('dockerode');
const axios = require('axios');
const os = require('os');

// ─────────────────────────────────────────────
// AGENT CONFIG
// ─────────────────────────────────────────────

const AGENT_ID        = process.env.AGENT_ID || `agent-${os.hostname()}`;
const AGENT_LABEL     = process.env.AGENT_LABEL || os.hostname();
const BACKEND_URL     = process.env.BACKEND_URL || 'http://localhost:3002';
const REPORT_INTERVAL = parseInt(process.env.REPORT_INTERVAL || '10000');
const OPENAI_API_KEY  = process.env.OPENAI_API_KEY || null;

const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET ||
    (process.platform === 'darwin'
      ? `${process.env.HOME}/.docker/run/docker.sock`
      : '/var/run/docker.sock')
});

console.log(`[Agent] Starting: ${AGENT_ID} (${AGENT_LABEL})`);
console.log(`[Agent] Reporting to: ${BACKEND_URL}`);
console.log(`[Agent] Interval: ${REPORT_INTERVAL}ms`);
console.log(`[Agent] LLM Analysis: ${OPENAI_API_KEY ? 'ENABLED' : 'DISABLED (no API key)'}`);

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

// ─────────────────────────────────────────────
// CONTAINER ISSUE HISTORY
// Tracks repeated issues per container so the
// LLM has context about patterns over time.
// ─────────────────────────────────────────────

const issueHistory = new Map();
// containerName → [{ ts, type, value }, ...]

function recordIssue(name, type, value) {
  if (!issueHistory.has(name)) issueHistory.set(name, []);
  const hist = issueHistory.get(name);
  hist.push({ ts: Date.now(), type, value });
  // Keep last 10 issues per container
  if (hist.length > 10) hist.shift();
}

function getIssueCount(name, type, windowMs = 300000) {
  const hist = issueHistory.get(name) || [];
  const cutoff = Date.now() - windowMs;
  return hist.filter(e => e.type === type && e.ts > cutoff).length;
}

// ─────────────────────────────────────────────
// LLM ANALYSIS
// Calls OpenAI to analyze container anomalies
// and generate remediation recommendations.
// Only triggered when a container has issues.
// ─────────────────────────────────────────────

const analysisCache = new Map();
// containerName → { ts, analysis } — cache for 5 min

async function analyzeWithLLM(containerName, issues) {
  if (!OPENAI_API_KEY) return null;

  // Don't re-analyze the same container within 5 minutes
  const cached = analysisCache.get(containerName);
  if (cached && Date.now() - cached.ts < 300000) return cached.analysis;

  try {
    const issueText = issues.map(i => `- ${i}`).join('\n');
    const prompt = `You are a DevOps security expert analyzing a containerized application.

Container: ${containerName}
Agent: ${AGENT_LABEL}
Issues detected:
${issueText}

Provide a concise remediation recommendation (2-3 sentences max). Be specific and actionable. Focus on what to do RIGHT NOW and what the likely root cause is. Do not repeat the issue description.`;

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 150,
        temperature: 0.3,
      },
      {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const analysis = response.data.choices[0]?.message?.content?.trim();
    if (analysis) {
      analysisCache.set(containerName, { ts: Date.now(), analysis });
      console.log(`[Agent] LLM analysis for ${containerName}: ${analysis.slice(0, 80)}...`);
    }
    return analysis || null;
  } catch (err) {
    console.error(`[Agent] LLM analysis failed for ${containerName}:`, err.message);
    return null;
  }
}

// ─────────────────────────────────────────────
// COLLECT METRICS
// ─────────────────────────────────────────────

async function collectMetrics() {
  const rawContainers = await docker.listContainers({ all: true });
  const containers = [];

  await Promise.all(rawContainers.map(async (c) => {
    const { image, tag } = parseImage(c.Image);
    let cpuPct = null, memPct = null, memUsageMb = null, memLimitMb = null;
    let networkRx = null, networkTx = null;

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
        memUsageMb = parseFloat((memUsage / 1024 / 1024).toFixed(1));
        memLimitMb = parseFloat((memLimit / 1024 / 1024).toFixed(1));

        const networks = stats.networks || {};
        networkRx = Object.values(networks).reduce((s, n) => s + (n.rx_bytes || 0), 0);
        networkTx = Object.values(networks).reduce((s, n) => s + (n.tx_bytes || 0), 0);
      } catch { /* stats unavailable */ }
    }

    containers.push({
      id: c.Id.slice(0, 12),
      name: (c.Names[0] || '').replace(/^\//, ''),
      image, tag,
      status: c.State,
      health: getHealth(c),
      cpuPct, memPct, memUsageMb, memLimitMb,
      networkRx, networkTx,
    });
  }));

  return containers;
}

// ─────────────────────────────────────────────
// DETECT ANOMALIES + GET LLM ANALYSIS
// Checks each container for issues and requests
// LLM remediation advice for problematic ones.
// ─────────────────────────────────────────────

async function analyzeAnomalies(containers) {
  const analyses = [];

  for (const c of containers) {
    const issues = [];

    // Track issues
    if (c.status === 'restarting') {
      recordIssue(c.name, 'restart', 1);
      const restartCount = getIssueCount(c.name, 'restart');
      issues.push(`Container is restarting (${restartCount} restart(s) in last 5 minutes)`);
    }
    if (c.status === 'exited' || c.status === 'dead') {
      recordIssue(c.name, 'crash', 1);
      const crashCount = getIssueCount(c.name, 'crash');
      issues.push(`Container has crashed/exited (${crashCount} time(s) in last 5 minutes)`);
    }
    if (c.cpuPct != null && c.cpuPct >= 90) {
      recordIssue(c.name, 'cpu', c.cpuPct);
      const cpuCount = getIssueCount(c.name, 'cpu');
      issues.push(`Critical CPU usage: ${c.cpuPct}% (sustained for ${cpuCount} report cycles)`);
    }
    if (c.memPct != null && c.memPct >= 90) {
      recordIssue(c.name, 'mem', c.memPct);
      const memCount = getIssueCount(c.name, 'mem');
      issues.push(`Critical memory usage: ${c.memPct}% of ${c.memLimitMb}MB (sustained for ${memCount} report cycles)`);
    }

    if (issues.length > 0) {
      const analysis = await analyzeWithLLM(c.name, issues);
      if (analysis) {
        analyses.push({
          containerName: c.name,
          issues,
          analysis,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  return analyses;
}

// ─────────────────────────────────────────────
// REPORT
// ─────────────────────────────────────────────

let consecutiveFailures = 0;

async function report() {
  try {
    const containers = await collectMetrics();
    const analyses = await analyzeAnomalies(containers);

    const payload = {
      agentId: AGENT_ID,
      agentLabel: AGENT_LABEL,
      timestamp: new Date().toISOString(),
      hostInfo: {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        totalMemMb: parseFloat((os.totalmem() / 1024 / 1024).toFixed(0)),
        freeMemMb: parseFloat((os.freemem() / 1024 / 1024).toFixed(0)),
        cpuCount: os.cpus().length,
        uptime: Math.round(os.uptime()),
      },
      containers,
      containerCount: containers.filter(c => c.status === 'running').length,
      analyses, // LLM remediation recommendations
    };

    await axios.post(`${BACKEND_URL}/api/agent/report`, payload, { timeout: 5000 });

    if (analyses.length > 0) {
      console.log(`[Agent] Reported ${analyses.length} LLM analysis/analyses`);
    }
    if (consecutiveFailures > 0) {
      console.log(`[Agent] Reconnected after ${consecutiveFailures} failure(s)`);
    }
    consecutiveFailures = 0;
  } catch (err) {
    consecutiveFailures++;
    console.error(`[Agent] Failed to report (attempt ${consecutiveFailures}): ${err.message}`);
    if (consecutiveFailures === 5) {
      console.error(`[Agent] Backend appears to be down. Retrying every ${REPORT_INTERVAL}ms`);
    }
  }
}

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

report();
setInterval(report, REPORT_INTERVAL);

process.on('SIGTERM', () => { console.log(`[Agent] ${AGENT_ID} shutting down`); process.exit(0); });
process.on('SIGINT',  () => { console.log(`[Agent] ${AGENT_ID} interrupted`);   process.exit(0); });