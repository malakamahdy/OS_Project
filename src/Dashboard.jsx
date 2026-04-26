import { useState, useEffect, useRef } from "react";
import {
  Shield, Activity, AlertTriangle, CheckCircle,
  Search, Bell, Download, Play, Settings, Users, FileText,
  Lock, BarChart2, Box, Clock, Cpu, Database,
  XCircle, AlertCircle, Info, Layers, Terminal,
  List, ChevronLeft, Wifi, WifiOff, Network, Sun, Moon,
  ChevronDown, ClipboardList, User
} from "lucide-react";

// ─────────────────────────────────────────────
// SOCKET.IO — real-time connection to backend
// ─────────────────────────────────────────────

function useSocket() {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const pendingListeners = useRef({});

  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.socket.io/4.7.2/socket.io.min.js';
    script.onload = () => {
      const socket = window.io('http://localhost:3002');
      socketRef.current = socket;
      socket.on('connect', () => { setConnected(true); console.log('[Socket] Connected'); });
      socket.on('disconnect', () => { setConnected(false); console.log('[Socket] Disconnected'); });
      Object.entries(pendingListeners.current).forEach(([ev, cb]) => socket.on(ev, cb));
    };
    document.head.appendChild(script);
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      if (document.head.contains(script)) document.head.removeChild(script);
    };
  }, []);

  const on = (event, cb) => {
    pendingListeners.current[event] = cb;
    if (socketRef.current) socketRef.current.on(event, cb);
  };

  return { connected, on };
}

// ─────────────────────────────────────────────
// DATA HOOKS
// ─────────────────────────────────────────────

function useContainers(socket) {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('http://localhost:3002/api/containers')
      .then(res => res.json())
      .then(data => { setContainers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
    socket.on('containers:update', data => { setContainers(Array.isArray(data) ? data : []); setLoading(false); });
    const interval = setInterval(() => {
      fetch('http://localhost:3002/api/containers').then(r => r.json()).then(d => setContainers(Array.isArray(d) ? d : [])).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);
  return { containers, loading, error: null };
}

function useAgents(socket) {
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('http://localhost:3002/api/agents')
      .then(res => res.json())
      .then(data => { setAgents(data); setLoading(false); })
      .catch(() => setLoading(false));
    socket.on('agents:update', data => { setAgents(data); setLoading(false); });
    const interval = setInterval(() => {
      fetch('http://localhost:3002/api/agents').then(r => r.json()).then(setAgents).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);
  return { agents, loading };
}

function useAlerts(socket) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = () => {
    fetch('http://localhost:3002/api/alerts')
      .then(res => res.json())
      .then(data => { setAlerts(data); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => {
    load();
    socket.on('alerts:update', data => { setAlerts(data); setLoading(false); });
  }, []);
  const acknowledge = (id) => fetch(`http://localhost:3002/api/alerts/${id}/acknowledge`, { method: 'POST' }).then(load);
  const acknowledgeAll = () => fetch('http://localhost:3002/api/alerts/acknowledge-all', { method: 'POST' }).then(load);
  return { alerts, loading, error: null, acknowledge, acknowledgeAll };
}

function useNetworkThreats(socket) {
  const [threats, setThreats] = useState([]);
  useEffect(() => {
    fetch('http://localhost:3002/api/alerts')
      .then(res => res.json())
      .then(data => setThreats(data.filter(a => a.source?.startsWith('network-agent:'))))
      .catch(() => {});
    socket.on('alerts:update', data => {
      setThreats(data.filter(a => a.source?.startsWith('network-agent:')));
    });
  }, []);
  return { threats };
}

function useVulnerabilities() {
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('http://localhost:3002/api/vulnerabilities')
      .then(res => res.json())
      .then(data => { setVulnerabilities(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  return { vulnerabilities, loading, error: null };
}

function useCompliance() {
  const [compliance, setCompliance] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = () => fetch('http://localhost:3002/api/compliance').then(r => r.json()).then(d => { setCompliance(d.results || []); setLoading(false); }).catch(() => setLoading(false));
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, []);
  return { compliance, loading, error: null };
}

function useStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = () => fetch('http://localhost:3002/api/stats').then(r => r.json()).then(d => { setStats(d); setLoading(false); }).catch(() => setLoading(false));
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);
  return { stats, loading, error: null };
}

function useScanHistory() { return { scans: [], loading: false, error: null }; }

function useSecrets() {
  const [secrets, setSecrets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);

  const scan = () => {
    setLoading(true);
    fetch('http://localhost:3002/api/secrets')
      .then(res => res.json())
      .then(data => { setSecrets(Array.isArray(data) ? data : []); setLoading(false); setScanned(true); })
      .catch(() => { setLoading(false); setScanned(true); });
  };

  return { secrets, loading, scanned, scan };
}

function useAudit(socket) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    fetch('http://localhost:3002/api/audit')
      .then(res => res.json())
      .then(data => { setEvents(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // Refresh audit log whenever alerts update (new events may have been logged)
    socket.on('alerts:update', () => load());
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return { events, loading };
}

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────

const DARK = {
  bg:         "#050709",
  surface:    "#0d1117",
  surface2:   "#161b22",
  border:     "#21303f",
  border2:    "#2d4256",
  cyan:       "#38bdf8",
  red:        "#fb7185",
  green:      "#34d399",
  amber:      "#fbbf24",
  text:       "#e2e8f0",
  textDim:    "#7c93ad",
  textBright: "#f8fafc",
};

const LIGHT = {
  bg:         "#faf6ef",
  surface:    "#fffdf8",
  surface2:   "#f5f0e5",
  border:     "#e8dfc8",
  border2:    "#d4c9b0",
  cyan:       "#5b8fa8",
  red:        "#c0392b",
  green:      "#2e7d5e",
  amber:      "#b5770d",
  text:       "#4a3f33",
  textDim:    "#9a8870",
  textBright: "#2a2018",
};

let C = DARK;

function getTheme(dark) {
  return dark ? DARK : LIGHT;
}

function applyTheme(dark) {
  C = getTheme(dark);
  TH = getTH();
  TD = getTD();
}

const mono = "'JetBrains Mono', 'Fira Code', monospace";
const sans = "'DM Sans', sans-serif";

const SEV = {
  critical: { bg: "rgba(251,113,133,0.15)", color: "#fb7185", border: "rgba(251,113,133,0.35)", label: "CRITICAL" },
  high:     { bg: "rgba(251,191,36,0.15)",  color: "#fbbf24", border: "rgba(251,191,36,0.35)",  label: "HIGH" },
  medium:   { bg: "rgba(56,189,248,0.12)",  color: "#38bdf8", border: "rgba(56,189,248,0.3)",   label: "MEDIUM" },
  low:      { bg: "rgba(52,211,153,0.12)",  color: "#34d399", border: "rgba(52,211,153,0.3)",   label: "LOW" },
};

const STAT_STATUS = {
  open:     { color: "#fb7185" },
  patching: { color: "#fbbf24" },
  fixed:    { color: "#34d399" },
};

const HEALTH_COLOR = { ok: "#34d399", warn: "#fbbf24", crit: "#fb7185" };
const ALERT_COLOR  = { critical: "#fb7185", warning: "#fbbf24", info: "#38bdf8" };
const ALERT_ICON   = { critical: XCircle, warning: AlertCircle, info: Info };

// ─────────────────────────────────────────────
// PRIMITIVES
// ─────────────────────────────────────────────

function Mono({ children, color, size = 11, style }) {
  return <span style={{ fontFamily: mono, fontSize: size, color: color || C.textDim, ...style }}>{children}</span>;
}

function Label({ children }) {
  return <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: C.textDim, marginBottom: 10 }}>{children}</div>;
}

function SeverityBadge({ severity }) {
  const s = SEV[severity?.toLowerCase()] || SEV.low;
  return (
    <span style={{ display: "inline-block", fontFamily: mono, fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, letterSpacing: "0.12em", background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

function StatusPill({ status }) {
  const s = STAT_STATUS[status?.toLowerCase()] || {};
  return (
    <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 600, padding: "3px 9px", borderRadius: 20, letterSpacing: "0.1em", background: "rgba(255,255,255,0.06)", color: s.color || C.textDim, border: `1px solid ${s.color ? s.color + "44" : C.border}`, textTransform: "uppercase" }}>
      {status || "—"}
    </span>
  );
}

function HealthDot({ health }) {
  const color = HEALTH_COLOR[health] || C.textDim;
  return <span style={{ width: 8, height: 8, borderRadius: "50%", display: "inline-block", flexShrink: 0, background: color, boxShadow: `0 0 8px ${color}` }} />;
}

function Sparkline({ data, color, width = 80, height = 28 }) {
  if (!data || data.length < 2) {
    return <svg width={width} height={height}><line x1="0" y1={height/2} x2={width} y2={height/2} stroke={C.border2} strokeWidth="1" strokeDasharray="3 2"/></svg>;
  }
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(' ');
  const fillPts = `0,${height} ${pts} ${width},${height}`;
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`sg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={fillPts} fill={`url(#sg-${color.replace('#','')})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

function EmptyState({ icon: Icon, message }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", gap: 12 }}>
      <Icon size={24} color={C.border2} strokeWidth={1} />
      <Mono size={9} color={C.textDim}>{message}</Mono>
    </div>
  );
}

function Loading() {
  return <div style={{ padding: "24px 20px", textAlign: "center" }}><Mono size={10} color={C.textDim}>LOADING…</Mono></div>;
}

function Panel({ title, icon: Icon, action, onAction, children, style }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden", ...style }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.textBright }}>
          {Icon && <Icon size={14} color={C.textDim} strokeWidth={1.5} />}
          {title}
        </div>
        {action && (
          <button onClick={onAction} style={{ fontFamily: mono, fontSize: 9, color: C.cyan, letterSpacing: "0.1em", background: "rgba(56,189,248,0.08)", border: `1px solid rgba(56,189,248,0.25)`, padding: "4px 11px", borderRadius: 3, cursor: "pointer" }}>
            {action}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, accent, icon: Icon }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "22px 20px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div style={{ position: "absolute", bottom: -8, right: -8, opacity: 0.06 }}><Icon size={72} strokeWidth={1} color={accent} /></div>
      <Label>{label}</Label>
      <div style={{ fontSize: 36, fontWeight: 700, fontFamily: mono, color: accent, lineHeight: 1, marginBottom: 4 }}>{value ?? "—"}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TABLE
// ─────────────────────────────────────────────

const getTH = () => ({ fontFamily: mono, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: C.textDim, textAlign: "left", padding: "10px 18px", borderBottom: `1px solid ${C.border}`, fontWeight: 400, background: C.surface2 });
const getTD = () => ({ padding: "12px 18px", fontSize: 12, borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" });
// Keep TH/TD as aliases for backward compat — components that use them inline will pick up current C
let TH = getTH();
let TD = getTD();

function VulnTable({ rows }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={TH}>CVE ID</th>
            <th style={TH}>Container</th>
            <th style={TH}>Package</th>
            <th style={TH}>Severity</th>
            <th style={TH}>CVSS</th>
            <th style={TH}>Status</th>
            <th style={TH}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(v => {
            const isOpen = expanded === v.id;
            return (
              <>
                <tr key={v.id}
                  style={{ cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = isOpen ? C.surface2 : "transparent"}
                  onClick={() => setExpanded(isOpen ? null : v.id)}>
                  <td style={TD}><Mono size={11} color={C.cyan}>{v.cveId}</Mono></td>
                  <td style={TD}><Mono size={11} color={C.textBright}>{v.container}</Mono></td>
                  <td style={TD}><span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{v.package} <span style={{ color: C.textDim }}>{v.version}</span></span></td>
                  <td style={TD}><SeverityBadge severity={v.severity} /></td>
                  <td style={TD}><Mono size={11} color={C.amber}>{v.cvss ?? "—"}</Mono></td>
                  <td style={TD}><StatusPill status={v.status} /></td>
                  <td style={TD}><Mono size={10} color={C.textDim}>{isOpen ? "▲" : "▼"}</Mono></td>
                </tr>
                {isOpen && (
                  <tr key={`${v.id}-detail`}>
                    <td colSpan={7} style={{ padding: 0, background: C.surface2, borderBottom: `1px solid ${C.border}` }}>
                      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

                        {/* CVE header */}
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <Mono size={13} color={C.cyan} style={{ fontWeight: 700 }}>{v.cveId}</Mono>
                          <SeverityBadge severity={v.severity} />
                          {v.cvss && <span style={{ fontFamily: mono, fontSize: 11, color: C.amber }}>CVSS {v.cvss}</span>}
                          {v.fixedVersion && <span style={{ fontFamily: mono, fontSize: 10, color: C.green, background: "rgba(52,211,153,0.1)", border: `1px solid ${C.green}44`, padding: "2px 8px", borderRadius: 3 }}>FIX AVAILABLE: {v.fixedVersion}</span>}
                          {!v.fixedVersion && <span style={{ fontFamily: mono, fontSize: 10, color: C.red, background: "rgba(251,113,133,0.1)", border: `1px solid ${C.red}44`, padding: "2px 8px", borderRadius: 3 }}>NO FIX AVAILABLE</span>}
                        </div>

                        {/* Details grid */}
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
                          <div>
                            <Mono size={9} color={C.textDim}>PACKAGE</Mono>
                            <div style={{ fontFamily: mono, fontSize: 12, color: C.textBright, marginTop: 3 }}>{v.package}</div>
                          </div>
                          <div>
                            <Mono size={9} color={C.textDim}>INSTALLED VERSION</Mono>
                            <div style={{ fontFamily: mono, fontSize: 12, color: C.textBright, marginTop: 3 }}>{v.version}</div>
                          </div>
                          <div>
                            <Mono size={9} color={C.textDim}>FIXED VERSION</Mono>
                            <div style={{ fontFamily: mono, fontSize: 12, color: v.fixedVersion ? C.green : C.textDim, marginTop: 3 }}>{v.fixedVersion || "None"}</div>
                          </div>
                          <div>
                            <Mono size={9} color={C.textDim}>IMAGE</Mono>
                            <div style={{ fontFamily: mono, fontSize: 12, color: C.textBright, marginTop: 3 }}>{v.image || v.container}</div>
                          </div>
                          <div>
                            <Mono size={9} color={C.textDim}>TARGET</Mono>
                            <div style={{ fontFamily: mono, fontSize: 12, color: C.textBright, marginTop: 3 }}>{v.target || "—"}</div>
                          </div>
                          <div>
                            <Mono size={9} color={C.textDim}>PUBLISHED</Mono>
                            <div style={{ fontFamily: mono, fontSize: 12, color: C.textBright, marginTop: 3 }}>{v.publishedDate ? new Date(v.publishedDate).toLocaleDateString() : "—"}</div>
                          </div>
                        </div>

                        {/* Description */}
                        {v.description && (
                          <div>
                            <Mono size={9} color={C.textDim} style={{ marginBottom: 6 }}>DESCRIPTION</Mono>
                            <div style={{ fontFamily: sans, fontSize: 12, color: C.text, lineHeight: 1.6, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 6, padding: "12px 14px" }}>
                              {v.description}
                            </div>
                          </div>
                        )}

                        {/* References */}
                        {v.references && v.references.length > 0 && (
                          <div>
                            <Mono size={9} color={C.textDim} style={{ marginBottom: 6 }}>REFERENCES</Mono>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {v.references.slice(0, 5).map((ref, i) => (
                                <a key={i} href={ref} target="_blank" rel="noopener noreferrer" style={{ fontFamily: mono, fontSize: 10, color: C.cyan, textDecoration: "none", wordBreak: "break-all" }}
                                  onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"}
                                  onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                                  {ref}
                                </a>
                              ))}
                              {v.references.length > 5 && <Mono size={9} color={C.textDim}>+{v.references.length - 5} more references</Mono>}
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROLES
// ─────────────────────────────────────────────

const ROLES = {
  admin: {
    id: 'admin',
    label: 'Security Admin',
    color: '#fb7185',
    description: 'Full access — threat response, platform control, configuration',
    nav: ['dashboard', 'monitor', 'vulns', 'alerts', 'secrets', 'compliance', 'reports', 'audit', 'config', 'team', 'tasks'],
    tasks: [
      { id: 1, label: 'Review all active critical alerts in the Alerts page',          done: false, priority: 'critical', nav: 'alerts'     },
      { id: 2, label: 'Run vulnerability scan and triage critical CVEs',               done: false, priority: 'critical', nav: 'vulns'      },
      { id: 3, label: 'Run secrets scan on all container images',                      done: false, priority: 'high',     nav: 'secrets'    },
      { id: 4, label: 'Check CIS Docker Benchmark compliance score',                  done: false, priority: 'high',     nav: 'compliance' },
      { id: 5, label: 'Review network intrusion threats from agent-3',                done: false, priority: 'high',     nav: 'dashboard'  },
      { id: 6, label: 'Verify all 3 monitoring agents are online in Live Monitor',    done: false, priority: 'medium',   nav: 'monitor'    },
      { id: 7, label: 'Review audit log for any unauthorized actions',               done: false, priority: 'medium',   nav: 'audit'      },
      { id: 8, label: 'Update CPU/memory alert thresholds in Config if needed',      done: false, priority: 'low',      nav: 'config'     },
      { id: 9, label: 'Export security report PDF for stakeholders',                 done: false, priority: 'low',      nav: 'reports'    },
    ],
  },
  analyst: {
    id: 'analyst',
    label: 'Compliance Analyst',
    color: '#38bdf8',
    description: 'Compliance review, audit access, reporting — read-only on runtime',
    nav: ['dashboard', 'vulns', 'compliance', 'reports', 'audit', 'team', 'tasks'],
    tasks: [
      { id: 1, label: 'Open Compliance page and review CIS benchmark findings',      done: false, priority: 'critical', nav: 'compliance' },
      { id: 2, label: 'Identify and document all FAIL checks in CIS categories',     done: false, priority: 'high',     nav: 'compliance' },
      { id: 3, label: 'Check vulnerability scanner for new critical CVEs',           done: false, priority: 'high',     nav: 'vulns'      },
      { id: 4, label: 'Filter vulnerabilities by Critical and High severity',        done: false, priority: 'high',     nav: 'vulns'      },
      { id: 5, label: 'Review audit log for compliance scan history',               done: false, priority: 'medium',   nav: 'audit'      },
      { id: 6, label: 'Check Reports page for overall security posture summary',    done: false, priority: 'medium',   nav: 'reports'    },
      { id: 7, label: 'Export PDF report for compliance evidence collection',       done: false, priority: 'medium',   nav: 'reports'    },
      { id: 8, label: 'Review team roles and incident ownership assignments',       done: false, priority: 'low',      nav: 'team'       },
    ],
  },
  devops: {
    id: 'devops',
    label: 'DevOps Engineer',
    color: '#34d399',
    description: 'Container uptime, runtime diagnostics, deployment stability',
    nav: ['dashboard', 'monitor', 'alerts', 'team', 'tasks'],
    tasks: [
      { id: 1, label: 'Open Live Monitor and verify all containers are healthy',     done: false, priority: 'critical', nav: 'monitor'    },
      { id: 2, label: 'Check all 3 monitoring agents are ONLINE in agents panel',   done: false, priority: 'critical', nav: 'monitor'    },
      { id: 3, label: 'Restart any containers showing CRIT health status',          done: false, priority: 'critical', nav: 'monitor'    },
      { id: 4, label: 'Review active alerts for CPU and memory threshold alerts',   done: false, priority: 'high',     nav: 'alerts'     },
      { id: 5, label: 'Dismiss resolved alerts and clear false positives',          done: false, priority: 'high',     nav: 'alerts'     },
      { id: 6, label: 'Check dashboard for network threats from intrusion agent',   done: false, priority: 'medium',   nav: 'dashboard'  },
      { id: 7, label: 'Confirm demo containers are running via Live Monitor',       done: false, priority: 'low',      nav: 'monitor'    },
    ],
  },
};

// ─────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [hovering, setHovering] = useState(null);
  const [loginDark, setLoginDark] = useState(true);
  const bg = loginDark ? DARK : LIGHT;

  return (
    <div style={{ minHeight: "100vh", background: bg.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: sans, padding: 24, position: "relative", overflow: "hidden" }}>
      <style>{`
        @keyframes float-1 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-18px) rotate(3deg)} }
        @keyframes float-2 { 0%,100%{transform:translateY(0) rotate(0deg)} 50%{transform:translateY(-12px) rotate(-2deg)} }
        @keyframes float-3 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-22px)} }
        @keyframes pulse-glow { 0%,100%{box-shadow:0 0 20px ${DARK.cyan}33} 50%{box-shadow:0 0 40px ${DARK.cyan}66} }
        @keyframes shimmer { 0%{opacity:0.03} 50%{opacity:0.07} 100%{opacity:0.03} }
      `}</style>

      {/* Animated background blobs */}
      <div style={{ position: "absolute", width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle, ${DARK.cyan}08, transparent 70%)`, top: -100, left: -100, animation: "float-1 8s ease-in-out infinite" }} />
      <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: `radial-gradient(circle, #7c3aed08, transparent 70%)`, bottom: -80, right: -60, animation: "float-2 10s ease-in-out infinite" }} />
      <div style={{ position: "absolute", width: 200, height: 200, borderRadius: "50%", background: `radial-gradient(circle, ${DARK.green}06, transparent 70%)`, top: "40%", right: "10%", animation: "float-3 7s ease-in-out infinite" }} />

      {/* Theme toggle */}
      <button onClick={() => setLoginDark(d => !d)}
        style={{ position: "absolute", top: 24, right: 24, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${bg.border2}`, borderRadius: 8, cursor: "pointer", background: "transparent", zIndex: 10 }}>
        {loginDark ? <Sun size={15} color={DARK.amber} strokeWidth={1.5} /> : <Moon size={15} color={LIGHT.cyan} strokeWidth={1.5} />}
      </button>

      {/* Header */}
      <div style={{ marginBottom: 48, textAlign: "center", position: "relative", zIndex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, background: `${DARK.cyan}15`, border: `1.5px solid ${DARK.cyan}55`, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", animation: "pulse-glow 3s ease-in-out infinite" }}>
            <Shield size={28} color={DARK.cyan} strokeWidth={1.5} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontSize: 30, fontWeight: 700, color: bg.textBright, letterSpacing: "-0.02em" }}>ContainerShield</div>
            <div style={{ fontFamily: mono, fontSize: 10, color: bg.textDim, letterSpacing: "0.18em" }}>DISTRIBUTED SECURITY PLATFORM</div>
          </div>
        </div>
        <div style={{ fontFamily: sans, fontSize: 15, color: bg.textDim, fontWeight: 400 }}>Select your role to access your personalized dashboard</div>
      </div>

      {/* Role cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, maxWidth: 800, width: "100%", position: "relative", zIndex: 1 }}>
        {Object.values(ROLES).map(role => (
          <div key={role.id}
            onClick={() => onLogin(role.id)}
            onMouseEnter={() => setHovering(role.id)}
            onMouseLeave={() => setHovering(null)}
            style={{ background: hovering === role.id ? `${bg.surface2}` : bg.surface, border: `1.5px solid ${hovering === role.id ? role.color + 'aa' : bg.border}`, borderRadius: 14, padding: "28px 24px", cursor: "pointer", transition: "all 0.18s", position: "relative", overflow: "hidden", transform: hovering === role.id ? "translateY(-4px)" : "translateY(0)", boxShadow: hovering === role.id ? `0 12px 32px ${role.color}22` : "none" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${role.color}, ${role.color}44)`, opacity: hovering === role.id ? 1 : 0.5, transition: "opacity 0.18s" }} />
            <div style={{ position: "absolute", bottom: -20, right: -20, width: 80, height: 80, borderRadius: "50%", background: `${role.color}08`, animation: "shimmer 3s ease-in-out infinite" }} />

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: `${role.color}18`, border: `1.5px solid ${role.color}55`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.18s", boxShadow: hovering === role.id ? `0 0 16px ${role.color}44` : "none" }}>
                <User size={18} color={role.color} strokeWidth={1.5} />
              </div>
              <div>
                <div style={{ fontFamily: sans, fontSize: 15, fontWeight: 700, color: bg.textBright }}>{role.label}</div>
                <span style={{ fontFamily: mono, fontSize: 8, padding: "2px 7px", borderRadius: 3, background: `${role.color}18`, color: role.color, border: `1px solid ${role.color}44`, letterSpacing: "0.1em" }}>
                  {role.id.toUpperCase()}
                </span>
              </div>
            </div>

            <div style={{ fontFamily: sans, fontSize: 12, color: bg.textDim, lineHeight: 1.7, marginBottom: 18 }}>{role.description}</div>

            <div style={{ borderTop: `1px solid ${bg.border}`, paddingTop: 14 }}>
              <div style={{ fontFamily: mono, fontSize: 8, color: bg.textDim, letterSpacing: "0.12em", marginBottom: 8 }}>PAGE ACCESS</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {role.nav.filter(n => n !== 'tasks').map(n => (
                  <span key={n} style={{ fontFamily: mono, fontSize: 8, padding: "2px 7px", borderRadius: 3, background: bg.surface2, color: bg.textDim, border: `1px solid ${bg.border}` }}>
                    {n.toUpperCase()}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "8px", borderRadius: 6, background: `${role.color}${hovering === role.id ? '22' : '10'}`, transition: "all 0.18s" }}>
              <span style={{ fontFamily: mono, fontSize: 10, color: role.color, fontWeight: 700, letterSpacing: "0.08em" }}>ENTER AS {role.id.toUpperCase()}</span>
              <ChevronDown size={11} color={role.color} style={{ transform: "rotate(-90deg)" }} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 40, fontFamily: mono, fontSize: 9, color: bg.textDim, letterSpacing: "0.12em", position: "relative", zIndex: 1 }}>
        CONTAINERSHIELD · ROLE-BASED ACCESS CONTROL DEMO
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────

const NAV_ALL = [
  { section: "Monitor", items: [
    { key: "dashboard",  label: "Dashboard",    Icon: Layers },
    { key: "monitor",    label: "Live Monitor", Icon: Activity },
  ]},
  { section: "Security", items: [
    { key: "vulns",      label: "Vuln Scanner", Icon: Search },
    { key: "alerts",     label: "Alerts",       Icon: Bell },
    { key: "secrets",    label: "Secrets Scan", Icon: Lock },
  ]},
  { section: "Compliance", items: [
    { key: "compliance", label: "Compliance",   Icon: CheckCircle },
    { key: "reports",    label: "Reports",      Icon: FileText },
    { key: "audit",      label: "Audit Log",    Icon: List },
  ]},
  { section: "System", items: [
    { key: "tasks",      label: "My Tasks",     Icon: ClipboardList },
    { key: "config",     label: "Config",       Icon: Settings },
    { key: "team",       label: "Team",         Icon: Users },
  ]},
];

function Sidebar({ active, onNav, role }) {
  const allowedNav = ROLES[role]?.nav || [];
  const nav = NAV_ALL.map(section => ({
    ...section,
    items: section.items.filter(item => allowedNav.includes(item.key)),
  })).filter(section => section.items.length > 0);

  return (
    <aside style={{ width: 224, minHeight: "100vh", background: C.surface, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", position: "sticky", top: 0, height: "100vh", flexShrink: 0 }}>
      <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: `${C.cyan}18`, border: `1px solid ${C.cyan}55`, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={16} color={C.cyan} strokeWidth={1.5} />
          </div>
          <div>
            <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.textBright, letterSpacing: "0.01em" }}>ContainerShield</div>
            <Mono size={8} color={C.textDim}>SECURITY PLATFORM</Mono>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: "10px 0", overflowY: "auto" }}>
        {nav.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 4 }}>
            <div style={{ fontFamily: mono, fontSize: 8, letterSpacing: "0.22em", textTransform: "uppercase", color: C.textDim, padding: "10px 20px 5px" }}>{section}</div>
            {items.map(({ key, label, Icon }) => {
              const isActive = active === key;
              return (
                <div key={key} onClick={() => onNav(key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 20px", cursor: "pointer", fontFamily: sans, fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? C.textBright : C.textDim, background: isActive ? `${C.cyan}12` : "transparent", borderLeft: `2px solid ${isActive ? C.cyan : "transparent"}`, transition: "all 0.12s" }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.color = C.text; e.currentTarget.style.background = `${C.cyan}06`; }}}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.color = C.textDim; e.currentTarget.style.background = "transparent"; }}}>
                  <Icon size={14} strokeWidth={isActive ? 2 : 1.5} color={isActive ? C.cyan : C.textDim} />
                  {label}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.green, boxShadow: `0 0 7px ${C.green}` }} />
          <Mono size={9} color={C.text}>SYSTEMS OPERATIONAL</Mono>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────
// TOPBAR
// ─────────────────────────────────────────────

const ALERT_ICON_MAP = { critical: XCircle, warning: AlertCircle, info: Info };
const ALERT_COLOR_MAP = { critical: C.red, warning: C.amber, info: C.cyan };

function Topbar({ clusterName, containerCount, alertCount, alerts, connected, dark, onToggleDark, onScan, onExport, onAcknowledge, onAcknowledgeAll, role, onRoleChange }) {
  const [open, setOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const currentRole = ROLES[role];
  const date = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: `1px solid ${C.border}`, background: C.bg, position: "sticky", top: 0, zIndex: 10 }}>
      <div>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright, letterSpacing: "-0.01em" }}>Security Overview</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {connected ? <Wifi size={10} color={C.green} strokeWidth={2} /> : <WifiOff size={10} color={C.red} strokeWidth={2} />}
            <Mono size={10} color={connected ? C.green : C.red}>{connected ? "LIVE" : "OFFLINE"}</Mono>
          </div>
          <span style={{ width: 1, height: 10, background: C.border2 }} />
          <Mono size={10} color={C.textDim}>{clusterName ? clusterName.toUpperCase() : "NO AGENTS"}</Mono>
          <span style={{ width: 1, height: 10, background: C.border2 }} />
          <Mono size={10} color={C.textDim}>{containerCount ?? 0} CONTAINERS</Mono>
          <span style={{ width: 1, height: 10, background: C.border2 }} />
          <Mono size={10} color={C.textDim}>{date.toUpperCase()}</Mono>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {/* Role badge + dropdown */}
        <div style={{ position: "relative" }}>
          <button onClick={() => setRoleOpen(o => !o)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", border: `1px solid ${currentRole.color}55`, background: `${currentRole.color}12`, borderRadius: 5, cursor: "pointer", fontFamily: mono, fontSize: 10, color: currentRole.color, fontWeight: 700, letterSpacing: "0.05em", transition: "all 0.12s" }}>
            <User size={12} strokeWidth={2} />
            {currentRole.label.toUpperCase()}
            <ChevronDown size={11} strokeWidth={2} style={{ transition: "transform 0.15s", transform: roleOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
          </button>

          {roleOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 260, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.4)", zIndex: 100, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}` }}>
                <Mono size={9} color={C.textDim}>SWITCH PERSPECTIVE</Mono>
              </div>
              {Object.values(ROLES).map(r => (
                <div key={r.id} onClick={() => { onRoleChange(r.id); setRoleOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer", background: r.id === role ? `${r.color}10` : "transparent", borderLeft: `2px solid ${r.id === role ? r.color : "transparent"}`, transition: "all 0.1s" }}
                  onMouseEnter={e => { if (r.id !== role) e.currentTarget.style.background = C.surface2; }}
                  onMouseLeave={e => { if (r.id !== role) e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: `${r.color}18`, border: `1px solid ${r.color}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <User size={13} color={r.color} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright }}>{r.label}</div>
                    <Mono size={9} color={C.textDim}>{r.id === role ? "CURRENT" : r.nav.length + " PAGES"}</Mono>
                  </div>
                  {r.id === role && <CheckCircle size={12} color={r.color} strokeWidth={2} />}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Dark/Light mode toggle */}
        <button onClick={onToggleDark} title={dark ? "Switch to light mode" : "Switch to dark mode"} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border2}`, borderRadius: 5, cursor: "pointer", background: "transparent", transition: "all 0.12s" }}
          onMouseEnter={e => e.currentTarget.style.background = `${C.cyan}15`}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          {dark ? <Sun size={15} color={C.amber} strokeWidth={1.5} /> : <Moon size={15} color={C.cyan} strokeWidth={1.5} />}
        </button>

        <button onClick={onExport} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: `1px solid ${C.border2}`, background: "transparent", color: C.text, borderRadius: 5, fontFamily: mono, fontSize: 10, cursor: "pointer", letterSpacing: "0.05em" }}>
          <Download size={12} strokeWidth={1.5} /> EXPORT
        </button>
        <button onClick={onScan} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: `1px solid ${C.cyan}`, background: `${C.cyan}18`, color: C.cyan, borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
          <Play size={11} strokeWidth={2} /> RUN VULNERABILITY SCAN
        </button>

        <div style={{ position: "relative" }}>
          <div onClick={() => setOpen(o => !o)} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${open ? C.cyan : C.border2}`, borderRadius: 5, cursor: "pointer", background: open ? `${C.cyan}10` : "transparent", transition: "all 0.12s" }}>
            <Bell size={15} color={open ? C.cyan : C.text} strokeWidth={1.5} />
            {alertCount > 0 && (
              <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, background: C.red, borderRadius: "50%", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, color: "#fff", fontWeight: 700 }}>
                {alertCount}
              </span>
            )}
          </div>

          {open && (
            <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 360, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 100, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright }}>
                  Active Alerts {alertCount > 0 && <span style={{ fontFamily: mono, fontSize: 10, color: C.red, marginLeft: 6 }}>{alertCount}</span>}
                </div>
                {alertCount > 0 && (
                  <button onClick={() => { onAcknowledgeAll(); setOpen(false); }} style={{ fontFamily: mono, fontSize: 9, color: C.textDim, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 8px", cursor: "pointer", letterSpacing: "0.08em" }}>
                    CLEAR ALL
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 340, overflowY: "auto" }}>
                {alerts.length === 0 ? (
                  <div style={{ padding: "28px 16px", textAlign: "center" }}>
                    <CheckCircle size={20} color={C.border2} strokeWidth={1} style={{ margin: "0 auto 8px", display: "block" }} />
                    <Mono size={9} color={C.textDim}>NO ACTIVE ALERTS</Mono>
                  </div>
                ) : alerts.map(a => {
                  const color = ALERT_COLOR_MAP[a.severity] || C.textDim;
                  const Icon = ALERT_ICON_MAP[a.severity] || Info;
                  return (
                    <div key={a.id} style={{ display: "flex", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${C.border}88`, alignItems: "flex-start" }}>
                      <Icon size={13} color={color} strokeWidth={1.5} style={{ marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright, marginBottom: 2 }}>{a.title}</div>
                        <div style={{ fontFamily: sans, fontSize: 11, color: C.text, lineHeight: 1.4 }}>{a.description}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                          <Clock size={9} color={C.textDim} />
                          <Mono size={9}>{a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : "—"}</Mono>
                          <span style={{ fontFamily: mono, fontSize: 8, color: color, letterSpacing: "0.1em" }}>{a.severity?.toUpperCase()}</span>
                        </div>
                      </div>
                      <button onClick={() => onAcknowledge(a.id)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 7px", fontFamily: mono, fontSize: 8, color: C.textDim, cursor: "pointer", flexShrink: 0, marginTop: 2, letterSpacing: "0.08em" }}>
                        DISMISS
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {open && <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />}
      {roleOpen && <div onClick={() => setRoleOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 99 }} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: DASHBOARD
// ─────────────────────────────────────────────

function DashboardPage({ containers, vulnerabilities, alerts, acknowledgeAll, acknowledge, threats, scans, compliance, stats, ls, lv, lcont, la, lcomp, lsc, onNav }) {
  const previewVulns = vulnerabilities.slice(0, 5);

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>

      {/* STAT CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
        <StatCard label="Containers Active" value={ls ? "…" : stats?.totalContainers} icon={Box} accent={C.cyan} />
        <StatCard label="Critical Vulnerabilities" value={lv ? "…" : vulnerabilities.filter(v => v.severity === "critical").length || null} icon={AlertTriangle} accent={C.red} />
        <StatCard label="Compliance Score" value={ls ? "…" : stats?.complianceScore != null ? `${stats.complianceScore}%` : null} icon={CheckCircle} accent={C.green} />
        <StatCard label="Active Alerts" value={ls ? "…" : stats?.threatsBlocked} icon={Shield} accent={C.amber} />
      </div>

      {/* ROW 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 22 }}>

        {/* Network Threats Panel — replaces Security Events 24h */}
        <Panel title="Network Threats" icon={Network} action="VIEW ALL" onAction={() => onNav("alerts")}>
          {threats.length === 0 ? (
            <EmptyState icon={Network} message="NO NETWORK THREATS DETECTED" />
          ) : (
            <div>
              {threats.slice(0, 5).map(t => (
                <div key={t.id} style={{ display: "flex", gap: 12, padding: "13px 18px", borderBottom: `1px solid ${C.border}`, alignItems: "flex-start" }}
                  onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <AlertTriangle size={13} color={t.severity === 'critical' ? C.red : C.amber} strokeWidth={1.5} style={{ marginTop: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright, marginBottom: 2 }}>{t.title}</div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: C.text, lineHeight: 1.4 }}>{t.description}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <Clock size={9} color={C.textDim} />
                      <Mono size={9}>{t.source?.replace('network-agent:', '')} · {t.severity?.toUpperCase()}</Mono>
                    </div>
                  </div>
                </div>
              ))}
              {threats.length > 5 && (
                <div onClick={() => onNav("alerts")} style={{ padding: "10px 18px", fontFamily: mono, fontSize: 9, color: C.cyan, cursor: "pointer", textAlign: "center" }}>
                  VIEW ALL {threats.length} THREATS →
                </div>
              )}
            </div>
          )}
        </Panel>

        <Panel title="Container Health" icon={Box} action="VIEW ALL" onAction={() => onNav("monitor")}>
          {lcont ? <Loading /> : containers.length === 0 ? <EmptyState icon={Box} message="NO CONTAINERS DETECTED" /> :
            containers.slice(0, 6).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <HealthDot health={c.health} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, color: C.textBright, fontWeight: 600 }}>{c.name || c.id}</div>
                  <Mono size={9} color={C.textDim}>{c.image}:{c.tag}</Mono>
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Cpu size={10} color={C.textDim} />
                    <Mono size={10} color={C.text}>{c.cpuPct != null ? `${c.cpuPct}%` : "—"}</Mono>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                    <Database size={10} color={C.textDim} />
                    <Mono size={10} color={C.text}>{c.memPct != null ? `${c.memPct}%` : "—"}</Mono>
                  </div>
                </div>
              </div>
            ))
          }
          {containers.length > 6 && (
            <div onClick={() => onNav("monitor")} style={{ padding: "10px 18px", fontFamily: mono, fontSize: 9, color: C.cyan, cursor: "pointer", textAlign: "center" }}>
              +{containers.length - 6} MORE →
            </div>
          )}
        </Panel>
      </div>

      {/* ROW 2: Vulns preview */}
      <div style={{ marginBottom: 22 }}>
        <Panel title="Vulnerabilities" icon={Search} action="VIEW ALL" onAction={() => onNav("vulns")}>
          {lv ? <Loading /> : vulnerabilities.length === 0 ? (
            <EmptyState icon={Search} message="SCANNING… OR CONNECT YOUR VULNERABILITY SCANNER" />
          ) : (
            <>
              <VulnTable rows={previewVulns} />
              {vulnerabilities.length > 5 && (
                <div onClick={() => onNav("vulns")} style={{ padding: "13px 18px", fontFamily: mono, fontSize: 10, color: C.cyan, cursor: "pointer", textAlign: "center", borderTop: `1px solid ${C.border}`, background: C.surface2 }}>
                  VIEW ALL {vulnerabilities.length} VULNERABILITIES →
                </div>
              )}
            </>
          )}
        </Panel>
      </div>

      {/* ROW 3 */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="Live Alerts" icon={Bell} action="CLEAR ALL" onAction={acknowledgeAll}>
            {la ? <Loading /> : alerts.length === 0 ? <EmptyState icon={CheckCircle} message="NO ACTIVE ALERTS" /> : (
              <div>
                {alerts.slice(0, 3).map(a => {
                  const color = ALERT_COLOR[a.severity] || C.textDim;
                  const Icon = ALERT_ICON[a.severity] || Info;
                  return (
                    <div key={a.id} style={{ display: "flex", gap: 12, padding: "13px 18px", borderBottom: `1px solid ${C.border}`, alignItems: "flex-start" }}>
                      <Icon size={14} color={color} strokeWidth={1.5} style={{ marginTop: 2, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.textBright, marginBottom: 3 }}>{a.title}</div>
                        <div style={{ fontFamily: sans, fontSize: 12, color: C.text, lineHeight: 1.5 }}>{a.description}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                          <Clock size={10} color={C.textDim} />
                          <Mono size={9}>{a.timestamp ? new Date(a.timestamp).toLocaleString() : "—"} · {(a.severity || "info").toUpperCase()}</Mono>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>

          <Panel title="Scan History" icon={Terminal} action="VIEW ALL" onAction={() => onNav("reports")}>
            {lsc ? <Loading /> : scans.length === 0 ? <EmptyState icon={Terminal} message="NO SCANS YET" /> :
              scans.slice(0, 4).map(s => (
                <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
                  {s.status === "clean" ? <CheckCircle size={13} color={C.green} strokeWidth={1.5} /> : s.status === "error" ? <XCircle size={13} color={C.red} strokeWidth={1.5} /> : <AlertTriangle size={13} color={C.amber} strokeWidth={1.5} />}
                  <div style={{ flex: 1 }}>
                    <Mono size={11} color={C.textBright}>{s.target}</Mono>
                    <div style={{ marginTop: 2 }}><Mono size={9}>{s.timestamp ? new Date(s.timestamp).toLocaleString() : "—"} · {s.type}</Mono></div>
                  </div>
                  <Mono size={10} color={s.vulnCount > 0 ? C.red : C.green}>{s.vulnCount != null ? (s.vulnCount === 0 ? "CLEAN" : `${s.vulnCount} VULNS`) : "—"}</Mono>
                </div>
              ))
            }
          </Panel>
        </div>

        <Panel title="Compliance" icon={CheckCircle} action="VIEW ALL" onAction={() => onNav("compliance")}>
          {lcomp ? <Loading /> : compliance.length === 0 ? <EmptyState icon={CheckCircle} message="CONNECT YOUR COMPLIANCE SCANNER" /> :
            compliance.slice(0, 5).map(c => {
              const pct = c.passPct ?? 0;
              const color = pct >= 85 ? C.green : pct >= 60 ? C.amber : C.red;
              return (
                <div key={c.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <div>
                      <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.textBright }}>{c.name}</span>
                      <Mono size={9} style={{ marginLeft: 8 }}>{c.standard}</Mono>
                    </div>
                    <Mono size={12} color={color}>{pct}%</Mono>
                  </div>
                  <div style={{ height: 5, background: C.surface2, borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
                  </div>
                  <div style={{ marginTop: 5, textAlign: "right" }}>
                    <Mono size={9}>{c.passCount}/{c.totalCount} CHECKS</Mono>
                  </div>
                </div>
              );
            })
          }
        </Panel>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: VULN SCANNER
// ─────────────────────────────────────────────

function VulnsPage({ vulnerabilities, loading, onBack }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? vulnerabilities : vulnerabilities.filter(v => v.severity === filter);

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Vulnerability Scanner</div>
        <Mono size={10} color={C.textDim} style={{ marginLeft: "auto" }}>{vulnerabilities.length} TOTAL FINDINGS</Mono>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["all", "critical", "high", "medium", "low"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ fontFamily: mono, fontSize: 9, padding: "5px 13px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", background: filter === f ? `${C.cyan}18` : "transparent", color: filter === f ? C.cyan : C.textDim, border: `1px solid ${filter === f ? C.cyan : C.border}`, transition: "all 0.12s" }}>
            {f} {f !== "all" && `(${vulnerabilities.filter(v => v.severity === f).length})`}
          </button>
        ))}
      </div>

      <Panel title="All Vulnerabilities" icon={Search}>
        {loading ? <Loading /> : filtered.length === 0 ? <EmptyState icon={Search} message="NO VULNERABILITIES FOUND" /> : <VulnTable rows={filtered} />}
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: LIVE MONITOR
// ─────────────────────────────────────────────

function MonitorPage({ containers, agents, loading, onBack }) {
  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Live Monitor</div>
        <div style={{ display: "flex", gap: 16, marginLeft: "auto" }}>
          <Mono size={10} color={C.green}>{containers.filter(c => c.health === "ok").length} HEALTHY</Mono>
          <Mono size={10} color={C.amber}>{containers.filter(c => c.health === "warn").length} WARNING</Mono>
          <Mono size={10} color={C.red}>{containers.filter(c => c.health === "crit").length} CRITICAL</Mono>
        </div>
      </div>

      {agents.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Panel title="Monitoring Agents" icon={Activity}>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(agents.length, 3)}, 1fr)`, gap: 1, background: C.border }}>
              {agents.map(a => (
                <div key={a.agentId} style={{ background: C.surface, padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.status === "online" ? C.green : C.red, boxShadow: `0 0 6px ${a.status === "online" ? C.green : C.red}`, flexShrink: 0 }} />
                    <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.textBright }}>{a.agentLabel}</div>
                    <span style={{ marginLeft: "auto", fontFamily: mono, fontSize: 8, padding: "2px 7px", borderRadius: 3, background: a.status === "online" ? "rgba(52,211,153,0.1)" : "rgba(251,113,133,0.1)", color: a.status === "online" ? C.green : C.red, border: `1px solid ${a.status === "online" ? C.green + "44" : C.red + "44"}` }}>
                      {a.status.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div><Mono size={9}>CONTAINERS</Mono><div style={{ fontFamily: mono, fontSize: 14, color: C.textBright, marginTop: 2 }}>{a.containerCount ?? "—"}</div></div>
                    {a.hostInfo && <>
                      <div><Mono size={9}>CPUS</Mono><div style={{ fontFamily: mono, fontSize: 14, color: C.textBright, marginTop: 2 }}>{a.hostInfo.cpuCount}</div></div>
                      <div><Mono size={9}>MEM FREE</Mono><div style={{ fontFamily: mono, fontSize: 14, color: C.textBright, marginTop: 2 }}>{a.hostInfo.freeMemMb}MB</div></div>
                    </>}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <Mono size={9} color={C.textDim}>LAST SEEN: {a.lastSeen ? new Date(a.lastSeen).toLocaleTimeString() : "—"}</Mono>
                    {a.status === 'offline' && (
                      <button
                        onClick={() => {
                          fetch(`http://localhost:3002/api/containers/${a.agentId}/start`, { method: 'POST' })
                            .catch(() => {
                              // Try by name if id fails
                              fetch(`http://localhost:3002/api/containers/cs-${a.agentId}/start`, { method: 'POST' });
                            });
                        }}
                        style={{ fontFamily: mono, fontSize: 8, padding: "3px 8px", borderRadius: 3, cursor: "pointer", letterSpacing: "0.08em", background: "rgba(52,211,153,0.08)", color: C.green, border: `1px solid ${C.green}44` }}>
                        BRING ONLINE
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      )}

      <Panel title="All Containers" icon={Box}>
        {loading ? <Loading /> : containers.length === 0 ? <EmptyState icon={Box} message="NO CONTAINERS DETECTED" /> :
          containers.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.surface2}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <HealthDot health={c.health} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 12, color: C.textBright, fontWeight: 600 }}>{c.name || c.id}</div>
                <Mono size={10} color={C.textDim}>{c.image}:{c.tag} · {c.agentLabel || c.env} · {c.status}</Mono>
              </div>

              {/* CPU Sparkline */}
              <div style={{ textAlign: "center" }}>
                <Mono size={9} color={C.textDim}>CPU</Mono>
                <div style={{ marginTop: 2 }}>
                  <Sparkline data={(c.history || []).map(h => h.cpu)} color={C.cyan} />
                </div>
                <Mono size={10} color={C.textBright}>{c.cpuPct != null ? `${c.cpuPct}%` : "—"}</Mono>
              </div>

              {/* MEM Sparkline */}
              <div style={{ textAlign: "center" }}>
                <Mono size={9} color={C.textDim}>MEM</Mono>
                <div style={{ marginTop: 2 }}>
                  <Sparkline data={(c.history || []).map(h => h.mem)} color={C.green} />
                </div>
                <Mono size={10} color={C.textBright}>{c.memPct != null ? `${c.memPct}%` : "—"}</Mono>
              </div>

              {/* Actions */}
              {c.status === 'running' ? (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      if (window.confirm(`Restart ${c.name}?`)) {
                        fetch(`http://localhost:3002/api/containers/${c.id}/restart`, { method: 'POST' })
                          .then(() => console.log(`Restarted ${c.name}`))
                          .catch(err => alert('Failed: ' + err.message));
                      }
                    }}
                    style={{ fontFamily: mono, fontSize: 9, padding: "4px 10px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.08em", background: "rgba(56,189,248,0.08)", color: C.cyan, border: `1px solid ${C.cyan}44`, transition: "all 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = `rgba(56,189,248,0.18)`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `rgba(56,189,248,0.08)`; }}>
                    RESTART
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Stop ${c.name}? This will take it offline.`)) {
                        fetch(`http://localhost:3002/api/containers/${c.id}/stop`, { method: 'POST' })
                          .then(() => console.log(`Stopped ${c.name}`))
                          .catch(err => alert('Failed: ' + err.message));
                      }
                    }}
                    style={{ fontFamily: mono, fontSize: 9, padding: "4px 10px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.08em", background: "rgba(251,113,133,0.08)", color: C.red, border: `1px solid ${C.red}44`, transition: "all 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = `rgba(251,113,133,0.18)`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `rgba(251,113,133,0.08)`; }}>
                    STOP
                  </button>
                </div>
              ) : c.status === 'exited' || c.status === 'stopped' ? (
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      fetch(`http://localhost:3002/api/containers/${c.id}/start`, { method: 'POST' })
                        .then(() => console.log(`Started ${c.name}`))
                        .catch(err => alert('Failed: ' + err.message));
                    }}
                    style={{ fontFamily: mono, fontSize: 9, padding: "4px 10px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.08em", background: "rgba(52,211,153,0.08)", color: C.green, border: `1px solid ${C.green}44`, transition: "all 0.12s" }}
                    onMouseEnter={e => { e.currentTarget.style.background = `rgba(52,211,153,0.18)`; }}
                    onMouseLeave={e => { e.currentTarget.style.background = `rgba(52,211,153,0.08)`; }}>
                    START
                  </button>
                </div>
              ) : null}
            </div>
          ))
        }
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: ALERTS
// ─────────────────────────────────────────────

function AlertsPage({ alerts, loading, onBack, onAcknowledge, onAcknowledgeAll }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? alerts : alerts.filter(a => a.severity === filter);

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Live Alerts</div>
        {alerts.length > 0 && (
          <button onClick={onAcknowledgeAll} style={{ marginLeft: "auto", fontFamily: mono, fontSize: 9, color: C.textDim, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, padding: "4px 12px", cursor: "pointer", letterSpacing: "0.08em" }}>
            CLEAR ALL
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["all", "critical", "warning", "info"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ fontFamily: mono, fontSize: 9, padding: "5px 13px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", background: filter === f ? `${C.cyan}18` : "transparent", color: filter === f ? C.cyan : C.textDim, border: `1px solid ${filter === f ? C.cyan : C.border}`, transition: "all 0.12s" }}>
            {f} {f !== "all" && `(${alerts.filter(a => a.severity === f).length})`}
          </button>
        ))}
      </div>

      <Panel title="All Alerts" icon={Bell}>
        {loading ? <Loading /> : filtered.length === 0 ? (
          <EmptyState icon={CheckCircle} message="NO ACTIVE ALERTS" />
        ) : (
          filtered.map(a => {
            const color = ALERT_COLOR[a.severity] || C.textDim;
            const Icon = ALERT_ICON[a.severity] || Info;
            return (
              <div key={a.id} style={{ display: "flex", gap: 14, padding: "16px 18px", borderBottom: `1px solid ${C.border}`, alignItems: "flex-start", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <Icon size={15} color={color} strokeWidth={1.5} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.textBright, marginBottom: 4 }}>{a.title}</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 6 }}>{a.description}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <Clock size={10} color={C.textDim} />
                      <Mono size={9}>{a.timestamp ? new Date(a.timestamp).toLocaleString() : "—"}</Mono>
                    </div>
                    <span style={{ fontFamily: mono, fontSize: 8, color, letterSpacing: "0.12em", background: `${color}18`, border: `1px solid ${color}44`, padding: "1px 6px", borderRadius: 3 }}>
                      {a.severity?.toUpperCase()}
                    </span>
                    {a.source && <Mono size={9} color={C.textDim}>SOURCE: {a.source}</Mono>}
                  </div>
                </div>
                <button onClick={() => onAcknowledge(a.id)} style={{ background: "transparent", border: `1px solid ${C.border}`, borderRadius: 4, padding: "4px 10px", fontFamily: mono, fontSize: 9, color: C.textDim, cursor: "pointer", flexShrink: 0, letterSpacing: "0.08em" }}>
                  DISMISS
                </button>
              </div>
            );
          })
        )}
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: COMPLIANCE
// ─────────────────────────────────────────────

function CompliancePage({ compliance, loading, onBack }) {
  const [expanded, setExpanded] = useState(null);

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Compliance</div>
        <Mono size={10} color={C.textDim} style={{ marginLeft: "auto" }}>CIS DOCKER BENCHMARK 1.6.0</Mono>
      </div>

      {loading ? <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}><Loading /></div> :
        compliance.length === 0 ? (
          <div style={{ background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <EmptyState icon={CheckCircle} message="NO COMPLIANCE DATA" />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {compliance.map(cat => {
              const pct = cat.passPct ?? 0;
              const color = pct >= 85 ? C.green : pct >= 60 ? C.amber : C.red;
              const isOpen = expanded === cat.id;
              return (
                <div key={cat.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  <div onClick={() => setExpanded(isOpen ? null : cat.id)}
                    style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", cursor: "pointer", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.textBright, marginBottom: 4 }}>{cat.name}</div>
                      <Mono size={9} color={C.textDim}>{cat.standard}</Mono>
                    </div>
                    <div style={{ width: 180 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <Mono size={9} color={C.textDim}>{cat.passCount}/{cat.totalCount} CHECKS</Mono>
                        <Mono size={11} color={color}>{pct}%</Mono>
                      </div>
                      <div style={{ height: 5, background: C.surface2, borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.8s ease" }} />
                      </div>
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: C.textDim, marginLeft: 8 }}>{isOpen ? "▲" : "▼"}</div>
                  </div>
                  {isOpen && (
                    <div style={{ borderTop: `1px solid ${C.border}` }}>
                      {(cat.checks || []).map((chk, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 20px", borderBottom: `1px solid ${C.border}88` }}>
                          {chk.pass
                            ? <CheckCircle size={13} color={C.green} strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />
                            : <XCircle size={13} color={C.red} strokeWidth={2} style={{ marginTop: 2, flexShrink: 0 }} />}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright, marginBottom: 2 }}>{chk.check}</div>
                            <div style={{ fontFamily: sans, fontSize: 11, color: chk.pass ? C.textDim : C.text }}>{chk.detail}</div>
                          </div>
                          <span style={{ fontFamily: mono, fontSize: 9, padding: "2px 7px", borderRadius: 3, fontWeight: 700, background: chk.pass ? "rgba(52,211,153,0.1)" : "rgba(251,113,133,0.1)", color: chk.pass ? C.green : C.red, border: `1px solid ${chk.pass ? C.green + "44" : C.red + "44"}`, flexShrink: 0 }}>
                            {chk.pass ? "PASS" : "FAIL"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: SECRETS SCAN
// ─────────────────────────────────────────────

function SecretsPage({ onBack }) {
  const { secrets, loading, scanned, scan } = useSecrets();
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? secrets : secrets.filter(s => s.severity === filter);

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Secrets Scan</div>
        <Mono size={10} color={C.textDim} style={{ marginLeft: "auto" }}>
          {scanned ? `${secrets.length} SECRETS FOUND` : "NOT YET SCANNED"}
        </Mono>
        <button onClick={scan} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: `1px solid ${C.cyan}`, background: `${C.cyan}18`, color: C.cyan, borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, letterSpacing: "0.05em" }}>
          <Play size={11} strokeWidth={2} /> {loading ? "SCANNING…" : "RUN SCAN"}
        </button>
      </div>

      {loading ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 340, gap: 20, overflow: "hidden", position: "relative" }}>
          {/* Animated scan line */}
          <style>{`
            @keyframes scanline {
              0% { top: 0%; opacity: 1; }
              100% { top: 100%; opacity: 0.2; }
            }
            @keyframes pulse-ring {
              0% { transform: scale(0.8); opacity: 0.8; }
              100% { transform: scale(1.6); opacity: 0; }
            }
            @keyframes blink {
              0%, 100% { opacity: 1; }
              50% { opacity: 0.2; }
            }
            @keyframes scroll-code {
              0% { transform: translateY(0); }
              100% { transform: translateY(-50%); }
            }
          `}</style>

          {/* Scrolling code background */}
          <div style={{ position: "absolute", inset: 0, overflow: "hidden", opacity: 0.04 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: C.cyan, lineHeight: 1.8, padding: "10px 20px", animation: "scroll-code 8s linear infinite", whiteSpace: "pre" }}>
              {[...Array(6)].map((_, i) => (
                `AWS_SECRET_KEY=AKIA... GITHUB_TOKEN=ghp_... PRIVATE_KEY=-----BEGIN... DB_PASSWORD=... API_KEY=sk-... JWT_SECRET=...\n`
              )).join('')}
              {[...Array(6)].map((_, i) => (
                `AWS_SECRET_KEY=AKIA... GITHUB_TOKEN=ghp_... PRIVATE_KEY=-----BEGIN... DB_PASSWORD=... API_KEY=sk-... JWT_SECRET=...\n`
              )).join('')}
            </div>
          </div>

          {/* Scan line sweep */}
          <div style={{ position: "absolute", left: 0, right: 0, height: 2, background: `linear-gradient(90deg, transparent, ${C.cyan}, transparent)`, animation: "scanline 1.8s ease-in-out infinite", boxShadow: `0 0 12px ${C.cyan}` }} />

          {/* Center icon with pulse */}
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ position: "absolute", inset: -16, borderRadius: "50%", border: `2px solid ${C.cyan}44`, animation: "pulse-ring 1.5s ease-out infinite" }} />
            <div style={{ position: "absolute", inset: -16, borderRadius: "50%", border: `2px solid ${C.cyan}44`, animation: "pulse-ring 1.5s ease-out infinite 0.5s" }} />
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: `${C.cyan}15`, border: `1.5px solid ${C.cyan}66`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Search size={22} color={C.cyan} strokeWidth={1.5} />
            </div>
          </div>

          {/* Status text */}
          <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
            <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.textBright, marginBottom: 6 }}>
              Scanning images for secrets
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.cyan, animation: "blink 1s ease-in-out infinite" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.cyan, animation: "blink 1s ease-in-out infinite 0.3s" }} />
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.cyan, animation: "blink 1s ease-in-out infinite 0.6s" }} />
            </div>
            <Mono size={9} color={C.textDim} style={{ marginTop: 10 }}>CHECKING FOR API KEYS · PASSWORDS · TOKENS · PRIVATE KEYS</Mono>
          </div>
        </div>
      ) : !scanned ? (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 16 }}>
          <Lock size={32} color={C.border2} strokeWidth={1} />
          <div style={{ fontFamily: sans, fontSize: 14, color: C.textDim, textAlign: "center" }}>
            Scan your container images for hardcoded secrets
          </div>
          <Mono size={9} color={C.textDim}>API KEYS · PASSWORDS · PRIVATE KEYS · TOKENS</Mono>
          <button onClick={scan} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", border: `1px solid ${C.cyan}`, background: `${C.cyan}18`, color: C.cyan, borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em", marginTop: 8 }}>
            <Play size={12} strokeWidth={2} /> RUN SECRETS SCAN
          </button>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["all", "critical", "high", "medium", "low"].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={{ fontFamily: mono, fontSize: 9, padding: "5px 13px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", background: filter === f ? `${C.cyan}18` : "transparent", color: filter === f ? C.cyan : C.textDim, border: `1px solid ${filter === f ? C.cyan : C.border}`, transition: "all 0.12s" }}>
                {f} {f !== "all" && `(${secrets.filter(s => s.severity === f).length})`}
              </button>
            ))}
          </div>

          <Panel title="Secrets Found" icon={Lock}>
            {loading ? <Loading /> : filtered.length === 0 ? (
              <EmptyState icon={CheckCircle} message={secrets.length === 0 ? "NO SECRETS DETECTED — IMAGES LOOK CLEAN" : "NO SECRETS MATCH THIS FILTER"} />
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={TH}>Severity</th>
                      <th style={TH}>Container</th>
                      <th style={TH}>Type</th>
                      <th style={TH}>Description</th>
                      <th style={TH}>Location</th>
                      <th style={TH}>Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(s => (
                      <tr key={s.id}
                        onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={TD}><SeverityBadge severity={s.severity} /></td>
                        <td style={TD}><Mono size={11} color={C.textBright}>{s.container}</Mono></td>
                        <td style={TD}><Mono size={10} color={C.amber}>{s.category}</Mono></td>
                        <td style={TD}><span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{s.title}</span></td>
                        <td style={TD}><Mono size={10} color={C.textDim}>{s.target}</Mono></td>
                        <td style={TD}><Mono size={10} color={C.red}>{s.match || "—"}</Mono></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: AUDIT LOG
// ─────────────────────────────────────────────

const AUDIT_TYPE_LABEL = {
  alert_created:            { label: 'Alert Created',       color: null },
  alert_resolved:           { label: 'Alert Resolved',      color: null },
  alert_acknowledged:       { label: 'Alert Dismissed',     color: null },
  vulnerability_scan_started: { label: 'Vuln Scan',         color: null },
  compliance_scan_started:  { label: 'Compliance Scan',     color: null },
  secrets_scan_started:     { label: 'Secrets Scan',        color: null },
};

function AuditPage({ socket, onBack }) {
  const { events, loading } = useAudit(socket);
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all' ? events : events.filter(e => {
    if (filter === 'alerts') return e.type.startsWith('alert_');
    if (filter === 'scans') return e.type.includes('scan');
    return e.severity === filter;
  });

  const typeInfo = (type) => AUDIT_TYPE_LABEL[type] || { label: type, color: null };

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Audit Log</div>
        <Mono size={10} color={C.textDim} style={{ marginLeft: "auto" }}>{events.length} EVENTS</Mono>
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { key: 'all',    label: 'All' },
          { key: 'alerts', label: 'Alerts' },
          { key: 'scans',  label: 'Scans' },
          { key: 'critical', label: 'Critical' },
          { key: 'warning',  label: 'Warning' },
          { key: 'info',     label: 'Info' },
        ].map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{ fontFamily: mono, fontSize: 9, padding: "5px 13px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", background: filter === f.key ? `${C.cyan}18` : "transparent", color: filter === f.key ? C.cyan : C.textDim, border: `1px solid ${filter === f.key ? C.cyan : C.border}`, transition: "all 0.12s" }}>
            {f.label}
          </button>
        ))}
      </div>

      <Panel title="Security Event Log" icon={List}>
        {loading ? <Loading /> : filtered.length === 0 ? (
          <EmptyState icon={List} message="NO AUDIT EVENTS YET" />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={TH}>Time</th>
                  <th style={TH}>Type</th>
                  <th style={TH}>Severity</th>
                  <th style={TH}>Title</th>
                  <th style={TH}>Description</th>
                  <th style={TH}>Source</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(e => {
                  const sevColor = ALERT_COLOR[e.severity] || C.textDim;
                  const { label } = typeInfo(e.type);
                  const isAlert = e.type.startsWith('alert_');
                  const isScan = e.type.includes('scan');
                  const typeColor = isAlert ? C.amber : isScan ? C.cyan : C.textDim;

                  return (
                    <tr key={e.id}
                      onMouseEnter={el => el.currentTarget.style.background = C.surface2}
                      onMouseLeave={el => el.currentTarget.style.background = "transparent"}>
                      <td style={TD}>
                        <Mono size={10} color={C.textDim}>
                          {e.timestamp ? new Date(e.timestamp).toLocaleString() : "—"}
                        </Mono>
                      </td>
                      <td style={TD}>
                        <span style={{ fontFamily: mono, fontSize: 9, padding: "2px 8px", borderRadius: 3, background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}44`, letterSpacing: "0.08em" }}>
                          {label}
                        </span>
                      </td>
                      <td style={TD}><SeverityBadge severity={e.severity} /></td>
                      <td style={TD}>
                        <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright }}>{e.title}</span>
                      </td>
                      <td style={TD}>
                        <span style={{ fontFamily: sans, fontSize: 11, color: C.text }}>{e.description}</span>
                      </td>
                      <td style={TD}>
                        <Mono size={10} color={C.textDim}>{e.source || "—"}</Mono>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: CONFIG
// ─────────────────────────────────────────────

const DEFAULT_CONFIG = {
  cpuWarning: 70, cpuCritical: 90,
  memoryWarning: 75, memoryCritical: 90,
  agentOfflineTimeout: 30,
};

function ConfigPage({ onBack }) {
  const [settings, setSettings] = useState(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);
  const saveTimeoutRef = useRef(null);

  const updateSetting = (key, value) => { setSettings(c => ({ ...c, [key]: Number(value) })); setSaved(false); };
  const saveSettings = () => { setSaved(true); if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = window.setTimeout(() => setSaved(false), 2200); };
  const resetDefaults = () => { setSettings(DEFAULT_CONFIG); setSaved(false); };

  const thresholdFields = [
    { key: "cpuWarning",          label: "CPU Warning Threshold",          description: "Warn when container CPU usage crosses this percentage.",              severity: "warning"  },
    { key: "cpuCritical",         label: "CPU Critical Threshold",         description: "Mark CPU health as critical above this percentage.",                  severity: "critical" },
    { key: "memoryWarning",       label: "Memory Warning Threshold",       description: "Warn when memory utilization reaches this threshold.",                severity: "warning"  },
    { key: "memoryCritical",      label: "Memory Critical Threshold",      description: "Escalate memory health to critical above this point.",               severity: "critical" },
    { key: "agentOfflineTimeout", label: "Agent Offline Timeout (seconds)",description: "Consider an agent offline after this many seconds without a heartbeat.", severity: "info" },
  ];

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Configuration</div>
        <Mono size={10} color={C.textDim} style={{ marginLeft: "auto" }}>LOCAL SETTINGS ONLY</Mono>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <Panel title="Threshold Settings" icon={Settings}>
          <div style={{ padding: "18px" }}>
            <div style={{ display: "grid", gap: 14 }}>
              {thresholdFields.map(field => (
                <div key={field.key} style={{ background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 8, padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                    <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.textBright }}>{field.label}</div>
                    <SeverityBadge severity={field.severity} />
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: C.textDim, lineHeight: 1.5, marginBottom: 12 }}>{field.description}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="number" value={settings[field.key]} onChange={e => updateSetting(field.key, e.target.value)}
                      style={{ width: 120, background: C.bg, color: C.textBright, border: `1px solid ${C.border2}`, borderRadius: 5, padding: "9px 11px", fontFamily: mono, fontSize: 12, outline: "none" }} />
                    <Mono size={9} color={C.textDim}>{field.key === "agentOfflineTimeout" ? "SECONDS" : "PERCENT"}</Mono>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="Actions" icon={Play}>
            <div style={{ padding: "18px" }}>
              <Label>Save Config</Label>
              <div style={{ fontFamily: sans, fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 14 }}>Store the current thresholds in component state for this session.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={saveSettings} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", border: `1px solid ${C.cyan}`, background: `${C.cyan}18`, color: C.cyan, borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>SAVE SETTINGS</button>
                <button onClick={resetDefaults} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", border: `1px solid ${C.border2}`, background: "transparent", color: C.text, borderRadius: 5, fontFamily: mono, fontSize: 10, cursor: "pointer", letterSpacing: "0.05em" }}>RESET DEFAULTS</button>
              </div>
              <div style={{ minHeight: 18, marginTop: 10 }}>{saved && <Mono size={9} color={C.green}>SETTINGS SAVED LOCALLY</Mono>}</div>
            </div>
          </Panel>

          <Panel title="Active Profile" icon={Shield}>
            <div style={{ padding: "18px" }}>
              <Label>Runtime Summary</Label>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}><Mono size={10} color={C.textDim}>CPU</Mono><Mono size={10} color={C.textBright}>{settings.cpuWarning}% WARN · {settings.cpuCritical}% CRIT</Mono></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><Mono size={10} color={C.textDim}>MEMORY</Mono><Mono size={10} color={C.textBright}>{settings.memoryWarning}% WARN · {settings.memoryCritical}% CRIT</Mono></div>
                <div style={{ display: "flex", justifyContent: "space-between" }}><Mono size={10} color={C.textDim}>AGENT TIMEOUT</Mono><Mono size={10} color={C.textBright}>{settings.agentOfflineTimeout} SECONDS</Mono></div>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: REPORTS
// ─────────────────────────────────────────────

function ReportsPage({ containers, vulnerabilities, alerts, compliance, stats, scans, ls, lv, la, lcomp, lsc, onBack, onExport }) {
  const criticalAlerts = alerts.filter(a => a.severity === "critical" && !a.acknowledged).length;
  const complianceScore = stats?.complianceScore ?? null;
  const recentFindings = vulnerabilities.length > 0
    ? vulnerabilities.slice(0, 5).map(v => ({ id: `vuln-${v.id}`, type: "Vulnerability", event: v.cveId, severity: v.severity, source: v.container, description: `${v.package} ${v.version || ""}`.trim() }))
    : alerts.slice(0, 5).map(a => ({ id: `alert-${a.id}`, type: "Alert", event: a.title, severity: a.severity, source: a.source || "runtime-monitor", description: a.description }));

  const summaryText = ls ? "Generating security posture summary…" : `The platform is currently monitoring ${stats?.totalContainers ?? containers.length ?? 0} containers with ${vulnerabilities.length} known vulnerabilities, ${criticalAlerts} critical alerts, and a compliance score of ${complianceScore != null ? `${complianceScore}%` : "unknown"}. ${criticalAlerts > 0 ? "Immediate attention is recommended for active critical issues." : "No active critical alerts are currently blocking operations."}`;

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Reports</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <button onClick={onExport} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: `1px solid ${C.cyan}`, background: `${C.cyan}18`, color: C.cyan, borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
            <Download size={12} strokeWidth={1.5} /> EXPORT PDF
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
        <StatCard label="Containers Monitored" value={ls ? "…" : stats?.totalContainers ?? containers.length} icon={Box} accent={C.cyan} />
        <StatCard label="Total Vulnerabilities" value={lv ? "…" : vulnerabilities.length} icon={Search} accent={C.red} />
        <StatCard label="Critical Alerts" value={la ? "…" : criticalAlerts} icon={Bell} accent={C.amber} />
        <StatCard label="Compliance Score" value={lcomp && ls ? "…" : complianceScore != null ? `${complianceScore}%` : "—"} icon={CheckCircle} accent={C.green} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 22 }}>
        <Panel title="Security Summary" icon={FileText}>
          <div style={{ padding: "18px" }}>
            <Label>Executive Snapshot</Label>
            <div style={{ fontFamily: sans, fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 16 }}>{summaryText}</div>
          </div>
        </Panel>
        <Panel title="Report Status" icon={Shield}>
          <div style={{ padding: "18px" }}>
            <Label>Current Coverage</Label>
            <div style={{ display: "grid", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Mono size={10} color={C.textDim}>VULNERABILITIES</Mono><SeverityBadge severity={vulnerabilities.some(v => v.severity === "critical") ? "critical" : vulnerabilities.length > 0 ? "high" : "low"} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Mono size={10} color={C.textDim}>ALERT STATUS</Mono><SeverityBadge severity={criticalAlerts > 0 ? "critical" : alerts.length > 0 ? "medium" : "low"} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><Mono size={10} color={C.textDim}>COMPLIANCE</Mono><SeverityBadge severity={complianceScore >= 85 ? "low" : complianceScore >= 60 ? "medium" : "high"} /></div>
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Recent Findings" icon={AlertTriangle}>
        {recentFindings.length === 0 ? <EmptyState icon={CheckCircle} message="NO RECENT FINDINGS" /> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={TH}>Type</th><th style={TH}>Event</th><th style={TH}>Severity</th><th style={TH}>Source</th><th style={TH}>Description</th></tr></thead>
              <tbody>
                {recentFindings.map(item => (
                  <tr key={item.id} onMouseEnter={e => e.currentTarget.style.background = C.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={TD}><Mono size={10} color={C.cyan}>{item.type.toUpperCase()}</Mono></td>
                    <td style={TD}><Mono size={11} color={C.textBright}>{item.event}</Mono></td>
                    <td style={TD}><SeverityBadge severity={item.severity} /></td>
                    <td style={TD}><Mono size={10} color={C.textDim}>{item.source}</Mono></td>
                    <td style={TD}><span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{item.description}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: TEAM
// ─────────────────────────────────────────────

const TEAM_MEMBERS = [
  { id: "admin",    name: "Security Admin",    roleBadge: "Admin",   status: "Active",    focus: "Threat response and platform hardening",        permissions: "Full policy control, alert triage, configuration changes" },
  { id: "devops",   name: "DevOps Engineer",   roleBadge: "Viewer",  status: "Active",    focus: "Container uptime and deployment stability",      permissions: "Infrastructure visibility, runtime diagnostics, deployment coordination" },
  { id: "analyst",  name: "Compliance Analyst",roleBadge: "Analyst", status: "Reviewing", focus: "Audit readiness and benchmark remediation",      permissions: "Compliance review, reporting access, evidence collection" },
];

const INCIDENT_OWNERSHIP = [
  { event: "Critical vulnerabilities", role: "Security Admin",     severity: "critical" },
  { event: "Container downtime",        role: "DevOps Engineer",    severity: "warning"  },
  { event: "Compliance failures",       role: "Compliance Analyst", severity: "info"     },
  { event: "Secrets exposure",          role: "Security Admin",     severity: "critical" },
];

function TeamPage({ onBack }) {
  const roleBadgeStyle = {
    Admin:   { bg: "rgba(251,113,133,0.15)", color: C.red,   border: `${C.red}55`   },
    Analyst: { bg: "rgba(56,189,248,0.12)",  color: C.cyan,  border: `${C.cyan}55`  },
    Viewer:  { bg: "rgba(52,211,153,0.12)",  color: C.green, border: `${C.green}55` },
  };

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Team</div>
        <Mono size={10} color={C.textDim} style={{ marginLeft: "auto" }}>{TEAM_MEMBERS.length} CORE MEMBERS</Mono>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 22 }}>
        <Panel title="Team Directory" icon={Users}>
          <div style={{ display: "grid", gap: 1, background: C.border }}>
            {TEAM_MEMBERS.map(member => (
              <div key={member.id} style={{ background: C.surface, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600, color: C.textBright }}>{member.name}</div>
                    <Mono size={9} color={C.textDim}>{member.status.toUpperCase()}</Mono>
                  </div>
                  <span style={{ display: "inline-block", fontFamily: mono, fontSize: 9, fontWeight: 700, padding: "3px 8px", borderRadius: 3, letterSpacing: "0.12em", background: roleBadgeStyle[member.roleBadge].bg, color: roleBadgeStyle[member.roleBadge].color, border: `1px solid ${roleBadgeStyle[member.roleBadge].border}` }}>
                    {member.roleBadge.toUpperCase()}
                  </span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div><Label>Focus</Label><div style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{member.focus}</div></div>
                  <div><Label>Permissions</Label><div style={{ fontFamily: sans, fontSize: 12, color: C.text, lineHeight: 1.5 }}>{member.permissions}</div></div>
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Access Control Summary" icon={Lock}>
          <div style={{ padding: "18px" }}>
            <Label>Role-Based Access</Label>
            <div style={{ fontFamily: sans, fontSize: 12, color: C.text, lineHeight: 1.6 }}>
              Access is segmented by operational responsibility. Admin roles can change enforcement settings and respond to critical incidents, analysts can review findings and compliance posture, and viewer-oriented roles keep visibility into runtime health without broad security control changes.
            </div>
          </div>
        </Panel>
      </div>

      <Panel title="Incident Ownership" icon={Shield}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={TH}>Incident Type</th><th style={TH}>Owning Role</th><th style={TH}>Priority</th></tr></thead>
            <tbody>
              {INCIDENT_OWNERSHIP.map(item => (
                <tr key={item.event} onMouseEnter={e => e.currentTarget.style.background = C.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={TD}><Mono size={11} color={C.textBright}>{item.event}</Mono></td>
                  <td style={TD}><span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{item.role}</span></td>
                  <td style={TD}><SeverityBadge severity={item.severity} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: MY TASKS
// ─────────────────────────────────────────────

function TasksPage({ role, onBack, onNav }) {
  const roleData = ROLES[role];
  const [tasks, setTasks] = useState(roleData.tasks.map(t => ({ ...t })));

  const toggle = (id) => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  const reset = () => setTasks(roleData.tasks.map(t => ({ ...t, done: false })));

  const done = tasks.filter(t => t.done).length;
  const pct = Math.round((done / tasks.length) * 100);
  const color = pct === 100 ? C.green : pct >= 50 ? C.amber : C.cyan;

  const priorityColor = { critical: C.red, high: C.amber, medium: C.cyan, low: C.textDim };

  // Role-specific quick actions
  const quickActions = {
    admin: [
      { label: "View Active Alerts", nav: "alerts" },
      { label: "Run Vuln Scan",      nav: "vulns"   },
      { label: "Check Compliance",   nav: "compliance" },
      { label: "Review Audit Log",   nav: "audit"   },
    ],
    analyst: [
      { label: "Open Compliance",    nav: "compliance" },
      { label: "View Vulnerabilities", nav: "vulns"  },
      { label: "Export Report",      nav: "reports" },
      { label: "Audit Log",          nav: "audit"   },
    ],
    devops: [
      { label: "Live Monitor",       nav: "monitor" },
      { label: "View Alerts",        nav: "alerts"  },
      { label: "Dashboard",          nav: "dashboard" },
    ],
  }[role] || [];

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>My Tasks</div>
        <span style={{ fontFamily: mono, fontSize: 9, padding: "3px 8px", borderRadius: 3, background: `${roleData.color}18`, color: roleData.color, border: `1px solid ${roleData.color}44` }}>
          {roleData.label.toUpperCase()}
        </span>
        <Mono size={10} color={C.textDim} style={{ marginLeft: "auto" }}>{done}/{tasks.length} COMPLETE</Mono>
        <button onClick={reset} style={{ fontFamily: mono, fontSize: 9, padding: "4px 10px", borderRadius: 4, cursor: "pointer", background: "transparent", color: C.textDim, border: `1px solid ${C.border}` }}>RESET</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Progress */}
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: C.textBright }}>Progress</div>
              <Mono size={14} color={color}>{pct}%</Mono>
            </div>
            <div style={{ height: 8, background: C.surface2, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
            </div>
            <Mono size={9} color={C.textDim}>{done} OF {tasks.length} TASKS COMPLETED</Mono>
          </div>

          {/* Task list */}
          <Panel title="Task List" icon={ClipboardList}>
            {tasks.map(task => (
              <div key={task.id}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderBottom: `1px solid ${C.border}`, transition: "background 0.1s", opacity: task.done ? 0.55 : 1 }}
                onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {/* Checkbox */}
                <div onClick={() => toggle(task.id)} style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${task.done ? C.green : C.border2}`, background: task.done ? `${C.green}22` : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s", cursor: "pointer" }}>
                  {task.done && <CheckCircle size={11} color={C.green} strokeWidth={2.5} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: sans, fontSize: 13, color: task.done ? C.textDim : C.textBright, textDecoration: task.done ? "line-through" : "none" }}>
                    {task.label}
                  </div>
                </div>
                <span style={{ fontFamily: mono, fontSize: 8, padding: "2px 7px", borderRadius: 3, background: `${priorityColor[task.priority]}18`, color: priorityColor[task.priority], border: `1px solid ${priorityColor[task.priority]}44`, letterSpacing: "0.08em", flexShrink: 0 }}>
                  {task.priority.toUpperCase()}
                </span>
                {task.nav && (
                  <button onClick={() => onNav(task.nav)} style={{ fontFamily: mono, fontSize: 8, padding: "3px 8px", borderRadius: 3, cursor: "pointer", background: `${C.cyan}10`, color: C.cyan, border: `1px solid ${C.cyan}44`, flexShrink: 0, letterSpacing: "0.06em" }}>
                    GO →
                  </button>
                )}
              </div>
            ))}
          </Panel>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Role info */}
          <Panel title="Your Role" icon={User}>
            <div style={{ padding: "18px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: `${roleData.color}18`, border: `1px solid ${roleData.color}44`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <User size={18} color={roleData.color} strokeWidth={1.5} />
                </div>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 700, color: C.textBright }}>{roleData.label}</div>
                  <span style={{ fontFamily: mono, fontSize: 8, padding: "2px 6px", borderRadius: 3, background: `${roleData.color}18`, color: roleData.color, border: `1px solid ${roleData.color}44` }}>
                    {role.toUpperCase()}
                  </span>
                </div>
              </div>
              <div style={{ fontFamily: sans, fontSize: 12, color: C.text, lineHeight: 1.6 }}>{roleData.description}</div>
            </div>
          </Panel>

          {/* Quick actions */}
          <Panel title="Quick Access" icon={Activity}>
            <div style={{ padding: "14px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {quickActions.map(action => (
                  <button key={action.nav} onClick={() => onNav(action.nav)}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: C.surface2, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontFamily: sans, fontSize: 12, color: C.textBright, fontWeight: 600, transition: "all 0.1s", textAlign: "left" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.cyan; e.currentTarget.style.color = C.cyan; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textBright; }}>
                    {action.label}
                    <ChevronDown size={12} style={{ transform: "rotate(-90deg)" }} />
                  </button>
                ))}
              </div>
            </div>
          </Panel>

          {/* Task breakdown */}
          <Panel title="By Priority" icon={AlertTriangle}>
            <div style={{ padding: "16px 18px" }}>
              {['critical', 'high', 'medium', 'low'].map(p => {
                const total = tasks.filter(t => t.priority === p).length;
                const done2 = tasks.filter(t => t.priority === p && t.done).length;
                if (total === 0) return null;
                return (
                  <div key={p} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <span style={{ fontFamily: mono, fontSize: 9, width: 60, color: priorityColor[p], letterSpacing: "0.08em" }}>{p.toUpperCase()}</span>
                    <div style={{ flex: 1, height: 5, background: C.surface2, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${total > 0 ? (done2 / total) * 100 : 0}%`, background: priorityColor[p], borderRadius: 3, transition: "width 0.4s" }} />
                    </div>
                    <Mono size={9} color={C.textDim}>{done2}/{total}</Mono>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: PLACEHOLDER
// ─────────────────────────────────────────────

function PlaceholderPage({ title, icon: Icon, onBack }) {
  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>{title}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 300, gap: 16, background: C.surface, borderRadius: 8, border: `1px solid ${C.border}` }}>
        <Icon size={32} color={C.border2} strokeWidth={1} />
        <Mono size={10} color={C.textDim}>NOT IMPLEMENTED YET</Mono>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [dark, setDark] = useState(true);
  const [role, setRole] = useState(null);
  applyTheme(dark);

  const socket = useSocket();
  const { containers, loading: lcont } = useContainers(socket);
  const { agents, loading: lagents }   = useAgents(socket);
  const { vulnerabilities, loading: lv } = useVulnerabilities();
  const { alerts, loading: la, acknowledge, acknowledgeAll } = useAlerts(socket);
  const { threats }                    = useNetworkThreats(socket);
  const { compliance, loading: lcomp } = useCompliance();
  const { stats, loading: ls }         = useStats();
  const { scans, loading: lsc }        = useScanHistory();

  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (!ROLES[newRole].nav.includes(activeNav)) setActiveNav("dashboard");
  };

  // ── Export report ──────────────────────────
  const handleExport = async () => {
    const now = new Date();
    const fmt = (d) => new Date(d).toLocaleString();

    let auditEvents = [];
    try {
      const r = await fetch('http://localhost:3002/api/audit');
      auditEvents = await r.json();
    } catch { /* skip */ }

    const onlineAgents = agents.filter(a => a.status === 'online');
    const criticalVulns = vulnerabilities.filter(v => v.severity === 'critical');
    const highVulns = vulnerabilities.filter(v => v.severity === 'high');
    const activeAlerts = alerts.filter(a => !a.acknowledged);

    // Load jsPDF and html2canvas from CDN
    const loadScript = (src) => new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });

    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');

    const { jsPDF } = window.jspdf;

    // Build a hidden div with report content
    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed; left: -9999px; top: 0;
      width: 794px; background: white;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: #0f172a; padding: 40px;
    `;

    const badge = (sev) => {
      const colors = { critical: '#e11d48', high: '#d97706', medium: '#0284c7', low: '#059669', info: '#0284c7', warning: '#d97706' };
      const c = colors[sev] || '#64748b';
      return `<span style="display:inline-block;font-size:9px;font-family:monospace;font-weight:700;padding:2px 7px;border-radius:3px;letter-spacing:0.1em;background:${c}22;color:${c};border:1px solid ${c}55">${(sev||'').toUpperCase()}</span>`;
    };

    const section = (title, count, tableHtml) => `
      <div style="margin-bottom:24px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <span style="font-size:13px;font-weight:600">${title}</span>
          <span style="font-size:10px;font-family:monospace;color:#64748b;background:#e2e8f0;padding:2px 8px;border-radius:10px">${count}</span>
        </div>
        ${tableHtml}
      </div>`;

    const table = (headers, rows) => rows.length === 0
      ? `<div style="padding:24px;text-align:center;font-family:monospace;font-size:11px;color:#94a3b8">NO DATA</div>`
      : `<table style="width:100%;border-collapse:collapse">
          <thead><tr>${headers.map(h => `<th style="font-size:9px;font-family:monospace;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;text-align:left;padding:8px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;font-weight:400">${h}</th>`).join('')}</tr></thead>
          <tbody>${rows.map(cells => `<tr>${cells.map((c,i) => `<td style="padding:8px 12px;font-size:11px;border-bottom:1px solid #f1f5f9;vertical-align:top${i===0?';white-space:nowrap':''}">${c}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>`;

    const compScore = stats?.complianceScore;
    const scoreColor = compScore >= 85 ? '#059669' : compScore >= 60 ? '#d97706' : '#e11d48';

    container.innerHTML = `
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:28px 32px;background:#0d1117;border-radius:10px;margin-bottom:28px">
        <div>
          <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:4px">ContainerShield Security Report</div>
          <div style="font-size:10px;color:#7c93ad;font-family:monospace;letter-spacing:0.1em">GENERATED ${now.toLocaleString().toUpperCase()}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:34px;font-weight:700;color:#34d399;font-family:monospace">${compScore != null ? compScore + '%' : '—'}</div>
          <div style="font-size:10px;color:#7c93ad;font-family:monospace;letter-spacing:0.1em;margin-top:2px">COMPLIANCE SCORE</div>
        </div>
      </div>

      <!-- Stat cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:28px">
        ${[
          { label: 'Containers Active', value: stats?.totalContainers ?? containers.length, color: '#0284c7' },
          { label: 'Critical Vulns',    value: criticalVulns.length,                        color: '#e11d48' },
          { label: 'Active Alerts',     value: activeAlerts.length,                          color: '#d97706' },
          { label: 'Agents Online',     value: `${onlineAgents.length}/${agents.length}`,    color: '#059669' },
        ].map(s => `
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;border-top:3px solid ${s.color}">
            <div style="font-size:28px;font-weight:700;color:${s.color};font-family:monospace;margin-bottom:4px">${s.value}</div>
            <div style="font-size:9px;color:#64748b;font-family:monospace;letter-spacing:0.15em;text-transform:uppercase">${s.label}</div>
          </div>`).join('')}
      </div>

      ${section('Monitoring Agents', `${agents.length} AGENTS`,
        table(
          ['Agent', 'Status', 'Containers', 'CPUs', 'Memory', 'Last Seen'],
          agents.map(a => [
            `<strong>${a.agentLabel}</strong><br><span style="font-family:monospace;font-size:10px;color:#64748b">${a.agentId}</span>`,
            badge(a.status === 'online' ? 'low' : 'critical') + ' ' + a.status.toUpperCase(),
            a.containerCount ?? '—',
            a.hostInfo?.cpuCount ?? '—',
            a.hostInfo?.totalMemMb ? Math.round(a.hostInfo.totalMemMb / 1024) + ' GB' : '—',
            `<span style="font-family:monospace;font-size:10px">${a.lastSeen ? fmt(a.lastSeen) : '—'}</span>`,
          ])
        )
      )}

      ${section(`Active Alerts`, `${activeAlerts.length} ACTIVE`,
        table(
          ['Severity', 'Title', 'Description', 'Time'],
          activeAlerts.map(a => [badge(a.severity), `<strong>${a.title}</strong>`, a.description, `<span style="font-family:monospace;font-size:10px">${fmt(a.timestamp)}</span>`])
        )
      )}

      ${section(`Network Threats`, `${threats.length} DETECTED`,
        table(
          ['Severity', 'Title', 'Description', 'Container'],
          threats.map(t => [badge(t.severity), `<strong>${t.title}</strong>`, t.description, `<span style="font-family:monospace;font-size:10px">${t.source?.replace('network-agent:','') || '—'}</span>`])
        )
      )}

      ${section(`Vulnerabilities`, `${vulnerabilities.length} TOTAL · ${criticalVulns.length} CRITICAL`,
        table(
          ['Severity', 'CVE', 'Container', 'Package', 'Version', 'CVSS'],
          vulnerabilities.slice(0, 40).map(v => [badge(v.severity), `<span style="font-family:monospace;font-size:10px">${v.cveId}</span>`, v.container, v.package, `<span style="font-family:monospace;font-size:10px">${v.version}</span>`, v.cvss ?? '—'])
        )
      )}

      ${section(`Compliance — CIS Docker Benchmark 1.6.0`, compScore != null ? compScore + '% OVERALL' : 'NOT SCANNED',
        compliance.length === 0
          ? `<div style="padding:24px;text-align:center;font-family:monospace;font-size:11px;color:#94a3b8">OPEN COMPLIANCE PAGE FIRST</div>`
          : table(
              ['Category', 'Standard', 'Score', 'Passed', 'Failed'],
              compliance.map(c => {
                const col = c.passPct >= 85 ? '#059669' : c.passPct >= 60 ? '#d97706' : '#e11d48';
                return [
                  `<strong>${c.name}</strong>`,
                  `<span style="font-family:monospace;font-size:10px">${c.standard}</span>`,
                  `<span style="color:${col};font-weight:700;font-family:monospace">${c.passPct}%</span>`,
                  `<span style="color:#059669;font-family:monospace">${c.passCount}</span>`,
                  `<span style="color:#e11d48;font-family:monospace">${c.totalCount - c.passCount}</span>`,
                ];
              })
            )
      )}

      ${section(`Audit Log`, `${auditEvents.length} EVENTS`,
        table(
          ['Time', 'Type', 'Severity', 'Title', 'Source'],
          auditEvents.slice(0, 60).map(e => [
            `<span style="font-family:monospace;font-size:10px">${fmt(e.timestamp)}</span>`,
            `<span style="font-family:monospace;font-size:10px">${e.type}</span>`,
            badge(e.severity),
            e.title,
            `<span style="font-family:monospace;font-size:10px">${e.source || '—'}</span>`,
          ])
        )
      )}

      <div style="text-align:center;margin-top:32px;font-family:monospace;font-size:10px;color:#94a3b8;letter-spacing:0.08em">
        CONTAINERSHIELD SECURITY PLATFORM · ${now.toISOString()} · CONFIDENTIAL
      </div>
    `;

    document.body.appendChild(container);

    try {
      const canvas = await window.html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: 794,
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4' });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * pageW) / canvas.width;

      let y = 0;
      let remaining = imgH;

      while (remaining > 0) {
        const sliceH = Math.min(pageH, remaining);
        const sliceCanvas = document.createElement('canvas');
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = (sliceH / imgH) * canvas.height;
        const ctx = sliceCanvas.getContext('2d');
        ctx.drawImage(canvas, 0, (y / imgH) * canvas.height, canvas.width, sliceCanvas.height, 0, 0, canvas.width, sliceCanvas.height);
        const sliceImg = sliceCanvas.toDataURL('image/png');
        if (y > 0) pdf.addPage();
        pdf.addImage(sliceImg, 'PNG', 0, 0, imgW, sliceH);
        y += sliceH;
        remaining -= sliceH;
      }

      pdf.save(`containershield-report-${now.toISOString().slice(0, 10)}.pdf`);
    } finally {
      document.body.removeChild(container);
    }
  };

  const PAGE_TITLES = {
    reports:    { title: "Reports",        Icon: FileText },
    config:     { title: "Configuration",  Icon: Settings },
    team:       { title: "Team",           Icon: Users },
  };

  function renderPage() {
    switch (activeNav) {
      case "dashboard":
        return <DashboardPage containers={containers} vulnerabilities={vulnerabilities} alerts={alerts} acknowledgeAll={acknowledgeAll} acknowledge={acknowledge} threats={threats} scans={scans} compliance={compliance} stats={stats} ls={ls} lv={lv} lcont={lcont} la={la} lcomp={lcomp} lsc={lsc} onNav={setActiveNav} />;
      case "compliance":
        return <CompliancePage compliance={compliance} loading={lcomp} onBack={() => setActiveNav("dashboard")} />;
      case "alerts":
        return <AlertsPage alerts={alerts} loading={la} onBack={() => setActiveNav("dashboard")} onAcknowledge={acknowledge} onAcknowledgeAll={acknowledgeAll} />;
      case "vulns":
        return <VulnsPage vulnerabilities={vulnerabilities} loading={lv} onBack={() => setActiveNav("dashboard")} />;
      case "monitor":
        return <MonitorPage containers={containers} agents={agents} loading={lcont} onBack={() => setActiveNav("dashboard")} />;
      case "secrets":
        return <SecretsPage onBack={() => setActiveNav("dashboard")} />;
      case "audit":
        return <AuditPage socket={socket} onBack={() => setActiveNav("dashboard")} />;
      case "tasks":
        return <TasksPage role={role} onBack={() => setActiveNav("dashboard")} onNav={setActiveNav} />;
      case "team":
        return <TeamPage onBack={() => setActiveNav("dashboard")} />;
      case "config":
        return <ConfigPage onBack={() => setActiveNav("dashboard")} />;
      case "reports":
        return <ReportsPage containers={containers} vulnerabilities={vulnerabilities} alerts={alerts} compliance={compliance} stats={stats} scans={scans} ls={ls} lv={lv} la={la} lcomp={lcomp} lsc={lsc} onBack={() => setActiveNav("dashboard")} onExport={handleExport} />;
      default:
        const p = PAGE_TITLES[activeNav];
        return p ? <PlaceholderPage title={p.title} icon={p.Icon} onBack={() => setActiveNav("dashboard")} /> : null;
    }
  }

  if (!role) return <LoginScreen onLogin={setRole} />;

  return (
    <div style={{ display: "flex", background: C.bg, color: C.text, minHeight: "100vh", fontFamily: sans }}>
      <Sidebar active={activeNav} onNav={setActiveNav} role={role} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar
          clusterName={agents.length > 0 ? `${agents.filter(a => a.status === 'online').length}/${agents.length} agents online` : null}
          containerCount={containers.length}
          alertCount={alerts.filter(a => !a.acknowledged).length}
          alerts={alerts}
          connected={socket.connected}
          dark={dark}
          onToggleDark={() => setDark(d => !d)}
          onScan={() => setActiveNav("vulns")}
          onExport={handleExport}
          role={role}
          onRoleChange={handleRoleChange}
          onAcknowledge={acknowledge}
          onAcknowledgeAll={acknowledgeAll}
        />
        {renderPage()}
      </div>
    </div>
  );
}