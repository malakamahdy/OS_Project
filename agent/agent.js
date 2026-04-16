const Docker = require('dockerode'); // we want to kepe docker as constant because we dont want to overwrite the tool that talks to docker
const axios = require('axios');  // same with axios, which is in charge of POST to the Backend
const os = require('os'); 

// ─────────────────────────────────────────────
// AGENT CONFIG
// These are set via environment variables in
// docker-compose.yml so each agent is unique.
// ─────────────────────────────────────────────



// the reason here why we want give the agents that second option is becasue if it where the case that a user runs agent.js 
// and they dont have the docker-compose, then we would set the default variables right here. is a safe measure. 


const AGENT_ID      = process.env.AGENT_ID || `agent-${os.hostname()}`;  //
const AGENT_LABEL   = process.env.AGENT_LABEL || os.hostname();
const BACKEND_URL   = process.env.BACKEND_URL || 'http://localhost:3002';
const REPORT_INTERVAL = parseInt(process.env.REPORT_INTERVAL || '10000'); // 

const docker = new Docker({                 // stablishing that connection between the agents.js and the docker engine
  socketPath: process.env.DOCKER_SOCKET ||
    (process.platform === 'darwin'                    // here we are checking depending on what kind of linux is the user running this, they are different paths for differens OS's
      ? `${process.env.HOME}/.docker/run/docker.sock`
      : '/var/run/docker.sock')
});

console.log(`[Agent] Starting: ${AGENT_ID} (${AGENT_LABEL})`);
console.log(`[Agent] Reporting to: ${BACKEND_URL}`);
console.log(`[Agent] Interval: ${REPORT_INTERVAL}ms`);            // here we are describing to the user what is happening, which is: 



// starting agent - 1 (host primary) 

// reporting to : https:// backend: 3002

// interval : 10000ms -> 10 seconds 

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// this part is checking if each container is runnin well or not 



function getHealth(container) {
  const state = container.State;
  
  
// possibles values for state are:  

// running, exited, dead, paused, restarting 



  const status = container.Status || '';

// posible values for status are: 


// up 2 hours (unhealthy) 
// up 3 minutes (healthy)
//exited (1) 5 minutes ago 



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



// will give us a detail sumarry of the agents are running and if they are healthy: 

// depending on the status of each container we will get diffferent asnwers: 

// crit -> something is wrong 


// warn -> something could potentially go wronh 


// ok -> everything is runnning fine 








// ─────────────────────────────────────────────
// COLLECT METRICS
// Gathers container stats from Docker API
// ─────────────────────────────────────────────

async function collectMetrics() {
  const rawContainers = await docker.listContainers({ all: true });
  const containers = [];

  // Run stats collection concurrently — this is the distributed part:
  // each agent collects its own host's metrics in parallel
  await Promise.all(rawContainers.map(async (c) => {
    const { image, tag } = parseImage(c.Image);
    let cpuPct = null;
    let memPct = null;
    let memUsageMb = null;
    let memLimitMb = null;
    let networkRx = null;
    let networkTx = null;

    if (c.State === 'running') {  // if the container are running we will get a summary of the CPU, Memory, Network I/O
      try {
        const container = docker.getContainer(c.Id);
        const stats = await container.stats({ stream: false });

        // CPU
        const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
        const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
        const numCpus = stats.cpu_stats.online_cpus || 1;
        cpuPct = parseFloat(((cpuDelta / systemDelta) * numCpus * 100).toFixed(1));

        // Memory
        const memUsage = stats.memory_stats.usage || 0;
        const memLimit = stats.memory_stats.limit || 1;
        memPct = parseFloat(((memUsage / memLimit) * 100).toFixed(1));
        memUsageMb = parseFloat((memUsage / 1024 / 1024).toFixed(1));
        memLimitMb = parseFloat((memLimit / 1024 / 1024).toFixed(1));

        // Network I/O
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
      cpuPct,
      memPct,
      memUsageMb,
      memLimitMb,
      networkRx,
      networkTx,
    });
  }));

  return containers;
}

// ─────────────────────────────────────────────
// REPORT TO BACKEND
// Sends a heartbeat + metrics payload to the
// central backend. If backend is unreachable,
// logs the error and retries next interval.
// ─────────────────────────────────────────────

let consecutiveFailures = 0;

async function report() {
  try {
    const containers = await collectMetrics();


    // the payload will give us the summry of: 

    // - who is the agent, what machine is it on? 

    // how much memory does the whole machine have? 

    // etc 

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
    };

    await axios.post(`${BACKEND_URL}/api/agent/report`, payload, {
      timeout: 5000,
    });

    if (consecutiveFailures > 0) {
      console.log(`[Agent] Reconnected to backend after ${consecutiveFailures} failure(s)`);
    }
    consecutiveFailures = 0;

  } catch (err) {
    consecutiveFailures++;
    console.error(`[Agent] Failed to report (attempt ${consecutiveFailures}): ${err.message}`);

    // After 5 consecutive failures, log a more serious warning
    if (consecutiveFailures === 5) {
      console.error(`[Agent] Backend appears to be down. Will keep retrying every ${REPORT_INTERVAL}ms`);
    }
  }
}

// ─────────────────────────────────────────────
// START
// ─────────────────────────────────────────────

// Report immediately on start, then on interval
report();
setInterval(report, REPORT_INTERVAL);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[Agent] ${AGENT_ID} shutting down gracefully`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`[Agent] ${AGENT_ID} interrupted`);
  process.exit(0);
});
