import { useState } from "react";

// ─────────────────────────────────────────────
// DATA HOOKS — replace these with your real API
// calls, WebSocket subscriptions, or state mgmt
// ─────────────────────────────────────────────

function useContainers() {
  // TODO: fetch from your backend, e.g.:
  // useEffect(() => { fetch('/api/containers').then(...) }, [])
  return {
    containers: [],   // Array<{ id, name, image, tag, env, status, cpuPct, memPct, health }>
    loading: false,
    error: null,
  };
}

function useVulnerabilities() {
  // TODO: fetch from your vulnerability scanner API
  return {
    vulnerabilities: [], // Array<{ id, cveId, container, package, version, severity, cvss, status }>
    loading: false,
    error: null,
  };
}

function useAlerts() {
  // TODO: connect to WebSocket or polling endpoint
  return {
    alerts: [],  // Array<{ id, title, description, severity, timestamp, acknowledged }>
    loading: false,
    error: null,
  };
}

function useCompliance() {
  // TODO: fetch from compliance check API
  return {
    compliance: [], // Array<{ id, name, standard, passPct, passCount, totalCount, status }>
    loading: false,
    error: null,
  };
}

function useSecurityEvents() {
  // TODO: fetch 24h timeseries from your monitoring backend
  return {
    events: [],  // Array<{ hour, networkAnomalies, accessViolations }>
    loading: false,
    error: null,
  };
}

function useStats() {
  // TODO: aggregate from your API
  return {
    stats: null, // { totalContainers, criticalVulns, complianceScore, threatsBlocked }
    loading: false,
    error: null,
  };
}

function useScanHistory() {
  // TODO: fetch scan log from your backend
  return {
    scans: [], // Array<{ id, target, timestamp, type, vulnCount, status }>
    loading: false,
    error: null,
  };
}

// ─────────────────────────────────────────────
// THEME TOKENS
// ─────────────────────────────────────────────

const theme = {
  bg: "#080c10",
  surface: "#0e1420",
  surface2: "#141c28",
  border: "#1e2d42",
  accent: "#00e5ff",
  accent2: "#ff3d6b",
  accent3: "#39ff8f",
  warn: "#ffb800",
  text: "#e2eaf5",
  muted: "#5a7290",
};

// ─────────────────────────────────────────────
// SEVERITY / STATUS HELPERS
// ─────────────────────────────────────────────

const SEVERITY_STYLES = {
  critical: { bg: "rgba(255,61,107,0.15)", color: "#ff3d6b", border: "rgba(255,61,107,0.3)" },
  high:     { bg: "rgba(255,184,0,0.12)",  color: "#ffb800", border: "rgba(255,184,0,0.25)" },
  medium:   { bg: "rgba(0,229,255,0.10)",  color: "#00e5ff", border: "rgba(0,229,255,0.2)" },
  low:      { bg: "rgba(57,255,143,0.10)", color: "#39ff8f", border: "rgba(57,255,143,0.2)" },
};

const STATUS_STYLES = {
  open:     { bg: "rgba(255,61,107,0.12)", color: "#ff3d6b" },
  patching: { bg: "rgba(255,184,0,0.10)",  color: "#ffb800" },
  fixed:    { bg: "rgba(57,255,143,0.10)", color: "#39ff8f" },
};

const HEALTH_COLOR = {
  ok:   "#39ff8f",
  warn: "#ffb800",
  crit: "#ff3d6b",
};

const ALERT_BORDER = {
  critical: "#ff3d6b",
  warning:  "#ffb800",
  info:     "#00e5ff",
};

// ─────────────────────────────────────────────
// SMALL UI PRIMITIVES
// ─────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const s = SEVERITY_STYLES[severity?.toLowerCase()] || SEVERITY_STYLES.low;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "Space Mono, monospace", fontSize: 9, fontWeight: 700,
      padding: "3px 8px", borderRadius: 4, textTransform: "uppercase", letterSpacing: "0.1em",
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      ● {severity || "—"}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status?.toLowerCase()] || {};
  return (
    <span style={{
      fontFamily: "Space Mono, monospace", fontSize: 9, padding: "3px 8px",
      borderRadius: 20, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em",
      background: s.bg || "rgba(90,114,144,0.2)", color: s.color || theme.muted,
    }}>
      {status || "—"}
    </span>
  );
}

function HealthDot({ health }) {
  const color = HEALTH_COLOR[health] || theme.muted;
  return (
    <span style={{
      width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
      background: color,
      boxShadow: health === "crit" ? `0 0 8px ${color}` : `0 0 6px ${color}`,
      display: "inline-block",
    }} />
  );
}

function EmptyState({ icon, message }) {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      padding: "36px 20px", color: theme.muted, gap: 10,
    }}>
      <span style={{ fontSize: 28, opacity: 0.4 }}>{icon}</span>
      <span style={{ fontFamily: "Space Mono, monospace", fontSize: 10, textAlign: "center", letterSpacing: "0.1em" }}>
        {message}
      </span>
    </div>
  );
}

function LoadingBar() {
  return (
    <div style={{ padding: "24px 20px", color: theme.muted, fontFamily: "Space Mono, monospace", fontSize: 10, textAlign: "center" }}>
      Loading…
    </div>
  );
}

// ─────────────────────────────────────────────
// LAYOUT PRIMITIVES
// ─────────────────────────────────────────────

function Panel({ title, icon, action, onAction, children, style }) {
  return (
    <div style={{
      background: theme.surface, border: `1px solid ${theme.border}`,
      borderRadius: 10, overflow: "hidden", ...style,
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 20px", borderBottom: `1px solid ${theme.border}`,
      }}>
        <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 15 }}>{icon}</span> {title}
        </div>
        {action && (
          <span onClick={onAction} style={{
            fontFamily: "Space Mono, monospace", fontSize: 10, color: theme.accent, cursor: "pointer",
            border: `1px solid rgba(0,229,255,0.2)`, padding: "4px 10px", borderRadius: 4,
          }}>
            {action}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function StatCard({ label, value, delta, deltaType, icon, accentColor, topColor }) {
  return (
    <div style={{
      background: theme.surface, border: `1px solid ${theme.border}`,
      borderRadius: 10, padding: 20, position: "relative", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 2,
        background: topColor || accentColor,
      }} />
      <div style={{ position: "absolute", top: 16, right: 16, fontSize: 28, opacity: 0.1 }}>{icon}</div>
      <div style={{ fontFamily: "Space Mono, monospace", fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: theme.muted, marginBottom: 12 }}>
        {label}
      </div>
      <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color: accentColor, marginBottom: 8 }}>
        {value ?? "—"}
      </div>
      {delta && (
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: 10, color: deltaType === "up" ? theme.accent2 : theme.accent3 }}>
          {delta}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// SIDEBAR
// ─────────────────────────────────────────────

const NAV_SECTIONS = [
  { label: "Overview", items: [
    { icon: "⬡", label: "Dashboard", key: "dashboard" },
    { icon: "📡", label: "Live Monitor", key: "monitor" },
  ]},
  { label: "Security", items: [
    { icon: "🔍", label: "Vulnerability Scan", key: "vulns", badge: null },
    { icon: "🚨", label: "Alerts", key: "alerts", badge: null },
    { icon: "🔐", label: "Secrets Scan", key: "secrets" },
  ]},
  { label: "Compliance", items: [
    { icon: "✅", label: "Compliance", key: "compliance" },
    { icon: "📋", label: "Reports", key: "reports" },
    { icon: "📜", label: "Audit Log", key: "audit" },
  ]},
  { label: "Settings", items: [
    { icon: "⚙", label: "Configuration", key: "config" },
    { icon: "👥", label: "Team", key: "team" },
  ]},
];

function Sidebar({ activeNav, onNav, systemStatus }) {
  return (
    <aside style={{
      width: 240, minHeight: "100vh", background: theme.surface,
      borderRight: `1px solid ${theme.border}`, display: "flex", flexDirection: "column",
      padding: "24px 0", position: "sticky", top: 0, height: "100vh", flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: "0 24px 28px", borderBottom: `1px solid ${theme.border}`, marginBottom: 20 }}>
        <div style={{ width: 36, height: 36, background: theme.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 10 }}>🛡</div>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.05em" }}>ContainerShield</div>
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: 9, color: theme.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 2 }}>Security Platform</div>
      </div>

      {/* Nav */}
      {NAV_SECTIONS.map(section => (
        <div key={section.label}>
          <div style={{ fontFamily: "Space Mono, monospace", fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: theme.muted, padding: "8px 24px", marginTop: 8 }}>
            {section.label}
          </div>
          {section.items.map(item => (
            <div
              key={item.key}
              onClick={() => onNav(item.key)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "11px 24px",
                cursor: "pointer", fontSize: 13, fontWeight: 600,
                color: activeNav === item.key ? theme.accent : theme.muted,
                borderLeft: `3px solid ${activeNav === item.key ? theme.accent : "transparent"}`,
                background: activeNav === item.key ? "rgba(0,229,255,0.07)" : "transparent",
                transition: "all 0.15s",
              }}
            >
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{item.icon}</span>
              {item.label}
              {item.badge != null && (
                <span style={{ marginLeft: "auto", background: theme.accent2, color: "#fff", fontFamily: "Space Mono, monospace", fontSize: 9, padding: "2px 6px", borderRadius: 20, fontWeight: 700 }}>
                  {item.badge}
                </span>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Footer */}
      <div style={{ marginTop: "auto", padding: "16px 24px", borderTop: `1px solid ${theme.border}` }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: systemStatus === "operational" ? theme.accent3 : theme.accent2, display: "inline-block", marginRight: 8, boxShadow: `0 0 8px ${theme.accent3}` }} />
          <span style={{ fontFamily: "Space Mono, monospace", fontSize: 10, color: theme.muted }}>
            {systemStatus === "operational" ? "All systems operational" : systemStatus || "Connecting…"}
          </span>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────
// TOPBAR
// ─────────────────────────────────────────────

function Topbar({ clusterName, containerCount, alertCount, onRunScan, onExport }) {
  const now = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "16px 32px", borderBottom: `1px solid ${theme.border}`,
      background: "rgba(8,12,16,0.85)", backdropFilter: "blur(10px)",
      position: "sticky", top: 0, zIndex: 10,
    }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Security Overview</div>
        <div style={{ fontFamily: "Space Mono, monospace", fontSize: 10, color: theme.muted, marginTop: 2 }}>
          {clusterName ? `CLUSTER: ${clusterName}` : "No cluster connected"} · {containerCount ?? 0} containers · {now}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={onExport} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", border: `1px solid ${theme.border}`, background: theme.surface2, color: theme.text, borderRadius: 6, fontFamily: "Space Mono, monospace", fontSize: 11, cursor: "pointer" }}>
          ⬇ Export
        </button>
        <button onClick={onRunScan} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", border: `1px solid ${theme.accent}`, background: theme.accent, color: theme.bg, borderRadius: 6, fontFamily: "Space Mono, monospace", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
          ▶ Run Scan
        </button>
        <div style={{ width: 36, height: 36, border: `1px solid ${theme.border}`, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 16, background: theme.surface2, position: "relative" }}>
          🔔
          {alertCount > 0 && (
            <span style={{ position: "absolute", top: -4, right: -4, width: 16, height: 16, background: theme.accent2, borderRadius: "50%", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Space Mono, monospace", color: "#fff", fontWeight: 700 }}>
              {alertCount}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SECURITY EVENTS CHART (CSS bars)
// ─────────────────────────────────────────────

function EventsChart({ events, loading }) {
  const maxVal = events.length ? Math.max(...events.map(e => Math.max(e.networkAnomalies || 0, e.accessViolations || 0)), 1) : 1;

  return (
    <Panel title="Security Events — Last 24h" icon="📊" action="View All">
      {loading ? <LoadingBar /> : events.length === 0 ? (
        <EmptyState icon="📊" message="NO EVENT DATA · CONNECT YOUR MONITORING BACKEND" />
      ) : (
        <>
          <div style={{ padding: 20 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 120 }}>
              {events.map((e, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-end", gap: 2, flex: 1 }}>
                  <div style={{ flex: 1, height: `${((e.networkAnomalies || 0) / maxVal) * 100}%`, background: theme.accent, opacity: 0.8, borderRadius: "3px 3px 0 0", minHeight: 2 }} title={`Network: ${e.networkAnomalies}`} />
                  <div style={{ flex: 1, height: `${((e.accessViolations || 0) / maxVal) * 100}%`, background: theme.accent2, opacity: 0.7, borderRadius: "3px 3px 0 0", minHeight: 2 }} title={`Access: ${e.accessViolations}`} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
              {events.map((e, i) => (
                <div key={i} style={{ flex: 1, textAlign: "center", fontFamily: "Space Mono, monospace", fontSize: 8, color: theme.muted }}>
                  {e.hour}
                </div>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", gap: 16, padding: "0 20px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Space Mono, monospace", fontSize: 10, color: theme.muted }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: theme.accent, display: "inline-block" }} /> Network Anomalies
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "Space Mono, monospace", fontSize: 10, color: theme.muted }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: theme.accent2, display: "inline-block" }} /> Access Violations
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// CONTAINERS HEALTH LIST
// ─────────────────────────────────────────────

function ContainersPanel({ containers, loading }) {
  return (
    <Panel title="Container Health" icon="⬡" action="All Containers">
      {loading ? <LoadingBar /> : containers.length === 0 ? (
        <EmptyState icon="⬡" message="NO CONTAINERS DETECTED" />
      ) : (
        containers.map(c => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid rgba(30,45,66,0.5)`, gap: 14, cursor: "pointer" }}>
            <HealthDot health={c.health} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: 11, fontWeight: 700 }}>{c.name || c.id}</div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: 9, color: theme.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.image}:{c.tag} · {c.env}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: 10, color: theme.muted }}>
                CPU <span style={{ color: theme.text }}>{c.cpuPct != null ? `${c.cpuPct}%` : "—"}</span>
              </div>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: 10, color: theme.muted, marginTop: 2 }}>
                MEM <span style={{ color: theme.text }}>{c.memPct != null ? `${c.memPct}%` : "—"}</span>
              </div>
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// VULNERABILITIES TABLE
// ─────────────────────────────────────────────

const TH = { fontFamily: "Space Mono, monospace", fontSize: 9, letterSpacing: "0.15em", textTransform: "uppercase", color: theme.muted, textAlign: "left", padding: "10px 20px", borderBottom: `1px solid ${theme.border}` };
const TD = { padding: "12px 20px", fontSize: 12, borderBottom: "1px solid rgba(30,45,66,0.5)", verticalAlign: "middle" };

function VulnerabilitiesPanel({ vulnerabilities, loading }) {
  return (
    <Panel title="Recent Vulnerabilities" icon="🔍" action="View All">
      {loading ? <LoadingBar /> : vulnerabilities.length === 0 ? (
        <EmptyState icon="🔍" message="NO VULNERABILITIES · CONNECT YOUR SCANNER" />
      ) : (
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
                <td style={TD}><span style={{ fontFamily: "Space Mono, monospace", fontSize: 11, color: theme.accent }}>{v.cveId}</span></td>
                <td style={TD}><span style={{ fontFamily: "Space Mono, monospace", fontSize: 11 }}>{v.container}</span></td>
                <td style={TD}>{v.package} {v.version}</td>
                <td style={TD}><SeverityBadge severity={v.severity} /></td>
                <td style={TD}><span style={{ fontFamily: "Space Mono, monospace", fontSize: 11, color: theme.warn }}>{v.cvss ?? "—"}</span></td>
                <td style={TD}><StatusBadge status={v.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// ALERTS FEED
// ─────────────────────────────────────────────

function AlertsPanel({ alerts, loading }) {
  return (
    <Panel title="Live Alerts" icon="🚨" action="Clear All">
      {loading ? <LoadingBar /> : alerts.length === 0 ? (
        <EmptyState icon="✅" message="NO ACTIVE ALERTS" />
      ) : (
        <div style={{ maxHeight: 300, overflowY: "auto" }}>
          {alerts.map(a => (
            <div key={a.id} style={{ display: "flex", gap: 12, padding: "14px 20px", borderBottom: "1px solid rgba(30,45,66,0.5)" }}>
              <div style={{ width: 3, borderRadius: 2, flexShrink: 0, alignSelf: "stretch", minHeight: 40, background: ALERT_BORDER[a.severity] || theme.muted }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{a.title}</div>
                <div style={{ fontSize: 11, color: theme.muted, lineHeight: 1.5 }}>{a.description}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: 9, color: theme.muted, marginTop: 5 }}>
                  {a.timestamp ? new Date(a.timestamp).toLocaleString() : "—"} · {(a.severity || "info").toUpperCase()}
                </div>
              </div>
            </div>
          ))}
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
    <Panel title="Compliance Status" icon="✅" action="Details">
      {loading ? <LoadingBar /> : compliance.length === 0 ? (
        <EmptyState icon="📋" message="NO COMPLIANCE DATA · CONNECT YOUR SCANNER" />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, background: theme.border }}>
          {compliance.map(c => {
            const pct = c.passPct ?? 0;
            const fillColor = pct >= 85 ? theme.accent3 : pct >= 60 ? theme.warn : theme.accent2;
            return (
              <div key={c.id} style={{ background: theme.surface, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{c.name}</div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: 9, color: theme.muted, marginTop: -6 }}>{c.standard}</div>
                <div style={{ height: 6, background: theme.surface2, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ height: "100%", borderRadius: 3, background: fillColor, width: `${pct}%`, transition: "width 1s ease" }} />
                </div>
                <div style={{ fontFamily: "Space Mono, monospace", fontSize: 11, fontWeight: 700, display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: fillColor }}>{pct}%</span>
                  <span style={{ color: theme.muted, fontSize: 9 }}>{c.passCount}/{c.totalCount} checks</span>
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
    <Panel title="Scan History" icon="📋" action="Full Log">
      {loading ? <LoadingBar /> : scans.length === 0 ? (
        <EmptyState icon="🔍" message="NO SCANS YET · RUN YOUR FIRST SCAN" />
      ) : (
        scans.map(s => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", borderBottom: "1px solid rgba(30,45,66,0.5)", fontSize: 12 }}>
            <span style={{ fontSize: 18 }}>{s.status === "clean" ? "✅" : s.status === "error" ? "❌" : "⚠️"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "Space Mono, monospace", fontSize: 11, fontWeight: 700 }}>{s.target}</div>
              <div style={{ fontSize: 10, color: theme.muted, marginTop: 2 }}>
                {s.timestamp ? new Date(s.timestamp).toLocaleString() : "—"} · {s.type}
              </div>
            </div>
            <div style={{ fontFamily: "Space Mono, monospace", fontSize: 10, textAlign: "right", color: s.vulnCount > 0 ? theme.accent2 : theme.accent3 }}>
              {s.vulnCount != null ? (s.vulnCount === 0 ? "Clean" : `${s.vulnCount} vulns`) : "—"}
            </div>
          </div>
        ))
      )}
    </Panel>
  );
}

// ─────────────────────────────────────────────
// ROOT DASHBOARD
// ─────────────────────────────────────────────

export default function ContainerSecurityDashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");

  // Wire up your data sources here
  const { containers, loading: loadingContainers } = useContainers();
  const { vulnerabilities, loading: loadingVulns } = useVulnerabilities();
  const { alerts, loading: loadingAlerts } = useAlerts();
  const { compliance, loading: loadingCompliance } = useCompliance();
  const { events, loading: loadingEvents } = useSecurityEvents();
  const { stats, loading: loadingStats } = useStats();
  const { scans, loading: loadingScans } = useScanHistory();

  // TODO: replace with your cluster config
  const clusterName = null;
  const systemStatus = "operational";

  function handleRunScan() {
    // TODO: trigger scan via API
    console.log("Run scan triggered");
  }

  function handleExport() {
    // TODO: download report
    console.log("Export triggered");
  }

  return (
    <div style={{
      background: theme.bg, color: theme.text, minHeight: "100vh",
      fontFamily: "Syne, sans-serif", display: "flex",
      backgroundImage: "linear-gradient(rgba(0,229,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.03) 1px, transparent 1px)",
      backgroundSize: "40px 40px",
    }}>
      <Sidebar activeNav={activeNav} onNav={setActiveNav} systemStatus={systemStatus} />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <Topbar
          clusterName={clusterName}
          containerCount={containers.length}
          alertCount={alerts.filter(a => !a.acknowledged).length}
          onRunScan={handleRunScan}
          onExport={handleExport}
        />

        <div style={{ padding: "28px 32px", flex: 1 }}>

          {/* STAT CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
            <StatCard label="Containers Active" value={loadingStats ? "…" : stats?.totalContainers} icon="⬡" accentColor={theme.accent} topColor={theme.accent} />
            <StatCard label="Critical Vulnerabilities" value={loadingStats ? "…" : stats?.criticalVulns} icon="⚠" accentColor={theme.accent2} topColor={theme.accent2} />
            <StatCard label="Compliance Score" value={loadingStats ? "…" : stats?.complianceScore != null ? `${stats.complianceScore}%` : null} icon="✓" accentColor={theme.accent3} topColor={theme.accent3} />
            <StatCard label="Threats Blocked" value={loadingStats ? "…" : stats?.threatsBlocked} icon="🛡" accentColor={theme.warn} topColor={theme.warn} />
          </div>

          {/* ROW 1: Events Chart + Containers */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 24 }}>
            <EventsChart events={events} loading={loadingEvents} />
            <ContainersPanel containers={containers} loading={loadingContainers} />
          </div>

          {/* ROW 2: Vulnerabilities */}
          <div style={{ marginBottom: 24 }}>
            <VulnerabilitiesPanel vulnerabilities={vulnerabilities} loading={loadingVulns} />
          </div>

          {/* ROW 3: Alerts + Scan History | Compliance */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <AlertsPanel alerts={alerts} loading={loadingAlerts} />
              <ScanHistoryPanel scans={scans} loading={loadingScans} />
            </div>
            <CompliancePanel compliance={compliance} loading={loadingCompliance} />
          </div>

        </div>
      </div>
    </div>
  );
}
