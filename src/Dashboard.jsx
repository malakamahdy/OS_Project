import { useState, useEffect } from "react";
import {
  Shield, Activity, AlertTriangle, CheckCircle,
  Search, Bell, Download, Play, Settings, Users, FileText,
  Lock, BarChart2, Box, Clock, Cpu, Database,
  XCircle, AlertCircle, Info, Layers, Terminal,
  List, ChevronLeft
} from "lucide-react";

// ─────────────────────────────────────────────
// DATA HOOKS
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
  const [vulnerabilities, setVulnerabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch('http://localhost:3002/api/vulnerabilities')
      .then(res => res.json())
      .then(data => { setVulnerabilities(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);
  return { vulnerabilities, loading, error: null };
}

function useAlerts() { return { alerts: [], loading: false, error: null }; }
function useCompliance() { return { compliance: [], loading: false, error: null }; }
function useSecurityEvents() { return { events: [], loading: false, error: null }; }

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

function useScanHistory() { return { scans: [], loading: false, error: null }; }

// ─────────────────────────────────────────────
// DESIGN TOKENS — higher contrast
// ─────────────────────────────────────────────

const C = {
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

const TH = { fontFamily: mono, fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: C.textDim, textAlign: "left", padding: "10px 18px", borderBottom: `1px solid ${C.border}`, fontWeight: 400, background: C.surface2 };
const TD = { padding: "12px 18px", fontSize: 12, borderBottom: `1px solid ${C.border}`, verticalAlign: "middle" };

function VulnTable({ rows }) {
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
          </tr>
        </thead>
        <tbody>
          {rows.map(v => (
            <tr key={v.id} style={{ transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.surface2}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <td style={TD}><Mono size={11} color={C.cyan}>{v.cveId}</Mono></td>
              <td style={TD}><Mono size={11} color={C.textBright}>{v.container}</Mono></td>
              <td style={TD}><span style={{ fontFamily: sans, fontSize: 12, color: C.text }}>{v.package} <span style={{ color: C.textDim }}>{v.version}</span></span></td>
              <td style={TD}><SeverityBadge severity={v.severity} /></td>
              <td style={TD}><Mono size={11} color={C.amber}>{v.cvss ?? "—"}</Mono></td>
              <td style={TD}><StatusPill status={v.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────

const NAV = [
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
    { key: "config",     label: "Config",       Icon: Settings },
    { key: "team",       label: "Team",         Icon: Users },
  ]},
];

function Sidebar({ active, onNav }) {
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
        {NAV.map(({ section, items }) => (
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

function Topbar({ clusterName, containerCount, alertCount, onScan, onExport }) {
  const date = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 28px", borderBottom: `1px solid ${C.border}`, background: C.bg, position: "sticky", top: 0, zIndex: 10 }}>
      <div>
        <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 700, color: C.textBright, letterSpacing: "-0.01em" }}>Security Overview</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 4 }}>
          <Mono size={10} color={C.textDim}>{clusterName ? `CLUSTER / ${clusterName}` : "NO CLUSTER CONNECTED"}</Mono>
          <span style={{ width: 1, height: 10, background: C.border2 }} />
          <Mono size={10} color={C.textDim}>{containerCount ?? 0} CONTAINERS</Mono>
          <span style={{ width: 1, height: 10, background: C.border2 }} />
          <Mono size={10} color={C.textDim}>{date.toUpperCase()}</Mono>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={onExport} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: `1px solid ${C.border2}`, background: "transparent", color: C.text, borderRadius: 5, fontFamily: mono, fontSize: 10, cursor: "pointer", letterSpacing: "0.05em" }}>
          <Download size={12} strokeWidth={1.5} /> EXPORT
        </button>
        <button onClick={onScan} style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", border: `1px solid ${C.cyan}`, background: `${C.cyan}18`, color: C.cyan, borderRadius: 5, fontFamily: mono, fontSize: 10, fontWeight: 700, cursor: "pointer", letterSpacing: "0.05em" }}>
          <Play size={11} strokeWidth={2} /> RUN SCAN
        </button>
        <div style={{ position: "relative", width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", border: `1px solid ${C.border2}`, borderRadius: 5, cursor: "pointer" }}>
          <Bell size={15} color={C.text} strokeWidth={1.5} />
          {alertCount > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, background: C.red, borderRadius: "50%", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: mono, color: "#fff", fontWeight: 700 }}>
              {alertCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PAGE: DASHBOARD
// ─────────────────────────────────────────────

function DashboardPage({ containers, vulnerabilities, alerts, events, scans, compliance, stats, ls, lv, lcont, lev, la, lcomp, lsc, onNav }) {
  const max = events.length ? Math.max(...events.map(e => Math.max(e.networkAnomalies || 0, e.accessViolations || 0)), 1) : 1;
  const previewVulns = vulnerabilities.slice(0, 5);

  return (
    <div style={{ padding: "24px 28px", flex: 1 }}>

      {/* STAT CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
        <StatCard label="Containers Active" value={ls ? "…" : stats?.totalContainers} icon={Box} accent={C.cyan} />
        <StatCard label="Critical Vulnerabilities" value={lv ? "…" : vulnerabilities.filter(v => v.severity === "critical").length || null} icon={AlertTriangle} accent={C.red} />
        <StatCard label="Compliance Score" value={ls ? "…" : stats?.complianceScore != null ? `${stats.complianceScore}%` : null} icon={CheckCircle} accent={C.green} />
        <StatCard label="Threats Blocked" value={ls ? "…" : stats?.threatsBlocked} icon={Shield} accent={C.amber} />
      </div>

      {/* ROW 1 */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14, marginBottom: 22 }}>
        <Panel title="Security Events — 24h" icon={BarChart2} action="VIEW ALL" onAction={() => onNav("monitor")}>
          {lev ? <Loading /> : events.length === 0 ? <EmptyState icon={BarChart2} message="CONNECT YOUR MONITORING BACKEND" /> : (
            <div style={{ padding: "18px 18px 12px" }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 110, marginBottom: 8 }}>
                {events.map((e, i) => (
                  <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 1 }}>
                    <div style={{ flex: 1, minHeight: 2, height: `${((e.networkAnomalies || 0) / max) * 100}%`, background: C.cyan, opacity: 0.8, borderRadius: "2px 2px 0 0" }} />
                    <div style={{ flex: 1, minHeight: 2, height: `${((e.accessViolations || 0) / max) * 100}%`, background: C.red, opacity: 0.7, borderRadius: "2px 2px 0 0" }} />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {events.map((e, i) => <div key={i} style={{ flex: 1, textAlign: "center", fontFamily: mono, fontSize: 8, color: C.textDim }}>{e.hour}</div>)}
              </div>
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
          <Panel title="Live Alerts" icon={Bell} action="VIEW ALL" onAction={() => onNav("alerts")}>
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

function MonitorPage({ containers, loading, onBack }) {
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

      <Panel title="All Containers" icon={Box}>
        {loading ? <Loading /> : containers.length === 0 ? <EmptyState icon={Box} message="NO CONTAINERS DETECTED" /> :
          containers.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", borderBottom: `1px solid ${C.border}`, transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = C.surface2}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <HealthDot health={c.health} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: mono, fontSize: 12, color: C.textBright, fontWeight: 600 }}>{c.name || c.id}</div>
                <Mono size={10} color={C.textDim}>{c.image}:{c.tag} · {c.env} · {c.status}</Mono>
              </div>
              <div style={{ display: "flex", gap: 24 }}>
                <div style={{ textAlign: "right" }}>
                  <Mono size={9} color={C.textDim}>CPU</Mono>
                  <div style={{ fontFamily: mono, fontSize: 14, color: C.textBright, marginTop: 2 }}>{c.cpuPct != null ? `${c.cpuPct}%` : "—"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <Mono size={9} color={C.textDim}>MEM</Mono>
                  <div style={{ fontFamily: mono, fontSize: 14, color: C.textBright, marginTop: 2 }}>{c.memPct != null ? `${c.memPct}%` : "—"}</div>
                </div>
              </div>
            </div>
          ))
        }
      </Panel>
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

  const { containers, loading: lcont } = useContainers();
  const { vulnerabilities, loading: lv } = useVulnerabilities();
  const { alerts, loading: la }          = useAlerts();
  const { compliance, loading: lcomp }   = useCompliance();
  const { events, loading: lev }         = useSecurityEvents();
  const { stats, loading: ls }           = useStats();
  const { scans, loading: lsc }          = useScanHistory();

  const PAGE_TITLES = {
    alerts:     { title: "Alerts",         Icon: Bell },
    secrets:    { title: "Secrets Scan",   Icon: Lock },
    compliance: { title: "Compliance",     Icon: CheckCircle },
    reports:    { title: "Reports",        Icon: FileText },
    audit:      { title: "Audit Log",      Icon: List },
    config:     { title: "Configuration",  Icon: Settings },
    team:       { title: "Team",           Icon: Users },
  };

  function renderPage() {
    switch (activeNav) {
      case "dashboard":
        return <DashboardPage containers={containers} vulnerabilities={vulnerabilities} alerts={alerts} events={events} scans={scans} compliance={compliance} stats={stats} ls={ls} lv={lv} lcont={lcont} lev={lev} la={la} lcomp={lcomp} lsc={lsc} onNav={setActiveNav} />;
      case "vulns":
        return <VulnsPage vulnerabilities={vulnerabilities} loading={lv} onBack={() => setActiveNav("dashboard")} />;
      case "monitor":
        return <MonitorPage containers={containers} loading={lcont} onBack={() => setActiveNav("dashboard")} />;
      default:
        const p = PAGE_TITLES[activeNav];
        return p ? <PlaceholderPage title={p.title} icon={p.Icon} onBack={() => setActiveNav("dashboard")} /> : null;
    }
  }

  return (
    <div style={{ display: "flex", background: C.bg, color: C.text, minHeight: "100vh", fontFamily: sans }}>
      <Sidebar active={activeNav} onNav={setActiveNav} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar
          clusterName={null}
          containerCount={containers.length}
          alertCount={alerts.filter(a => !a.acknowledged).length}
          onScan={() => setActiveNav("vulns")}
          onExport={() => console.log("TODO: export")}
        />
        {renderPage()}
      </div>
    </div>
  );
}
