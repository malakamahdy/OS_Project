// firs thing we have need the imports for the agent 


const Docker = require('dockerode');
const axios = require('axios');
const os = require('os');


// the configuration will remain the same

const AGENT_ID = process.env.AGENT_ID || 'network-agent-1';
const AGENT_LABEL = process.env.AGENT_LABEL || 'Network Intrusion Detector';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3002';
const REPORT_INTERVAL = parseInt(process.env.REPORT_INTERVAL || '10000');


// the connection is also the same as the other agents 


const docker = new Docker({
  socketPath: process.env.DOCKER_SOCKET ||
    (process.platform === 'darwin'
      ? `${process.env.HOME}/.docker/run/docker.sock`
      : '/var/run/docker.sock')
});

console.log(`[Network Agent] Starting: ${AGENT_ID} (${AGENT_LABEL})`);
console.log(`[Network Agent] Reporting to: ${BACKEND_URL}`);
console.log(`[Network Agent] Interval: ${REPORT_INTERVAL}ms`);



// this are the ports that we want to be aware of. they key data that we dont want to reveal 


const DANGEROUS_PORTS ={ 


22 : 'SSH', 
23 : 'telnet',
3306 : 'MySQL',
5432 : 'PostgresSQL',
27017 : 'MongoDB',
6379 : 'Redis',
9200 : 'Elasticsearch',
2375 : 'Docker API ',

}; 



async function collectNetworkThreats() { 

// the first thing we need to do is we need to get the containers from the docker 

const container = await docker.listContainers({all : false}); // we make sure that we only get the ones that are on  

const threats = [] // we are going to keep track on the threats we see 


// we need a for loop to over the container we just called 


    for (const con of container) {  

    // lets firs clean the container, becasue we are going to get them like this: 

    // "/nginx-proxy" 

    // so let clean it 


        const name = con.Names[0].replace(/^\//, '' ); 

        const ports = con.Ports || []   // if we get an empty port we will return some brackets instead so that the code doesnt crash 


    
    // the firs thing that we need to aware is of the port 

    // (0.0.0.0) 

    // right now in ports we would have something like this : 


    // ports = [
 
  // { IP: '127.0.0.1', port: 80  },  
  // { IP: '0.0.0.0',   port: 3306 },  
  // { IP: '127.0.0.1', port: 443  },  
  // { IP: '0.0.0.0',   port: 27017 }, 
// ]



// we want to create a filter for the pors that have the ip as 0.0.0.0 

// threats 1 -- 0.0.0.0


        for (let i = 0; i < ports.length; i++){
            if (ports[i].IP === '0.0.0.0'){

            threats.push({ 
            
            containerId: con.Id,
            containerName: name,
            threat: 'This specific IP is exposed to all network interfaces',
            detail:`Port ${ports[i].PublicPort} is open to 0.0.0.0`,
            severity : 'high'}); 


        }
        
    }





// threat 2 - specific dangerous ports 

// lets check the current port with the dangerous ports 


        for (let i = 0; i < ports.length; i++){

            if( DANGEROUS_PORTS[ports[i].PublicPort]){ 

                threats.push({

                containerId: con.Id,
                containerName: name, 
                threat: 'this specific port is consider dangerous' ,
                detail: `Port ${ports[i].PublicPort} (${DANGEROUS_PORTS[ports[i].PublicPort]}) is dangerous`,
                severity: 'critical'


                });

           
            }

        }





// threat 3 ----------------- 

// we need to handle the case in which we have to many ports 


        if (ports.length > 5){


        threats.push({

                containerId: con.Id,
                containerName: name, 
                threat: 'Excessive port exposure' ,
                detail: `Container has ${ports.length} open ports — reduces attack surface by limiting exposed ports`,
                severity: 'medium'

        });

    }


    } 

    return threats 

} 





// ─────────────────────────────────────────────
let consecutiveFailures = 0;
let lastThreatSummary = '';
async function report() {
  try {
    const threats = await collectNetworkThreats();

    // build the payload — same structure as agent.js
    // but with threats field instead of container metrics
    const payload = {
      agentId:      AGENT_ID,
      agentLabel:   AGENT_LABEL,
      agentType:    'network',         // ← tells server this is special
      timestamp:    new Date().toISOString(),
      threats:      threats,           // ← security findings
      containers:   [],                // ← not our job
      containerCount: 0,
      hostInfo: {
        hostname:   os.hostname(),
        platform:   os.platform(),
        arch:       os.arch(),
        totalMemMb: parseFloat((os.totalmem() / 1024 / 1024).toFixed(0)),
        freeMemMb:  parseFloat((os.freemem() / 1024 / 1024).toFixed(0)),
        cpuCount:   os.cpus().length,
        uptime:     Math.round(os.uptime()),
      },
    };

    await axios.post(`${BACKEND_URL}/api/agent/report`, payload, {
      timeout: 5000,
    });

    // log what we found so you can see it in terminal
    const threatSummary = threats.map(t => t.containerName + t.threat).join(',');
    if (threatSummary !== lastThreatSummary) {
      lastThreatSummary = threatSummary;
      if (threats.length > 0) {
        console.log(`[Network Agent] ⚠ Found ${threats.length} threat(s):`);
        threats.forEach(t => console.log(`  [${t.severity.toUpperCase()}] ${t.containerName}: ${t.threat}`));
      } else {
        console.log(`[Network Agent] ✓ No threats detected`);
      }
    }

    if (consecutiveFailures > 0) {
      console.log(`[Network Agent] Reconnected after ${consecutiveFailures} failure(s)`);
    }
    consecutiveFailures = 0;

  } catch (err) {
    consecutiveFailures++;
    console.error(`[Network Agent] Failed to report (attempt ${consecutiveFailures}): ${err.message}`);

    if (consecutiveFailures === 5) {
      console.error(`[Network Agent] Backend appears to be down. Retrying every ${REPORT_INTERVAL}ms`);
    }
  }
}


//— same pattern as agent.js

report();
setInterval(report, REPORT_INTERVAL);

process.on('SIGTERM', () => {
  console.log(`[Network Agent] ${AGENT_ID} shutting down`);
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log(`[Network Agent] ${AGENT_ID} interrupted`);
  process.exit(0);
});



