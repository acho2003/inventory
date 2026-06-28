import { Search } from "lucide-react";
import { statusLabels } from "../config/constants.js";
import { fmt, lineSummary, num } from "../lib/utils.js";

export function Header({ title, subtitle, eyebrow }) {
  return (
    <div className="topbar">
      <div>
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {subtitle ? <div className="muted">{subtitle}</div> : null}
      </div>
    </div>
  );
}



export function AccessDenied() {
  return (
    <div className="panel">
      <PanelTitle title="Access restricted" subtitle="This role is not allowed to view this feature." />
    </div>
  );
}



export function Kpi({ label, value }) {
  const display = typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) ? num(value) : fmt(value);
  return <div className="kpi"><span>{label}</span><strong>{display}</strong></div>;
}



export function SegmentedTabs({ tabs, active, onChange }) {
  return (
    <div className="segmented-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}



export function UsageTable({ rows, emptyText, variant = "budget" }) {
  if (!rows.length) return <div className="empty compact-empty">{emptyText}</div>;
  const isBudget = variant === "budget";
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{isBudget ? "Budget Head" : "Key Infrastructure"}</th>
            {isBudget ? <th>Budget Amount</th> : null}
            <th>{isBudget ? "Used" : "Amount Used"}</th>
            {isBudget ? <th>Balance</th> : null}
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={row.id}>
              <td><strong>{row.name}</strong></td>
              {isBudget ? <td>{num(row.amount)}</td> : null}
              <td>{num(row.used)}</td>
              {isBudget ? <td><strong className={row.balance < 0 ? "negative" : "positive"}>{num(row.balance)}</strong></td> : null}
              <td><span className="status">{row.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



export function UsageBarChart({ rows, emptyText }) {
  if (!rows.length) return <div className="empty compact-empty">{emptyText}</div>;
  return (
    <div className="usage-chart">
      {rows.slice(0, 10).map((row) => {
        const used = Math.max(0, Number(row.used || 0));
        const balance = Math.max(0, Number(row.balance || 0));
        const total = Math.max(used + balance, Number(row.amount || 0), 1);
        const usedPct = Math.min(100, (used / total) * 100);
        const balancePct = Math.max(0, 100 - usedPct);
        return (
          <div className="usage-bar-row" key={row.id}>
            <div className="usage-bar-head">
              <strong>{row.name}</strong>
              <span>{num(row.amount)}</span>
            </div>
            <div className="stacked-bar" aria-label={`${row.name}: used ${num(used)}, balance ${num(balance)}`}>
              <span className="bar-used" style={{ width: `${usedPct}%` }} />
              <span className="bar-balance" style={{ width: `${balancePct}%` }} />
            </div>
            <div className="usage-legend">
              <span><i className="legend-used" /> Used {num(used)}</span>
              <span><i className="legend-balance" /> Balance {num(row.balance)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}



export function WorkflowStrip() {
  const steps = [
    ["Request", "Requester enters item needs"],
    ["Verify", "Store checks request"],
    ["Approve", "Final approver signs off"],
    ["Receive", "Store records arrivals"],
    ["Issue", "Release to infrastructure and duty person"]
  ];
  return (
    <div className="workflow-strip">
      {steps.map(([title, text], index) => (
        <div className="workflow-step" key={title}>
          <span>{index + 1}</span>
          <div><strong>{title}</strong><small>{text}</small></div>
        </div>
      ))}
    </div>
  );
}



export function PanelTitle({ title, subtitle }) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}



export function CompactRequestList({ rows }) {
  return (
    <div className="request-list">
      {rows.map((row) => (
        <div className="request-card" key={row.id}>
          <div>
            <strong>{fmt(row.requisitionNo)}</strong>
            <span>{lineSummary(row.lines)}</span>
          </div>
          <span className={`status ${row.status}`}>{statusLabels[row.status] || row.status}</span>
        </div>
      ))}
    </div>
  );
}



export function DetailBlock({ title, rows }) {
  return (
    <div className="detail-block">
      <strong>{title}</strong>
      {rows.length ? rows.map((row, index) => <span key={`${row}-${index}`}>{row}</span>) : <span className="muted">No records yet.</span>}
    </div>
  );
}



export function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}


