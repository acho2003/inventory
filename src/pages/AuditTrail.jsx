import { useState } from "react";
import { FileDown } from "lucide-react";
import { fmt, matchesSearch, num } from "../lib/utils.js";
import { Header, Kpi, PanelTitle, SearchBox } from "../components/common.jsx";

export function AuditTrail({ data, token }) {
  const [query, setQuery] = useState("");
  const [eventType, setEventType] = useState("all");
  const [entityType, setEntityType] = useState("all");
  const [actor, setActor] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const summary = data.auditSummary;
  const events = data.auditEvents || [];
  const eventTypes = [...new Set(events.map((event) => event.eventType).filter(Boolean))].sort();
  const entityTypes = [...new Set(events.map((event) => event.entityType).filter(Boolean))].sort();
  const actors = [...new Set(events.map((event) => event.actorName).filter(Boolean))].sort();
  const filtered = events.filter((event) => {
    const date = String(event.at || "").slice(0, 10);
    return (eventType === "all" || event.eventType === eventType)
      && (entityType === "all" || event.entityType === entityType)
      && (actor === "all" || event.actorName === actor)
      && (!dateFrom || date >= dateFrom)
      && (!dateTo || date <= dateTo)
      && matchesSearch([event.id, event.actorName, event.actorRole, event.eventType, event.entityType, event.entityLabel, event.reason, event.remarks, event.documentNo, event.hash], query);
  });

  async function exportCsv() {
    const res = await fetch("/api/audit-events/export.csv", { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-events.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <Header title="Audit Trail" eyebrow="Accountability" subtitle="Immutable event history, exception checks, and tamper-evidence status." />
      <div className="grid four">
        <Kpi label="Audit Events" value={summary?.totalAuditEvents || 0} />
        <Kpi label="Hash Chain" value={summary?.hashChainValid ? "Valid" : "Broken"} />
        <Kpi label="Missing Bills" value={summary?.exceptions?.missingBill || 0} />
        <Kpi label="Deleted Records" value={summary?.exceptions?.deletedTotal || 0} />
      </div>
      <div className={summary?.hashChainValid ? "hash-banner valid" : "hash-banner broken"}>
        <strong>{summary?.hashChainValid ? "Audit chain verified" : "Audit chain needs review"}</strong>
        <span>{summary?.hashChainValid ? "Every audit event currently matches the tamper-evidence chain." : "The audit hash chain did not validate. Review audit storage before relying on reports."}</span>
      </div>
      <AuditExceptionCards summary={summary} />
      <div className="panel">
        <PanelTitle title="Audit Events" subtitle="Filter by date, user, action, entity, item, requisition, or document number." />
        <div className="table-tools audit-tools">
          <SearchBox value={query} onChange={setQuery} placeholder="Search audit trail" />
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          <select value={eventType} onChange={(e) => setEventType(e.target.value)}><option value="all">All actions</option>{eventTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <select value={entityType} onChange={(e) => setEntityType(e.target.value)}><option value="all">All entities</option>{entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <select value={actor} onChange={(e) => setActor(e.target.value)}><option value="all">All users</option>{actors.map((name) => <option key={name} value={name}>{name}</option>)}</select>
          <button type="button" onClick={exportCsv}>Export CSV</button>
        </div>
        <div className="table-wrap full-ledger-wrap">
          <table>
            <thead><tr><th>At</th><th>User</th><th>Action</th><th>Entity</th><th>Label</th><th>Reason / Remarks</th><th>Document</th><th>Changes</th><th>Hash</th></tr></thead>
            <tbody>{filtered.map((event) => <AuditEventRow key={event.id} event={event} />)}</tbody>
          </table>
        </div>
        {!filtered.length ? <div className="empty compact-empty">No matching audit events.</div> : null}
      </div>
    </>
  );
}



function AuditExceptionCards({ summary }) {
  const exceptions = summary?.exceptions || {};
  const rows = [
    ["Missing Challan", exceptions.missingChallan || 0],
    ["Missing DV", exceptions.missingDv || 0],
    ["Missing Bill", exceptions.missingBill || 0],
    ["Negative Stock", exceptions.negativeStock || 0],
    ["Zero Stock", exceptions.zeroStock || 0],
    ["Rejected Requests", exceptions.rejectedRequests || 0],
    ["Under Repair", exceptions.underRepair || 0],
    ["Disposed / Spoiled", exceptions.disposedOrSpoiled || 0]
  ];
  return (
    <div className="panel">
      <PanelTitle title="Exception Checks" subtitle={`Last audit event: ${fmt(summary?.lastAuditAt)}`} />
      <div className="exception-grid">
        {rows.map(([label, value]) => <div className={Number(value) ? "exception-card active" : "exception-card"} key={label}><span>{label}</span><strong>{num(value)}</strong></div>)}
      </div>
    </div>
  );
}



function AuditEventRow({ event }) {
  const changeKeys = Object.keys(event.changes || {});
  const detail = changeKeys.length ? changeKeys.slice(0, 4).join(", ") : event.eventType;
  return (
    <tr>
      <td>{fmt(event.at)}</td>
      <td><strong>{fmt(event.actorName)}</strong><div className="muted">{fmt(event.actorRole)}</div></td>
      <td><span className="status">{fmt(event.eventType)}</span></td>
      <td>{fmt(event.entityType)}</td>
      <td>{fmt(event.entityLabel)}</td>
      <td>{fmt(event.reason || event.remarks)}</td>
      <td>{fmt(event.documentNo)}</td>
      <td><details><summary>{detail}</summary><pre className="audit-json">{JSON.stringify({ before: event.before, after: event.after, changes: event.changes }, null, 2)}</pre></details></td>
      <td><code>{String(event.hash || "").slice(0, 12)}</code></td>
    </tr>
  );
}

