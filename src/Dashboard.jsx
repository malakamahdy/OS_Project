import { useState, useEffect } from "react";
import {
  Shield, Activity, AlertTriangle, CheckCircle, Radio,
  Search, Bell, Download, Play, Settings, Users, FileText,
  Lock, BarChart2, Box, ChevronRight, Clock, Cpu, Database,
  Network, Eye, XCircle, AlertCircle, Info, Layers, Terminal,
  TrendingUp, List, LogOut
} from "lucide-react";

// ─────────────────────────────────────────────
// DATA HOOKS — replace with your real API calls
// ─────────────────────────────────────────────

function useContainers() {
  const [containers, setContainers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const load = () => {
      fetch('http://localhost:3002/api/containers')
        .then(res => res.json())
        .then(data => { setContainers(data); setLoading(false); })
        .catch(err => { setError(err.message); setLoading(false); });
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return { containers, loading, error };
}
function useVulnerabilities() {
  return { vulnerabilities: [], loading: false, error: null };
  // Expected shape: Array<{ id, cveId, container, package, version, severity: 'critical'|'high'|'medium'|'low', cvss, status: 'open'|'patching'|'fixed' }>
}
function useAlerts() {
  return { alerts: [], loading: false, error: null };
  // Expected shape: Array<{ id, title, description, severity: 'critical'|'warning'|'info', timestamp, acknowledged }>
}
function useCompliance() {
  return { compliance: [], loading: false, error: null };
  // Expected shape: Array<{ id, name, standard, passPct, passCount, totalCount }>
}
function useSecurityEvents() {
  return { events: [], loading: false, error: null };
  // Expected shape: Array<{ hour, networkAnomalies, accessViolations }>
}
function useStats() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => {
      fetch('http://localhost:3002/api/stats')
        .then(res => res.json())
        .then(data => { setStats(data); setLoading(false); })
        .catch(() => setLoading(false));
    };
    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  return { stats, loading, error: null };
}
function useScanHistory() {
  return { scans: [], loading: false, error: null };
  // Expected shape: Array<{ id, target, timestamp, type, vulnCount, status: 'clean'|'vulns'|'error' }>
}

// ─────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────

const C = {
  bg:       "#07090d",
  surface:  "#0c1018",
  surface2: "#111620",
  border:   "#1a2333",
  border2:  "#243040",
  cyan:     "#22d3ee",
  red:      "#f43f5e",
  green:    "#10b981",
  amber:    "#f59e0b",
  text:     "#cbd5e1",
  textDim:  "#475569",
  textBright:"#f1f5f9",
};

const mono = "'JetBrains Mono', 'Fira Code', monospace";
const sans = "'DM Sans', sans-serif";

// ─────────────────────────────────────────────
// SEVERITY / STATUS CONFIG
// ─────────────────────────────────────────────

const SEV = {
  critical: { bg: "rgba(244,63,94,0.1)",  color: C.red,   border: "rgba(244,63,94,0.25)",  label: "CRITICAL" },
  high:     { bg: "rgba(245,158,11,0.1)", color: C.amber, border: "rgba(245,158,11,0.2)",  label: "HIGH" },
  medium:   { bg: "rgba(34,211,238,0.08)",color: C.cyan,  border: "rgba(34,211,238,0.2)",  label: "MEDIUM" },
  low:      { bg: "rgba(16,185,129,0.08)",color: C.green, border: "rgba(16,185,129,0.2)",  label: "LOW" },
};

const STAT_STATUS = {
  open:     { color: C.red },
  patching: { color: C.amber },
  fixed:    { color: C.green },
};

const HEALTH_COLOR = { ok: C.green, warn: C.amber, crit: C.red };
const ALERT_COLOR  = { critical: C.red, warning: C.amber, info: C.cyan };

// ─────────────────────────────────────────────
// MICRO COMPONENTS
// ─────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const s = SEV[severity?.toLowerCase()] || SEV.low;
  return (
    <span style={{
      display: "inline-block", fontFamily: mono, fontSize: 9, fontWeight: 700,
      padding: "2px 7px", borderRadius: 3, letterSpacing: "0.12em",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>{s.label}</span>
  );
}

function StatusPill({ status }) {
  const s = STAT_STATUS[status?.toLowerCase()] || {};
  return (
    <span style={{
      fontFamily: mono, fontSize: 9, fontWeight: 600,
      padding: "2px 8px", borderRadius: 20, letterSpacing: "0.1em",
      background: "rgba(255,255,255,0.04)", color: s.color || C.textDim,
      border: `1px solid ${s.color ? s.color + "33" : C.border}`,
      textTransform: "uppercase",
    }}>{status || "—"}</span>
  );
}

function HealthDot({ health }) {
  const color = HEALTH_COLOR[health] || C.textDim;
  return (
    <span style={{
      width: 7, height: 7, borderRadius: "50%", display: "inline-block", flexShrink: 0,
      background: color, boxShadow: `0 0 6px ${color}88`,
    }} />
  );
}

function Mono({ children, color, size = 11 }) {
  return <span style={{ fontFamily: mono, fontSize: size, color: color || C.textDim }}>{children}</span>;
}

function Label({ children }) {
  return (
    <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: C.textDim, marginBottom: 10 }}>
      {children}
    </div>
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
  return (
    <div style={{ padding: "24px 20px", textAlign: "center" }}>
      <Mono size={10} color={C.textDim}>LOADING…</Mono>
    </div>
  );
}

// ─────────────────────────────────────────────
// PANEL WRAPPER
// ─────────────────────────────────────────────

function Panel({ title, icon: Icon, action, onAction, children, style }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, overflow: "hidden", ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "13px 18px", borderBottom: `1px solid ${C.border}`,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright, letterSpacing: "0.01em" }}>
          {Icon && <Icon size={14} color={C.textDim} strokeWidth={1.5} />}
          {title}
        </div>
        {action && (
          <button onClick={onAction} style={{
            fontFamily: mono, fontSize: 9, color: C.cyan, letterSpacing: "0.1em",
            background: "rgba(34,211,238,0.06)", border: `1px solid rgba(34,211,238,0.15)`,
            padding: "3px 10px", borderRadius: 3, cursor: "pointer",
          }}>{action}</button>
        )}
      </div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// STAT CARD
// ─────────────────────────────────────────────

function StatCard({ label, value, sub, accent, icon: Icon }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: "20px 18px", position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: `linear-gradient(90deg, ${accent}66, transparent)` }} />
      <div style={{ position: "absolute", bottom: -8, right: -8, opacity: 0.04 }}>
        <Icon size={72} strokeWidth={1} color={accent} />
      </div>
      <Label>{label}</Label>
      <div style={{ fontSize: 34, fontWeight: 700, fontFamily: mono, color: accent, lineHeight: 1, marginBottom: 6 }}>
        {value ?? "—"}
      </div>
      {sub && <Mono size={10} color={C.textDim}>{sub}</Mono>}
    </div>
  );
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────

const NAV = [
  { section: "Monitor", items: [
    { key: "dashboard", label: "Dashboard",     Icon: Layers },
    { key: "monitor",   label: "Live Monitor",  Icon: Activity },
  ]},
  { section: "Security", items: [
    { key: "vulns",     label: "Vuln Scanner",  Icon: Search },
    { key: "alerts",    label: "Alerts",        Icon: Bell },
    { key: "secrets",   label: "Secrets Scan",  Icon: Lock },
  ]},
  { section: "Compliance", items: [
    { key: "compliance",label: "Compliance",    Icon: CheckCircle },
    { key: "reports",   label: "Reports",       Icon: FileText },
    { key: "audit",     label: "Audit Log",     Icon: List },
  ]},
  { section: "System", items: [
    { key: "config",    label: "Config",        Icon: Settings },
    { key: "team",      label: "Team",          Icon: Users },
  ]},
];

function Sidebar({ active, onNav }) {
  return (
    <aside style={{
      width: 220, minHeight: "100vh", background: C.surface,
      borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column",
      position: "sticky", top: 0, height: "100vh", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "22px 20px 18px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
          <div style={{ width: 30, height: 30, background: `${C.cyan}18`, border: `1px solid ${C.cyan}44`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={15} color={C.cyan} strokeWidth={1.5} />
          </div>
          <div>
            <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 700, color: C.textBright, letterSpacing: "0.02em" }}>ContainerShield</div>
            <Mono size={8} color={C.textDim}>SECURITY PLATFORM</Mono>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "12px 0", overflowY: "auto" }}>
        {NAV.map(({ section, items }) => (
          <div key={section} style={{ marginBottom: 4 }}>
            <div style={{ fontFamily: mono, fontSize: 8, letterSpacing: "0.22em", textTransform: "uppercase", color: C.textDim, padding: "10px 20px 6px" }}>
              {section}
            </div>
            {items.map(({ key, label, Icon }) => {
              const isActive = active === key;
              return (
                <div key={key} onClick={() => onNav(key)} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 20px", cursor: "pointer",
                  fontFamily: sans, fontSize: 12, fontWeight: isActive ? 600 : 400,
                  color: isActive ? C.textBright : C.textDim,
                  background: isActive ? `${C.cyan}0a` : "transparent",
                  borderLeft: `2px solid ${isActive ? C.cyan : "transparent"}`,
                  transition: "all 0.12s",
                }}>
                  <Icon size={14} strokeWidth={isActive ? 2 : 1.5} color={isActive ? C.cyan : C.textDim} />
                  {label}
                </div>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Status footer */}
      <div style={{ padding: "14px 20px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.green, boxShadow: `0 0 6px ${C.green}` }} />
          <Mono size={9} color={C.textDim}>SYSTEMS OPERATIONAL</Mono>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────
// TOPBAR
// ─────────────────────────────────────────────

function Topbar({ clusterName, containerCount, alertCount, onScan, onExport }) {
  const date = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 28px", borderBottom: `1px solid ${C.border}`,
      background: C.bg, position: "sticky", top: 0, zIndex: 10,
    }}>
      <div>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright, letterSpacing: "-0.01em" }}>
          Security Overview
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 3 }}>
          <Mono size={9} color={C.textDim}>{clusterName ? `CLUSTER / ${clusterName}` : "NO CLUSTER CONNECTED"}</Mono>
          <span style={{ width: 1, height: 10, background: C.border2 }} />
          <Mono size={9} color={C.textDim}>{containerCount ?? 0} CONTAINERS</Mono>
          <span style={{ width: 1, height: 10, background: C.border2 }} />
          <Mono size={9} color={C.textDim}>{date.toUpperCase()}</Mono>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onExport} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
          border: `1px solid ${C.border2}`, background: "transparent", color: C.text,
          borderRadius: 5, fontFamily: mono, fontSize: 10, cursor: "pointer", letterSpacing: "0.05em",
        }}>
          <Download size={12} strokeWidth={1.5} /> EXPORT
        </button>
        <button onClick={onScan} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
          border: `1px solid ${C.cyan}`, background: `${C.cyan}15`, color: C.cyan,
          borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em",
        }}>
          <Play size={11} strokeWidth={2} /> RUN SCAN
        </button>
        <div style={{ position: "relative", width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border2}`, borderRadius: 5, cursor: "pointer", background: "transparent" }}>
          <Bell size={14} color={C.textDim} strokeWidth={1.5} />
          {alertCount > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, width: 15, height: 15, background: C.red, borderRadius: "50%", fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, color: "#fff", fontWeight: 700 }}>
              {alertCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// EVENTS CHART
// ─────────────────────────────────────────────

function EventsChart({ events, loading }) {
  const max = events.length ? Math.max(...events.map(e => Math.max(e.networkAnomalies || 0, e.accessViolations || 0)), 1) : 1;
  return (
    <Panel title="Security Events — 24h" icon={BarChart2} action="VIEW ALL">
      {loading ? <Loading /> : events.length === 0 ? (
        <EmptyState icon={BarChart2} message="CONNECT YOUR MONITORING BACKEND" />
      ) : (
        <div style={{ padding: "18px 18px 12px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110, marginBottom: 8 }}>
            {events.map((e, i) => (
              <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 1 }}>
                <div style={{ flex: 1, minHeight: 2, height: `${((e.networkAnomalies || 0) / max) * 100}%`, background: C.cyan, opacity: 0.7, borderRadius: "2px 2px 0 0" }} />
                <div style={{ flex: 1, minHeight: 2, height: `${((e.accessViolations || 0) / max) * 100}%`, background: C.red, opacity: 0.6, borderRadius: "2px 2px 0 0" }} />
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {events.map((e, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", fontFamily: mono, fontSize: 8, color: C.textDim }}>{e.hour}</div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 3, background: C.cyan, borderRadius: 2, display: "inline-block" }} />
              <Mono size={9} color={C.textDim}>NETWORK ANOMALIES</Mono>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 3, background: C.red, borderRadius: 2, display: "inline-block" }} />
              <Mono size={9} color={C.textDim}>ACCESS VIOLATIONS</Mono>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// CONTAINERS PANEL
// ─────────────────────────────────────────────

function ContainersPanel({ containers, loading }) {
  return (
    <Panel title="Container Health" icon={Box} action="ALL">
      {loading ? <Loading /> : containers.length === 0 ? (
        <EmptyState icon={Box} message="NO CONTAINERS DETECTED" />
      ) : containers.map(c => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
          <HealthDot health={c.health} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: C.textBright, fontWeight: 600 }}>{c.name || c.id}</div>
            <Mono size={9} color={C.textDim}>{c.image}:{c.tag} · {c.env}</Mono>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Cpu size={10} color={C.textDim} />
                <Mono size={10} color={C.text}>{c.cpuPct != null ? `${c.cpuPct}%` : "—"}</Mono>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Database size={10} color={C.textDim} />
                <Mono size={10} color={C.text}>{c.memPct != null ? `${c.memPct}%` : "—"}</Mono>
              </div>
            </div>
          </div>
        </div>
      ))}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// VULNERABILITIES TABLE
// ─────────────────────────────────────────────

const TH = {
  fontFamily: mono, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase",
  color: C.textDim, textAlign: "left", padding: "9px 18px", borderBottom: `1px solid ${C.border}`,
  fontWeight: 400,
};
const TD = { padding: "11px 18px", fontSize: 12, borderBottom: `1px solid ${C.border}88`, verticalAlign: "middle" };

function VulnsPanel({ vulnerabilities, loading }) {
  return (
    <Panel title="Vulnerabilities" icon={Search} action="VIEW ALL">
      {loading ? <Loading /> : vulnerabilities.length === 0 ? (
        <EmptyState icon={Search} message="CONNECT YOUR VULNERABILITY SCANNER" />
      ) : (
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
              </tr>
            </thead>
            <tbody>
              {vulnerabilities.map(v => (
                <tr key={v.id} style={{ cursor: "pointer" }}>
                  <td style={TD}><Mono size={11} color={C.cyan}>{v.cveId}</Mono></td>
                  <td style={TD}><Mono size={11} color={C.textBright}>{v.container}</Mono></td>
                  <td style={TD}><span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{v.package} {v.version}</span></td>
                  <td style={TD}><SeverityBadge severity={v.severity} /></td>
                  <td style={TD}><Mono size={11} color={C.amber}>{v.cvss ?? "—"}</Mono></td>
                  <td style={TD}><StatusPill status={v.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// ALERTS PANEL
// ─────────────────────────────────────────────

const ALERT_ICON = { critical: XCircle, warning: AlertCircle, info: Info };

function AlertsPanel({ alerts, loading }) {
  return (
    <Panel title="Live Alerts" icon={Bell} action="CLEAR ALL">
      {loading ? <Loading /> : alerts.length === 0 ? (
        <EmptyState icon={CheckCircle} message="NO ACTIVE ALERTS" />
      ) : (
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {alerts.map(a => {
            const color = ALERT_COLOR[a.severity] || C.textDim;
            const Icon = ALERT_ICON[a.severity] || Info;
            return (
              <div key={a.id} style={{ display: "flex", gap: 12, padding: "13px 18px", borderBottom: `1px solid ${C.border}88`, alignItems: "flex-start" }}>
                <Icon size={14} color={color} strokeWidth={1.5} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright, marginBottom: 3 }}>{a.title}</div>
                  <div style={{ fontFamily: sans, fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>{a.description}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 5 }}>
                    <Clock size={10} color={C.textDim} />
                    <Mono size={9} color={C.textDim}>
                      {a.timestamp ? new Date(a.timestamp).toLocaleString() : "—"} · {(a.severity || "info").toUpperCase()}
                    </Mono>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// COMPLIANCE PANEL
// ─────────────────────────────────────────────

function CompliancePanel({ compliance, loading }) {
  return (
    <Panel title="Compliance" icon={CheckCircle} action="DETAILS">
      {loading ? <Loading /> : compliance.length === 0 ? (
        <EmptyState icon={CheckCircle} message="CONNECT YOUR COMPLIANCE SCANNER" />
      ) : (
        <div>
          {compliance.map(c => {
            const pct = c.passPct ?? 0;
            const color = pct >= 85 ? C.green : pct >= 60 ? C.amber : C.red;
            return (
              <div key={c.id} style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}88` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                  <div>
                    <span style={{ fontFamily: sans, fontSize: 12, fontWeight: 600, color: C.textBright }}>{c.name}</span>
                    <Mono size={9} color={C.textDim} style={{ marginLeft: 8 }}>{c.standard}</Mono>
                  </div>
                  <Mono size={11} color={color}>{pct}%</Mono>
                </div>
                <div style={{ height: 4, background: C.surface2, borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 2, transition: "width 0.8s ease" }} />
                </div>
                <div style={{ marginTop: 4, textAlign: "right" }}>
                  <Mono size={9} color={C.textDim}>{c.passCount}/{c.totalCount} CHECKS</Mono>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// SCAN HISTORY
// ─────────────────────────────────────────────

function ScanHistoryPanel({ scans, loading }) {
  return (
    <Panel title="Scan History" icon={Terminal} action="FULL LOG">
      {loading ? <Loading /> : scans.length === 0 ? (
        <EmptyState icon={Terminal} message="NO SCANS YET" />
      ) : scans.map(s => (
        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 18px", borderBottom: `1px solid ${C.border}88` }}>
          {s.status === "clean"
            ? <CheckCircle size={13} color={C.green} strokeWidth={1.5} />
            : s.status === "error"
            ? <XCircle size={13} color={C.red} strokeWidth={1.5} />
            : <AlertTriangle size={13} color={C.amber} strokeWidth={1.5} />}
          <div style={{ flex: 1 }}>
            <Mono size={11} color={C.textBright}>{s.target}</Mono>
            <div style={{ marginTop: 2 }}>
              <Mono size={9} color={C.textDim}>{s.timestamp ? new Date(s.timestamp).toLocaleString() : "—"} · {s.type}</Mono>
            </div>
          </div>
          <Mono size={10} color={s.vulnCount > 0 ? C.red : C.green}>
            {s.vulnCount != null ? (s.vulnCount === 0 ? "CLEAN" : `${s.vulnCount} VULNS`) : "—"}
          </Mono>
        </div>
      ))}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────

export default function Dashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");

  const { containers, loading: lcont }  = useContainers();
  const { vulnerabilities, loading: lv } = useVulnerabilities();
  const { alerts, loading: la }          = useAlerts();
  const { compliance, loading: lcomp }   = useCompliance();
  const { events, loading: lev }         = useSecurityEvents();
  const { stats, loading: ls }           = useStats();
  const { scans, loading: lsc }          = useScanHistory();

  const clusterName = null;

  return (
    <div style={{ display: "flex", background: C.bg, color: C.text, minHeight: "100vh", fontFamily: sans }}>
      <Sidebar active={activeNav} onNav={setActiveNav} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar
          clusterName={clusterName}
          containerCount={containers.length}
          alertCount={alerts.filter(a => !a.acknowledged).length}
          onScan={() => console.log("TODO: trigger scan")}
          onExport={() => console.log("TODO: export report")}
        />

        <div style={{ padding: "24px 28px", flex: 1 }}>

          {/* STAT CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 }}>
            <StatCard label="Containers Active" value={ls ? "…" : stats?.totalContainers} icon={Box} accent={C.cyan} />
            <StatCard label="Critical Vulnerabilities" value={ls ? "…" : stats?.criticalVulns} icon={AlertTriangle} accent={C.red} />
            <StatCard label="Compliance Score" value={ls ? "…" : stats?.complianceScore != null ? `${stats.complianceScore}%` : null} icon={CheckCircle} accent={C.green} />
            <StatCard label="Threats Blocked" value={ls ? "…" : stats?.threatsBlocked} icon={Shield} accent={C.amber} />
          </div>

          {/* ROW 1 */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 20 }}>
            <EventsChart events={events} loading={lev} />
            <ContainersPanel containers={containers} loading={lcont} />
          </div>

          {/* ROW 2 */}
          <div style={{ marginBottom: 20 }}>
            <VulnsPanel vulnerabilities={vulnerabilities} loading={lv} />
          </div>

          {/* ROW 3 */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <AlertsPanel alerts={alerts} loading={la} />
              <ScanHistoryPanel scans={scans} loading={lsc} />
            </div>
            <CompliancePanel compliance={compliance} loading={lcomp} />
          </div>

        </div>
      </div>
    </div>
  );
}
