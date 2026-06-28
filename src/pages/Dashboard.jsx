import { useState } from "react";
import { can } from "../config/constants.js";
import { byId, budgetUsageRows, dateInRange, fmt, infrastructureUsageRows, num } from "../lib/utils.js";
import { CompactRequestList, Header, Kpi, PanelTitle, UsageBarChart, UsageTable, WorkflowStrip } from "../components/common.jsx";

export function Dashboard({ data, user, api, refresh }) {
  const d = data.dashboard;
  if (!d) return <div className="panel">Loading dashboard...</div>;
  const urgent = data.requisitions.filter((r) => ["SUBMITTED", "STORE_VERIFIED", "APPROVED"].includes(r.status)).slice(0, 5);
  const budgetRows = budgetUsageRows(data);
  const infraRows = infrastructureUsageRows(data);
  return (
    <>
      <Header title="Dashboard" eyebrow="Operations overview" subtitle="Live status from requisitions, receipts, issues, and imported manual records." />
      <div className="kpis">
        <Kpi label="Pending Store Verification" value={d.requisitions.pendingFirstApproval} />
        <Kpi label="Pending Final Approval" value={d.requisitions.pendingFinalApproval} />
        <Kpi label="Inventory Items" value={d.inventory.itemCount} />
        <Kpi label="Low / Zero Stock" value={d.inventory.lowStock} />
      </div>
      <WorkflowStrip />
      <div className="dashboard-overview-grid">
        <div className="panel">
          <PanelTitle title="Budget Head Chart" subtitle="Received/used amount and remaining balance for each budget head." />
          <UsageBarChart rows={budgetRows} emptyText="No budget heads yet." />
        </div>
        <div className="panel">
          <PanelTitle title="Needs Attention" subtitle="Requests waiting for verification, approval, or order placement." />
          {urgent.length ? <CompactRequestList rows={urgent} /> : <div className="empty compact-empty">No active approvals right now.</div>}
        </div>
      </div>
      <OrderedItemFilter data={data} />
      <div className="dashboard-table-stack">
        <div className="panel">
          <PanelTitle title="Budget Head Usage" subtitle="Budget amount, received/used amount, and remaining balance." />
          <UsageTable rows={budgetRows} variant="budget" emptyText="No budget heads yet." />
        </div>
        <div className="panel">
          <PanelTitle title="Key Infrastructure Usage" subtitle="Amount used by each key infrastructure from arrivals and repair/return costs." />
          <UsageTable rows={infraRows} variant="infrastructure" emptyText="No key infrastructure yet." />
        </div>
      </div>
      {can(user, "admin:crud") ? <AdminCrudPanel data={data} api={api} refresh={refresh} /> : null}
    </>
  );
}



function OrderedItemFilter({ data }) {
  const [itemId, setItemId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const rows = [];
  const itemMap = byId(data.items);
  const orderedSource = data.dashboard?.orderedItems?.length
    ? data.dashboard.orderedItems
    : data.requisitions.flatMap((requisition) => (requisition.lines || []).map((line) => ({ ...line, date: requisition.date || requisition.createdAt || "" })));
  for (const line of orderedSource) {
    if (!dateInRange(line.date, dateFrom, dateTo)) continue;
    if (itemId && line.itemId !== itemId) continue;
    const key = `${line.itemId || line.itemName}::${line.unit || ""}`;
    const current = rows.find((row) => row.key === key);
    if (current) {
      current.quantity += Number(line.quantity || 0);
      current.requests += 1;
    } else {
      rows.push({
        key,
        itemName: line.itemName || itemMap[line.itemId]?.name || "Item",
        unit: line.unit || itemMap[line.itemId]?.unit || "",
        quantity: Number(line.quantity || 0),
        requests: 1
      });
    }
  }
  rows.sort((a, b) => a.itemName.localeCompare(b.itemName));
  const totalQty = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  return (
    <div className="panel">
      <PanelTitle title="Ordered Item Filter" subtitle="Count requested item quantities from requisitions in a selected period." />
      <div className="table-tools filter-grid">
        <label>Item <select value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">All items</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label>To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        <div className="filter-total"><span>Total ordered</span><strong>{num(totalQty)}</strong></div>
      </div>
      {rows.length ? (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Item</th><th>Ordered Quantity</th><th>Unit</th><th>Requisition Lines</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.key}><td><strong>{fmt(row.itemName)}</strong></td><td>{num(row.quantity)}</td><td>{fmt(row.unit)}</td><td>{num(row.requests)}</td></tr>)}</tbody>
          </table>
        </div>
      ) : <div className="empty compact-empty">No matching requisition items.</div>}
    </div>
  );
}



function AdminCrudPanel({ data, api, refresh }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function patchRecord(path, record, fields) {
    const body = {};
    for (const field of fields) {
      const current = record[field] ?? "";
      const next = window.prompt(`Edit ${field}`, current);
      if (next === null) return;
      body[field] = next;
    }
    setMessage("");
    setError("");
    try {
      await api(`${path}/${record.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setMessage("Record updated.");
      await refresh("dashboard");
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteRecord(path, record, label) {
    if (!window.confirm(`Delete ${label}? This keeps the audit record.`)) return;
    setMessage("");
    setError("");
    try {
      await api(`${path}/${record.id}`, { method: "DELETE" });
      setMessage("Record deleted from normal views and kept for audit.");
      await refresh("dashboard");
    } catch (err) {
      setError(err.message);
    }
  }

  const sections = [
    {
      title: "Budget Heads",
      path: "/api/budget-heads",
      rows: data.budgetHeads,
      fields: ["name", "amount", "status"],
      columns: [["Name", "name"], ["Amount", "amount"], ["Status", "status"]]
    },
    {
      title: "Key Infrastructures",
      path: "/api/infrastructures",
      rows: data.infrastructures,
      fields: ["name", "status"],
      columns: [["Name", "name"], ["Status", "status"]]
    },
    {
      title: "Items",
      path: "/api/items",
      rows: data.items,
      fields: ["name", "category", "unit"],
      columns: [["Name", "name"], ["Category", "category"], ["Unit", "unit"]]
    },
    {
      title: "Requisitions",
      path: "/api/requisitions",
      rows: data.requisitions,
      fields: ["requisitionNo", "status", "purpose"],
      columns: [["No", "requisitionNo"], ["Status", "status"], ["Purpose", "purpose"]]
    },
    {
      title: "Receipts",
      path: "/api/receipts",
      rows: data.receipts,
      fields: ["challanNo", "dvNo", "billNo", "remarks"],
      columns: [["Challan", "challanNo"], ["DV", "dvNo"], ["Bill", "billNo"]]
    },
    {
      title: "Issues",
      path: "/api/issues",
      rows: data.issues,
      fields: ["issueChallanNo", "issuedTo", "remarks"],
      columns: [["Challan", "issueChallanNo"], ["Duty Person", "issuedTo"], ["Remarks", "remarks"]]
    }
  ];

  return (
    <div className="panel admin-crud">
      <PanelTitle title="Admin Edit / Delete" subtitle="Soft delete hides records from normal views while preserving audit history." />
      {message ? <div className="success">{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      <div className="admin-crud-grid">
        {sections.map((section) => (
          <div className="crud-section" key={section.title}>
            <h3>{section.title}</h3>
            <div className="table-wrap">
              <table>
                <thead><tr>{section.columns.map(([label]) => <th key={label}>{label}</th>)}<th>Actions</th></tr></thead>
                <tbody>
                  {section.rows.slice(0, 8).map((row) => (
                    <tr key={row.id}>
                      {section.columns.map(([, field]) => <td key={field}>{fmt(row[field])}</td>)}
                      <td>
                        <div className="inline-actions">
                          <button type="button" onClick={() => patchRecord(section.path, row, section.fields)}>Edit</button>
                          <button type="button" className="danger" onClick={() => deleteRecord(section.path, row, fmt(row.name || row.requisitionNo || row.challanNo || row.issueChallanNo || row.id))}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!section.rows.length ? <tr><td colSpan={section.columns.length + 1}>No records.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


