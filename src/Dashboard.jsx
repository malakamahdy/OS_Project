import { useState, useEffect, useRef } from "react";
import {
  Shield, Activity, AlertTriangle, CheckCircle,
  Search, Bell, Download, Play, Settings, Users, FileText,
  Lock, Box, Clock, Cpu, Database,
  XCircle, AlertCircle, Info, Layers, Terminal,
  List, ChevronLeft, Wifi, WifiOff, Network, Sun, Moon,
  ChevronDown, ClipboardList, User, Castle
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

// ─────────────────────────────────────────────────────────────────────────────
// DATA HOOKS
// Each hook owns one slice of backend data. They all follow the same pattern:
// fetch on mount, listen for Socket.io updates, fall back to polling every N
// seconds in case the socket misses something. The socket always wins for speed.
// ─────────────────────────────────────────────────────────────────────────────

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
  const [socketUpdateCount, setSocketUpdateCount] = useState(0);
  const load = () => {
    fetch('http://localhost:3002/api/alerts')
      .then(res => res.json())
      .then(data => { setAlerts(data); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => {
    load();
    socket.on('alerts:update', data => {
      setAlerts(data);
      setLoading(false);
      setSocketUpdateCount(c => c + 1);
    });
  }, []);
  const acknowledge    = (id) => fetch(`http://localhost:3002/api/alerts/${id}/acknowledge`, { method: 'POST' }).then(load);
  const acknowledgeAll = ()   => fetch('http://localhost:3002/api/alerts/acknowledge-all',    { method: 'POST' }).then(load);
  return { alerts, loading, error: null, acknowledge, acknowledgeAll, socketUpdateCount };
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
  const [loading, setLoading] = useState(false);
  // Not auto-fetched on mount — triggered manually via the RUN SCAN button.
  // This avoids hammering Trivy every time the page loads or the component remounts.
  const scan = () => {
    setLoading(true);
    fetch('http://localhost:3002/api/vulnerabilities')
      .then(res => res.json())
      .then(data => { setVulnerabilities(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  };
  return { vulnerabilities, loading, scan };
}

function useCompliance() {
  const [compliance, setCompliance] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const load = () => fetch('http://localhost:3002/api/compliance').then(r => r.json()).then(d => { setCompliance(d.results || []); setLoading(false); }).catch(() => setLoading(false));
    load();
    // Compliance is expensive (Trivy CIS benchmark against 3 images) — run once
    // on mount then refresh every 10 minutes in the background, not every 60s.
    const interval = setInterval(load, 600000);
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

function useScanHistory(socket) {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('http://localhost:3002/api/scan-history')
      .then(r => r.json())
      .then(d => { setScans(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
    socket.on('scan:history', d => { setScans(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);
  return { scans, loading };
}

function useFaultStatus(socket) {
  const [faultStatus, setFaultStatus] = useState({ active: [], recent: [], networkAgentFallback: false, fallbackAgent: null });
  useEffect(() => {
    fetch('http://localhost:3002/api/fault-status').then(r => r.json()).then(setFaultStatus).catch(() => {});
    socket.on('fault:status', setFaultStatus);
    const interval = setInterval(() => {
      fetch('http://localhost:3002/api/fault-status').then(r => r.json()).then(setFaultStatus).catch(() => {});
    }, 10000);
    return () => clearInterval(interval);
  }, []);
  return faultStatus;
}

function useLLMAnalyses(socket) {
  const [analyses, setAnalyses] = useState([]);
  useEffect(() => {
    fetch('http://localhost:3002/api/llm-analyses').then(r => r.json()).then(d => setAnalyses(Array.isArray(d) ? d : [])).catch(() => {});
    socket.on('llm:analyses', d => setAnalyses(Array.isArray(d) ? d : []));
    const interval = setInterval(() => {
      fetch('http://localhost:3002/api/llm-analyses').then(r => r.json()).then(d => setAnalyses(Array.isArray(d) ? d : [])).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);
  return analyses;
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
    socket.on('alerts:update', () => load());
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  return { events, loading };
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS + THEME
// Two themes: dark (default) and warm beige/cream light mode.
// C is the global theme object — applyTheme() updates it and also refreshes
// TH/TD table styles since they reference C values.
// ─────────────────────────────────────────────────────────────────────────────

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

// PRIMITIVES

// ─────────────────────────────────────────────────────────────────────────────
// UI PRIMITIVES
// Small reusable building blocks used throughout the dashboard.
// Mono = monospace text, SeverityBadge = colored CRITICAL/HIGH/etc label,
// HealthDot = green/amber/red circle, Sparkline = mini CPU/memory chart,
// Panel = bordered card container, StatCard = top-level metric card.
// ─────────────────────────────────────────────────────────────────────────────

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

// Animates a number counting up from 0 when the value changes
function CountUpNumber({ value, duration = 900 }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      let frameId, startTime;
      const animate = (ts) => {
        if (!startTime) startTime = ts;
        const progress = Math.min((ts - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(value * eased));
        if (progress < 1) frameId = requestAnimationFrame(animate);
      };
      setDisplay(0);
      frameId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(frameId);
    }
    if (typeof value === 'string') {
      const match = value.trim().match(/^(-?\d+(?:\.\d+)?)%$/);
      if (match) {
        const final = Number(match[1]);
        let frameId, startTime;
        const animate = (ts) => {
          if (!startTime) startTime = ts;
          const progress = Math.min((ts - startTime) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          setDisplay(`${Math.round(final * eased)}%`);
          if (progress < 1) frameId = requestAnimationFrame(animate);
        };
        setDisplay('0%');
        frameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(frameId);
      }
    }
    setDisplay(value);
  }, [value, duration]);
  return <>{display ?? '—'}</>;
}

// Toast alert notifications — appear top-right when new alerts come in
function ToastNotifications({ toasts, onClose }) {
  return (
    <div style={{ position: "fixed", top: 76, right: 24, zIndex: 120, display: "flex", flexDirection: "column", gap: 10, pointerEvents: "none" }}>
      {toasts.map(toast => {
        const color = ALERT_COLOR[toast.severity] || C.cyan;
        const Icon  = ALERT_ICON[toast.severity]  || Info;
        return (
          <div key={toast.id} style={{ width: 340, background: C.surface, border: `1px solid ${C.border2}`, borderLeft: `3px solid ${color}`, borderRadius: 8, boxShadow: "0 14px 32px rgba(0,0,0,0.28)", overflow: "hidden", pointerEvents: "auto" }}>
            <div style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                <Icon size={15} color={color} strokeWidth={1.7} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 700, color: C.textBright, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{toast.title}</div>
                    <span style={{ fontFamily: mono, fontSize: 8, color, letterSpacing: "0.12em", background: `${color}18`, border: `1px solid ${color}44`, padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>{(toast.severity || 'info').toUpperCase()}</span>
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 11, color: C.text, lineHeight: 1.45, marginBottom: 4 }}>{toast.description}</div>
                  <Mono size={9} color={C.textDim}>{toast.source ? `SOURCE: ${toast.source}` : 'SOURCE: SYSTEM'}</Mono>
                </div>
                <button onClick={() => onClose(toast.id)} style={{ background: "transparent", border: "none", color: C.textDim, cursor: "pointer", padding: 0, flexShrink: 0 }}>
                  <XCircle size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
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

function StatCard({ label, value, accent, icon: Icon, animated = false }) {
  return (
    <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "22px 20px", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${accent}, transparent)` }} />
      <div style={{ position: "absolute", bottom: -8, right: -8, opacity: 0.06 }}><Icon size={72} strokeWidth={1} color={accent} /></div>
      <Label>{label}</Label>
      <div style={{ fontSize: 36, fontWeight: 700, fontFamily: mono, color: accent, lineHeight: 1, marginBottom: 4 }}>
        {animated ? <CountUpNumber value={value} /> : (value ?? '—')}
      </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// VULNERABILITY TABLE
// Clickable rows that expand to show full CVE details pulled from Trivy:
// description, fix version, published date, and reference links.
// ─────────────────────────────────────────────────────────────────────────────

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

// ROLES

// ─────────────────────────────────────────────────────────────────────────────
// ROLE-BASED ACCESS CONTROL (RBAC)
// Three roles: Admin (full access), Analyst (compliance/audit only),
// DevOps (monitoring/alerts only). Each role has its own nav allowlist,
// task list, and description. Switching roles is done via the topbar dropdown —
// no page reload needed, just a state update that re-filters the sidebar.
// ─────────────────────────────────────────────────────────────────────────────

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

// ─────────────────────────────────────────────────────────────────────────────
// FAULT BANNER
// Shows at the top of every page when something is actively wrong.
// The network agent failover banner is the most prominent — bright yellow,
// tells you exactly which agent stepped in to cover. Other fault events
// show below it in a collapsible red panel.
// ─────────────────────────────────────────────────────────────────────────────

function FaultBanner({ faultStatus }) {
  const { active, networkAgentFallback, fallbackAgent } = faultStatus;
  if (!networkAgentFallback && active.length === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      <style>{`
        @keyframes fault-pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
        @keyframes slide-in { from{transform:translateY(-100%);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>

      {/* Network agent failover banner — most prominent */}
      {networkAgentFallback && (
        <div style={{ background: `linear-gradient(90deg, ${C.amber}22, ${C.amber}12)`, borderBottom: `2px solid ${C.amber}`, padding: "10px 28px", display: "flex", alignItems: "center", gap: 12, animation: "slide-in 0.3s ease" }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.amber, animation: "fault-pulse 1.5s ease-in-out infinite", flexShrink: 0 }} />
          <AlertTriangle size={14} color={C.amber} strokeWidth={2} />
          <div style={{ flex: 1 }}>
            <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.amber }}>NETWORK AGENT OFFLINE — </span>
            <span style={{ fontFamily: sans, fontSize: 13, color: C.text }}>
              {fallbackAgent} is handling network security monitoring until Network-Intrusion-Detector recovers.
            </span>
          </div>
          <span style={{ fontFamily: mono, fontSize: 9, padding: "3px 8px", background: `${C.amber}22`, border: `1px solid ${C.amber}55`, color: C.amber, borderRadius: 3, letterSpacing: "0.1em", flexShrink: 0 }}>FAILOVER ACTIVE</span>
        </div>
      )}

      {/* Active fault events */}
      {active.filter(e => e.type !== 'network_agent_offline').map(e => (
        <div key={e.id} style={{ background: e.severity === 'critical' ? `${C.red}15` : `${C.amber}12`, borderBottom: `1px solid ${e.severity === 'critical' ? C.red + '55' : C.amber + '44'}`, padding: "8px 28px", display: "flex", alignItems: "center", gap: 12, animation: "slide-in 0.3s ease" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: e.severity === 'critical' ? C.red : C.amber, animation: "fault-pulse 1s ease-in-out infinite", flexShrink: 0 }} />
          <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: e.severity === 'critical' ? C.red : C.amber }}>{e.title}</span>
          <span style={{ fontFamily: sans, fontSize: 11, color: C.textDim, flex: 1 }}>{e.description}</span>
          <Mono size={9} color={C.textDim}>{new Date(e.timestamp).toLocaleTimeString()}</Mono>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// TOAST NOTIFICATIONS

// SIDEBAR

// ─────────────────────────────────────────────────────────────────────────────
// NAVIGATION + SIDEBAR
// NAV_ALL defines every possible sidebar item. The Sidebar component filters
// it down to only the pages the current role is allowed to access.
// ─────────────────────────────────────────────────────────────────────────────

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
            <Castle size={16} color={C.cyan} strokeWidth={1.5} />
          </div>
          <div>
            <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.textBright, letterSpacing: "0.01em" }}>Citadel</div>
            <Mono size={8} color={C.textDim}>CONTAINER SECURITY</Mono>
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

// TOPBAR

// ─────────────────────────────────────────────────────────────────────────────
// TOPBAR
// The sticky header. Contains: live/offline indicator, agent count, date,
// role badge (with dropdown to switch perspectives), dark/light toggle,
// export PDF button, run vulnerability scan button, and the alerts bell.
// ─────────────────────────────────────────────────────────────────────────────

const ALERT_ICON_MAP  = { critical: XCircle, warning: AlertCircle, info: Info };
const ALERT_COLOR_MAP = { critical: C.red,   warning: C.amber,     info: C.cyan };

function Topbar({ clusterName, containerCount, alertCount, alerts, connected, dark, onToggleDark, onScan, onExport, onAcknowledge, onAcknowledgeAll, role, onRoleChange, secretsScanning }) {
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

        {secretsScanning && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", background: `${C.cyan}12`, border: `1px solid ${C.cyan}44`, borderRadius: 5 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.cyan, animation: "blink 1s ease-in-out infinite" }} />
            <Mono size={9} color={C.cyan}>SECRETS SCANNING…</Mono>
          </div>
        )}

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
// FAULT STATUS PANEL
// ─────────────────────────────────────────────

function NetworkAgentFallbackBanner({ fallbackAgent }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", background: `${C.amber}18`, border: `1px solid ${C.amber}66`, borderRadius: 8, marginBottom: 16, animation: "pulse-border 2s ease-in-out infinite" }}>
      <style>{`@keyframes pulse-border { 0%,100%{border-color:${C.amber}66} 50%{border-color:${C.amber}cc} }`}</style>
      <AlertTriangle size={16} color={C.amber} strokeWidth={2} style={{ flexShrink: 0 }} />
      <div style={{ flex: 1 }}>
        <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.amber }}>Network Agent Offline — Failover Active</span>
        <span style={{ fontFamily: sans, fontSize: 12, color: C.text, marginLeft: 8 }}>
          {fallbackAgent} is handling network security monitoring until Network-Intrusion-Detector recovers.
        </span>
      </div>
      <span style={{ fontFamily: mono, fontSize: 9, padding: "3px 8px", borderRadius: 3, background: `${C.amber}22`, color: C.amber, border: `1px solid ${C.amber}55`, letterSpacing: "0.08em", flexShrink: 0 }}>
        AUTONOMOUS FAILOVER
      </span>
    </div>
  );
}

function FaultStatusPanel({ faultStatus }) {
  const { active, recent, networkAgentFallback, fallbackAgent } = faultStatus;
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Auto-clear dismissed state when new faults appear
  useEffect(() => { if (active.length > 0) setDismissed(false); }, [active.length]);

  if ((active.length === 0 && !networkAgentFallback) || dismissed) return null;

  const sevColor = { critical: C.red, warning: C.amber, info: C.cyan };

  return (
    <div style={{ marginBottom: 16 }}>
      {networkAgentFallback && <NetworkAgentFallbackBanner fallbackAgent={fallbackAgent} />}
      {active.length > 0 && (
        <div style={{ background: C.surface, border: `1px solid ${C.red}55`, borderRadius: 8, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", background: `${C.red}08` }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, boxShadow: `0 0 8px ${C.red}` }} />
            <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.red, flex: 1 }}>
              {active.length} Active Fault Event{active.length > 1 ? 's' : ''} — Autonomous Correction Running
            </span>
            <button onClick={() => setExpanded(e => !e)} style={{ fontFamily: mono, fontSize: 9, color: C.textDim, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 8px", cursor: "pointer" }}>
              {expanded ? "▲ HIDE" : "▼ SHOW"}
            </button>
            <button onClick={() => setDismissed(true)} style={{ fontFamily: mono, fontSize: 9, color: C.textDim, background: "transparent", border: `1px solid ${C.border}`, borderRadius: 3, padding: "2px 8px", cursor: "pointer" }}>
              ✕
            </button>
          </div>
          {expanded && (
            <div>
              {active.map(e => (
                <div key={e.id} style={{ display: "flex", gap: 12, padding: "12px 18px", borderTop: `1px solid ${C.border}`, alignItems: "flex-start" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: sevColor[e.severity] || C.textDim, marginTop: 5, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright, marginBottom: 2 }}>{e.title}</div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: C.text, lineHeight: 1.5 }}>{e.description}</div>
                    <Mono size={9} color={C.textDim} style={{ marginTop: 4 }}>{new Date(e.timestamp).toLocaleTimeString()}</Mono>
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 8, padding: "2px 7px", borderRadius: 3, background: `${sevColor[e.severity] || C.textDim}18`, color: sevColor[e.severity] || C.textDim, border: `1px solid ${sevColor[e.severity] || C.textDim}44`, flexShrink: 0 }}>
                    {e.severity?.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// LLM ANALYSIS PANEL
// Shows AI remediation recommendations from agents

// ─────────────────────────────────────────────────────────────────────────────
// LLM ANALYSIS PANEL
// When agents detect a container misbehaving (CPU spike, restart loop,
// memory pressure), they call OpenAI and send the analysis back here.
// This panel shows the AI's remediation recommendation per container.
// ─────────────────────────────────────────────────────────────────────────────

function LLMAnalysisPanel({ analyses }) {
  if (!analyses || analyses.length === 0) return null;

  return (
    <Panel title="AI Remediation Advisor" icon={Activity} style={{ marginBottom: 16 }}>
      {analyses.map(a => (
        <div key={a.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}
          onMouseEnter={e => e.currentTarget.style.background = C.surface2}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Mono size={11} color={C.cyan} style={{ fontWeight: 700 }}>{a.containerName}</Mono>
            <Mono size={9} color={C.textDim}>via {a.agentLabel}</Mono>
            <Mono size={9} color={C.textDim} style={{ marginLeft: "auto" }}>{new Date(a.timestamp).toLocaleTimeString()}</Mono>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {(a.issues || []).map((issue, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <AlertTriangle size={10} color={C.amber} strokeWidth={2} />
                <Mono size={10} color={C.amber}>{issue}</Mono>
              </div>
            ))}
          </div>
          <div style={{ background: `${C.cyan}08`, border: `1px solid ${C.cyan}33`, borderRadius: 6, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ width: 18, height: 18, borderRadius: 4, background: `${C.cyan}18`, border: `1px solid ${C.cyan}44`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}>
              <span style={{ fontFamily: mono, fontSize: 8, color: C.cyan, fontWeight: 700 }}>AI</span>
            </div>
            <div style={{ fontFamily: sans, fontSize: 12, color: C.text, lineHeight: 1.6 }}>{a.analysis}</div>
          </div>
        </div>
      ))}
    </Panel>
  );
}

// PAGE: DASHBOARD

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: DASHBOARD (home)
// The main landing page. Shows stat cards, network threats, container health,
// top vulnerabilities, live alerts, scan history, and compliance summary.
// ─────────────────────────────────────────────────────────────────────────────

function DashboardPage({ containers, vulnerabilities, alerts, acknowledgeAll, acknowledge, threats, scans, compliance, stats, ls, lv, lcont, la, lcomp, lsc, onNav, faultStatus, llmAnalyses }) {
  const previewVulns = vulnerabilities.slice(0, 5);

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>

      {/* FAULT STATUS — always visible at the top when active */}
      <FaultStatusPanel faultStatus={faultStatus || { active: [], recent: [], networkAgentFallback: false }} />

      {/* LLM ANALYSIS — shown when AI has remediation advice */}
      <LLMAnalysisPanel analyses={llmAnalyses} />

      {/* STAT CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
        <StatCard label="Containers Active"       value={ls ? "…" : stats?.totalContainers} icon={Box} accent={C.cyan} animated />
        <StatCard label="Critical Vulnerabilities" value={lv ? "…" : vulnerabilities.filter(v => v.severity === "critical").length || null} icon={AlertTriangle} accent={C.red} animated />
        <StatCard label="Compliance Score"         value={ls ? "…" : stats?.complianceScore != null ? `${stats.complianceScore}%` : null} icon={CheckCircle} accent={C.green} animated />
        <StatCard label="Active Alerts"            value={ls ? "…" : stats?.threatsBlocked} icon={Shield} accent={C.amber} animated />
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

          <Panel title="Scan History" icon={Terminal} action="VIEW ALL" onAction={() => onNav("audit")}>
            {lsc ? <Loading /> : scans.length === 0 ? <EmptyState icon={Terminal} message="NO SCANS YET — RUN A SCAN TO SEE HISTORY" /> :
              scans.slice(0, 5).map(s => {
                const typeColor = { vulnerability: C.red, compliance: C.green, secrets: C.amber }[s.type] || C.textDim;
                const typeLabel = { vulnerability: 'VULN', compliance: 'COMPLIANCE', secrets: 'SECRETS' }[s.type] || s.type.toUpperCase();
                return (
                  <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = C.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontFamily: mono, fontSize: 8, padding: "2px 7px", borderRadius: 3, background: `${typeColor}15`, color: typeColor, border: `1px solid ${typeColor}44`, flexShrink: 0 }}>{typeLabel}</span>
                    <div style={{ flex: 1 }}>
                      <Mono size={11} color={C.textBright}>{s.targetCount} image{s.targetCount !== 1 ? 's' : ''} scanned</Mono>
                      <div style={{ marginTop: 2 }}><Mono size={9}>{s.timestamp ? new Date(s.timestamp).toLocaleString() : "—"}</Mono></div>
                    </div>
                    <Mono size={10} color={s.resultCount > 0 ? typeColor : C.green}>
                      {s.resultCount > 0 ? `${s.resultCount} FOUND` : "CLEAN"}
                    </Mono>
                  </div>
                );
              })
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

      {/* LLM AI ANALYSIS — shown when analyses exist */}
      {llmAnalyses && llmAnalyses.length > 0 && (
        <div style={{ marginTop: 22 }}>
          <LLMAnalysisPanel analyses={llmAnalyses} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: VULNERABILITY SCANNER
// Runs Trivy against every running image. Results are sorted by severity.
// Rows expand to show full CVE description, fix version, and reference links.
// ─────────────────────────────────────────────────────────────────────────────

function VulnsPage({ vulnerabilities, loading, onBack, onScan }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? vulnerabilities : vulnerabilities.filter(v => v.severity === filter);

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${C.border2}`, color: C.text, borderRadius: 5, padding: "6px 12px", fontFamily: mono, fontSize: 10, cursor: "pointer" }}>
          <ChevronLeft size={12} /> BACK
        </button>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright }}>Vulnerability Scanner</div>
        <Mono size={10} color={C.textDim} style={{ marginLeft: "auto" }}>{vulnerabilities.length > 0 ? `${vulnerabilities.length} TOTAL FINDINGS` : "NOT YET SCANNED"}</Mono>
        <button onClick={onScan} disabled={loading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: `1px solid ${C.cyan}`, background: `${C.cyan}18`, color: C.cyan, borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, letterSpacing: "0.05em" }}>
          <Play size={11} strokeWidth={2} /> {loading ? "SCANNING…" : "RUN SCAN"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {["all", "critical", "high", "medium", "low"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ fontFamily: mono, fontSize: 9, padding: "5px 13px", borderRadius: 4, cursor: "pointer", letterSpacing: "0.1em", textTransform: "uppercase", background: filter === f ? `${C.cyan}18` : "transparent", color: filter === f ? C.cyan : C.textDim, border: `1px solid ${filter === f ? C.cyan : C.border}`, transition: "all 0.12s" }}>
            {f} {f !== "all" && `(${vulnerabilities.filter(v => v.severity === f).length})`}
          </button>
        ))}
      </div>

      <Panel title="All Vulnerabilities" icon={Search}>
        {loading ? <Loading /> : filtered.length === 0 && vulnerabilities.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 280, gap: 16 }}>
              <Search size={32} color={C.border2} strokeWidth={1} />
              <div style={{ fontFamily: sans, fontSize: 14, color: C.textDim }}>No scan results yet</div>
              <button onClick={onScan} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 20px", border: `1px solid ${C.cyan}`, background: `${C.cyan}18`, color: C.cyan, borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
                <Play size={12} strokeWidth={2} /> RUN VULNERABILITY SCAN
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={Search} message="NO VULNERABILITIES MATCH THIS FILTER" />
          ) : <VulnTable rows={filtered} />}
      </Panel>
    </div>
  );
}

// PAGE: LIVE MONITOR

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: LIVE MONITOR
// Real-time view of all containers with CPU/memory sparklines.
// Also shows all three agents with their status, container count, and host info.
// RESTART / STOP / START buttons call the backend which calls Docker directly.
// ─────────────────────────────────────────────────────────────────────────────

function MonitorPage({ containers, agents, loading, onBack, faultStatus }) {
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

      {/* Fault status — prominently shown in Live Monitor */}
      <FaultStatusPanel faultStatus={faultStatus || { active: [], recent: [], networkAgentFallback: false }} />

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

// PAGE: ALERTS

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: ALERTS
// Shows all active (unacknowledged) alerts. Filterable by severity.
// Alerts are deduplicated by the backend — same title+source = one alert.
// ─────────────────────────────────────────────────────────────────────────────

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

// PAGE: COMPLIANCE

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: COMPLIANCE
// Runs CIS Docker Benchmark 1.6.0 via Trivy against up to 3 images.
// Groups checks into Image Security (4.x) and Container Runtime (5.x).
// Manual checks are excluded from the score — they need human review.
// ─────────────────────────────────────────────────────────────────────────────

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

// PAGE: SECRETS SCAN

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: SECRETS SCAN
// Uses Trivy's secret scanner to find hardcoded credentials in image layers.
// Runs in parallel with isolated Trivy cache dirs per image to avoid conflicts.
// State lives in the root component so switching tabs doesn't cancel the scan.
// ─────────────────────────────────────────────────────────────────────────────

function SecretsPage({ onBack, secrets, loading, scanned, onScan }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? secrets : secrets.filter(s => s.severity === filter);
  const scan = onScan;

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

// PAGE: AUDIT LOG

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: AUDIT LOG
// Permanent record of every security event: alerts created/resolved/dismissed,
// scans started, containers restarted, agents recovered, autonomous restarts.
// Capped at 500 events in the backend. Refreshes on every alert socket update.
// ─────────────────────────────────────────────────────────────────────────────

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

// PAGE: CONFIG

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: CONFIG
// UI for tweaking alert thresholds (CPU warn/crit, memory warn/crit, agent
// timeout). These are local to the session — not persisted to the backend yet.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  cpuWarning: 70, cpuCritical: 90,
  memoryWarning: 75, memoryCritical: 90,
  agentOfflineTimeout: 30,
};

function ConfigPage({ onBack }) {
  const [settings, setSettings] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const saveTimeoutRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    fetch('http://localhost:3002/api/config')
      .then(res => {
        if (!res.ok) throw new Error('Failed to load monitoring configuration');
        return res.json();
      })
      .then(data => {
        if (cancelled) return;
        setSettings({
          cpuWarning: data.cpuWarn,
          cpuCritical: data.cpuCrit,
          memoryWarning: data.memWarn,
          memoryCritical: data.memCrit,
          agentOfflineTimeout: Math.round((data.agentTimeoutMs || DEFAULT_CONFIG.agentOfflineTimeout * 1000) / 1000),
        });
        setError("");
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err.message || 'Failed to load monitoring configuration');
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const updateSetting = (key, value) => {
    setSettings(c => ({ ...c, [key]: Number(value) }));
    setSaved(false);
    setError("");
  };

  const toBackendConfig = (nextSettings) => ({
    cpuWarn: nextSettings.cpuWarning,
    cpuCrit: nextSettings.cpuCritical,
    memWarn: nextSettings.memoryWarning,
    memCrit: nextSettings.memoryCritical,
    agentTimeoutMs: nextSettings.agentOfflineTimeout * 1000,
  });

  const showSavedMessage = () => {
    setSaved(true);
    if (saveTimeoutRef.current) window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => setSaved(false), 2200);
  };

  const saveSettings = async () => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch('http://localhost:3002/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toBackendConfig(settings)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to save monitoring configuration');

      setSettings({
        cpuWarning: data.cpuWarn,
        cpuCritical: data.cpuCrit,
        memoryWarning: data.memWarn,
        memoryCritical: data.memCrit,
        agentOfflineTimeout: Math.round(data.agentTimeoutMs / 1000),
      });
      showSavedMessage();
    } catch (err) {
      setError(err.message || 'Failed to save monitoring configuration');
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    setSaving(true);
    setError("");
    setSaved(false);

    try {
      const response = await fetch('http://localhost:3002/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toBackendConfig(DEFAULT_CONFIG)),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to reset monitoring configuration');

      setSettings({
        cpuWarning: data.cpuWarn,
        cpuCritical: data.cpuCrit,
        memoryWarning: data.memWarn,
        memoryCritical: data.memCrit,
        agentOfflineTimeout: Math.round(data.agentTimeoutMs / 1000),
      });
      showSavedMessage();
    } catch (err) {
      setError(err.message || 'Failed to reset monitoring configuration');
    } finally {
      setSaving(false);
    }
  };

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
        <Mono size={10} color={C.textDim} style={{ marginLeft: "auto" }}>BACKEND CONNECTED</Mono>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <Panel title="Threshold Settings" icon={Settings}>
          <div style={{ padding: "18px" }}>
            {loading ? <Loading /> : <div style={{ display: "grid", gap: 14 }}>
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
            </div>}
          </div>
        </Panel>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Panel title="Actions" icon={Play}>
            <div style={{ padding: "18px" }}>
              <Label>Save Config</Label>
              <div style={{ fontFamily: sans, fontSize: 12, color: C.text, lineHeight: 1.5, marginBottom: 14 }}>Update backend monitoring thresholds used by alerting and the agent watchdog.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button onClick={saveSettings} disabled={loading || saving} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", border: `1px solid ${C.cyan}`, background: `${C.cyan}18`, color: C.cyan, borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: loading || saving ? "not-allowed" : "pointer", opacity: loading || saving ? 0.6 : 1, letterSpacing: "0.05em" }}>{saving ? "SAVING…" : "SAVE SETTINGS"}</button>
                <button onClick={resetDefaults} disabled={loading || saving} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", border: `1px solid ${C.border2}`, background: "transparent", color: C.text, borderRadius: 5, fontFamily: mono, fontSize: 10, cursor: loading || saving ? "not-allowed" : "pointer", opacity: loading || saving ? 0.6 : 1, letterSpacing: "0.05em" }}>RESET DEFAULTS</button>
              </div>
              <div style={{ minHeight: 18, marginTop: 10 }}>
                {saved && <Mono size={9} color={C.green}>SETTINGS SAVED TO BACKEND</Mono>}
                {error && <Mono size={9} color={C.red}>{error}</Mono>}
              </div>
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

// PAGE: REPORTS

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: REPORTS
// Executive security posture summary with PDF export. Uses jsPDF + html2canvas
// to render a hidden div into a multi-page PDF. Includes agents, alerts,
// threats, vulnerabilities, compliance, and the full audit log.
// ─────────────────────────────────────────────────────────────────────────────

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

// PAGE: TEAM

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: TEAM
// Shows the three roles, their responsibilities, and incident ownership matrix.
// Which team member owns what kind of security event (vulns vs downtime etc).
// ─────────────────────────────────────────────────────────────────────────────

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

// PAGE: MY TASKS

// ─────────────────────────────────────────────────────────────────────────────
// PAGE: MY TASKS
// Role-specific checklist showing what this user should do during a session.
// Each task has a priority, a GO→ button that navigates to the relevant page,
// and a checkbox. Progress bar fills as tasks are completed.
// ─────────────────────────────────────────────────────────────────────────────

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

// PAGE: PLACEHOLDER

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER PAGE
// Fallback for any nav key that doesn't have a real page yet.
// ─────────────────────────────────────────────────────────────────────────────

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

// ROOT

// ─────────────────────────────────────────────────────────────────────────────
// ROOT — Dashboard component
//
// This is the entry point. It owns all shared state:
//   - role + activeNav (RBAC + routing)
//   - dark mode
//   - secrets scan state (persists across tab changes)
//   - toast notifications (fires on new Socket.io alerts)
//   - PDF export logic (jsPDF + html2canvas, loaded from CDN on demand)
//
// All data hooks live here and are passed down to pages as props.
// ─────────────────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [dark, setDark] = useState(true);
  const [role, setRole] = useState("admin"); // default to admin, switch via dropdown
  const [toasts, setToasts]   = useState([]);
  const initializedAlertsRef  = useRef(false);
  const knownAlertIdsRef      = useRef(new Set());
  const toastTimersRef        = useRef({});
  applyTheme(dark);

  const socket = useSocket();
  const { containers, loading: lcont }   = useContainers(socket);
  const { agents, loading: lagents }     = useAgents(socket);
  const { vulnerabilities, loading: lv, scan: runVulnScan } = useVulnerabilities();
  const { alerts, loading: la, acknowledge, acknowledgeAll, socketUpdateCount } = useAlerts(socket);
  const { threats }                      = useNetworkThreats(socket);
  const { compliance, loading: lcomp }   = useCompliance();
  const { stats, loading: ls }           = useStats();
  const { scans, loading: lsc }          = useScanHistory(socket);
  const faultStatus                      = useFaultStatus(socket);
  const llmAnalyses                      = useLLMAnalyses(socket);

  const dismissToast = (id) => {
    if (toastTimersRef.current[id]) { clearTimeout(toastTimersRef.current[id]); delete toastTimersRef.current[id]; }
    setToasts(t => t.filter(x => x.id !== id));
  };

  // On first load, seed known IDs so we don't toast existing alerts
  useEffect(() => {
    if (!initializedAlertsRef.current && !la) {
      knownAlertIdsRef.current = new Set(alerts.map(a => a.id));
      initializedAlertsRef.current = true;
    }
  }, [alerts, la]);

  // Show a toast whenever a genuinely new alert arrives via Socket.io
  useEffect(() => {
    if (!initializedAlertsRef.current || socketUpdateCount === 0) return;
    const newAlerts = alerts.filter(a => !knownAlertIdsRef.current.has(a.id));
    knownAlertIdsRef.current = new Set(alerts.map(a => a.id));
    if (newAlerts.length === 0) return;
    const created = newAlerts.map(a => ({
      id:          `toast-${a.id}-${Date.now()}`,
      title:       a.title       || 'New Alert',
      severity:    a.severity    || 'info',
      source:      a.source      || 'system',
      description: a.description || 'Security event detected.',
    }));
    setToasts(t => [...created, ...t].slice(0, 5));
    created.forEach(toast => {
      toastTimersRef.current[toast.id] = setTimeout(() => {
        setToasts(t => t.filter(x => x.id !== toast.id));
        delete toastTimersRef.current[toast.id];
      }, 5000);
    });
  }, [alerts, socketUpdateCount]);

  useEffect(() => () => Object.values(toastTimersRef.current).forEach(clearTimeout), []);
  const handleRoleChange = (newRole) => {
    setRole(newRole);
    if (!ROLES[newRole].nav.includes(activeNav)) setActiveNav("dashboard");
  };

  // Secrets scan state lives at the root so it persists across tab changes
  const [secrets, setSecrets]               = useState([]);
  const [secretsLoading, setSecretsLoading] = useState(false);
  const [secretsScanned, setSecretsScanned] = useState(false);

  const runSecretsScan = () => {
    setSecretsLoading(true);
    fetch('http://localhost:3002/api/secrets')
      .then(res => res.json())
      .then(data => {
        const results = Array.isArray(data) ? data : [];
        setSecrets(results);
        setSecretsLoading(false);
        setSecretsScanned(true);
      })
      .catch(() => { setSecretsLoading(false); setSecretsScanned(true); });
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
          <div style="font-size:20px;font-weight:700;color:#f8fafc;margin-bottom:4px">Citadel Security Report</div>
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
        CITADEL CONTAINER SECURITY · ${now.toISOString()} · CONFIDENTIAL
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
        return <DashboardPage containers={containers} vulnerabilities={vulnerabilities} alerts={alerts} acknowledgeAll={acknowledgeAll} acknowledge={acknowledge} threats={threats} scans={scans} compliance={compliance} stats={stats} ls={ls} lv={lv} lcont={lcont} la={la} lcomp={lcomp} lsc={lsc} onNav={setActiveNav} faultStatus={faultStatus} llmAnalyses={llmAnalyses} />;
      case "compliance":
        return <CompliancePage compliance={compliance} loading={lcomp} onBack={() => setActiveNav("dashboard")} />;
      case "alerts":
        return <AlertsPage alerts={alerts} loading={la} onBack={() => setActiveNav("dashboard")} onAcknowledge={acknowledge} onAcknowledgeAll={acknowledgeAll} />;
      case "vulns":
        return <VulnsPage vulnerabilities={vulnerabilities} loading={lv} onScan={runVulnScan} onBack={() => setActiveNav("dashboard")} />;
      case "monitor":
        return <MonitorPage containers={containers} agents={agents} loading={lcont} onBack={() => setActiveNav("dashboard")} faultStatus={faultStatus} />;
      case "secrets":
        return <SecretsPage onBack={() => setActiveNav("dashboard")} secrets={secrets} loading={secretsLoading} scanned={secretsScanned} onScan={runSecretsScan} />;
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
          onScan={() => { runVulnScan(); setActiveNav("vulns"); }}
          secretsScanning={secretsLoading}
          onExport={handleExport}
          role={role}
          onRoleChange={handleRoleChange}
          onAcknowledge={acknowledge}
          onAcknowledgeAll={acknowledgeAll}
        />
        <FaultBanner faultStatus={faultStatus} />
        {llmAnalyses.length > 0 && activeNav === 'monitor' && <div style={{ padding: "0 28px", marginTop: 16 }}><LLMAnalysisPanel analyses={llmAnalyses} /></div>}
        {renderPage()}
        <ToastNotifications toasts={toasts} onClose={dismissToast} />
      </div>
    </div>
  );
}
