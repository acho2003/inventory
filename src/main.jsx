import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Boxes,
  ClipboardList,
  FileDown,
  FolderKanban,
  LogOut,
  PackageCheck,
  PackageMinus,
  Plus,
  Search,
  ShieldCheck,
  Trash2
} from "lucide-react";
import "./styles.css";

const statusLabels = {
  SUBMITTED: "Submitted",
  STORE_VERIFIED: "Store verified",
  APPROVED: "Final approved",
  ORDERED: "Order placed",
  PARTIALLY_RECEIVED: "Partly received",
  RECEIVED: "Received",
  CLOSED: "Closed",
  REJECTED: "Rejected",
  IMPORTED_FOLLOW_UP: "Imported follow-up"
};

const APP_NAME = "Yarju_OAP_inventory";

const stockEventTypes = {
  TRANSFER: "Transfer",
  DISPOSED: "Disposed",
  SPOILED: "Spoiled",
  REPAIR_NOTE: "Repair note",
  RETURNED_FROM_REPAIR: "Returned from repair"
};

const itemCategories = [
  "Fuel & Lubricants",
  "Blasting Materials",
  "Equipment & Vehicle Hiring Charges",
  "Transportation Charges",
  "Construction Materials",
  "Plumbing Materials",
  "Tools & Equipments",
  "Office Stationery",
  "Miscellaneous",
  "Electrical Items",
  "Paints & Coatings",
  "Fastening & Joining Materials",
  "Sanitary Materials",
  "Accommodation & Kitchen Supplies",
  "Operating Expenses",
  "Ritual Expenses",
  "Tax (GST)"
];

const demoUsers = {
  admin: ["admin", "admin123"],
  requester: ["requester", "request123"],
  store: ["store", "store123"],
  approver: ["approver", "approve123"]
};

const roleLabels = {
  admin: "Admin",
  requester: "Requisition",
  store: "Store / PMU",
  approver: "Final Approver"
};

function can(user, permission) {
  return Boolean(user?.permissions?.includes(permission));
}

const viewPermissions = {
  dashboard: ["dashboard:read"],
  projects: ["project:read"],
  requisitions: ["requisition:read", "requisition:create"],
  approvals: ["requisition:first_approve", "requisition:final_approve"],
  receive: ["receipt:create"],
  inventory: ["inventory:read"],
  issue: ["issue:create"],
  reports: ["report:read"],
  audit: ["audit:read"]
};

function canAny(user, permissions = []) {
  return permissions.some((permission) => can(user, permission));
}

function viewAllowed(user, view) {
  return canAny(user, viewPermissions[view] || []);
}

function firstAllowedView(user) {
  return ["dashboard", "requisitions", "approvals", "receive", "inventory", "issue", "projects", "reports", "audit"].find((entry) => viewAllowed(user, entry)) || "requisitions";
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function num(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmt(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function matchesSearch(values, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}

function lineSummary(lines = []) {
  if (!lines.length) return "No items";
  const first = lines[0];
  const suffix = lines.length > 1 ? ` +${lines.length - 1} more` : "";
  return `${first.itemName || "Item"} (${num(first.quantity)} ${first.unit || ""})${suffix}`;
}

function byId(rows = []) {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}

function summarizeLedger(rows = []) {
  const stock = new Map();
  const incomingTypes = new Set(["RECEIPT", "TRANSFER_IN", "RETURNED_FROM_REPAIR", "ADJUSTMENT"]);
  const outgoingTypes = new Set(["ISSUE", "TRANSFER_OUT", "DISPOSED", "SPOILED"]);
  for (const movement of rows) {
    if (movement.type === "REPAIR_NOTE") continue;
    const key = `${movement.infrastructureId || ""}::${movement.itemId}`;
    const current = stock.get(key) || {
      itemId: movement.itemId,
      itemName: movement.itemName,
      category: movement.category || "General",
      unit: movement.unit || "",
      infrastructureId: movement.infrastructureId || "",
      received: 0,
      issued: 0,
      balance: 0,
      lastMovementAt: movement.date
    };
    if (incomingTypes.has(movement.type)) current.received += Number(movement.quantity || 0);
    if (outgoingTypes.has(movement.type)) current.issued += Number(movement.quantity || 0);
    current.balance = current.received - current.issued;
    if (!current.lastMovementAt || movement.date > current.lastMovementAt) current.lastMovementAt = movement.date;
    stock.set(key, current);
  }
  return [...stock.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

function summarizeAllStock(inventory = [], ledger = []) {
  const rows = new Map();
  for (const stock of inventory) {
    const current = rows.get(stock.itemId) || {
      itemId: stock.itemId,
      itemName: stock.itemName,
      category: stock.category || "General",
      unit: stock.unit || "",
      receivedAtArrival: 0,
      storeStock: 0,
      infrastructureStock: 0,
      disposedOrSpoiled: 0,
      totalAvailable: 0,
      lastMovementAt: stock.lastMovementAt || ""
    };
    if (stock.infrastructureId) current.infrastructureStock += Number(stock.balance || 0);
    else current.storeStock += Number(stock.balance || 0);
    if (!current.lastMovementAt || String(stock.lastMovementAt || "") > current.lastMovementAt) current.lastMovementAt = stock.lastMovementAt || "";
    rows.set(stock.itemId, current);
  }
  for (const movement of ledger) {
    const current = rows.get(movement.itemId) || {
      itemId: movement.itemId,
      itemName: movement.itemName,
      category: movement.category || "General",
      unit: movement.unit || "",
      receivedAtArrival: 0,
      storeStock: 0,
      infrastructureStock: 0,
      disposedOrSpoiled: 0,
      totalAvailable: 0,
      lastMovementAt: movement.date || ""
    };
    if (movement.type === "RECEIPT") current.receivedAtArrival += Number(movement.quantity || 0);
    if (["DISPOSED", "SPOILED"].includes(movement.type)) current.disposedOrSpoiled += Number(movement.quantity || 0);
    if (!current.lastMovementAt || String(movement.date || "") > current.lastMovementAt) current.lastMovementAt = movement.date || "";
    rows.set(movement.itemId, current);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, totalAvailable: row.storeStock + row.infrastructureStock }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}

function lineCategory(line = {}) {
  return line.category || line.specification || "";
}

function lineAmount(line = {}) {
  const explicit = Number(line.amount || 0);
  return explicit || (Number(line.rate || 0) * Number(line.quantity || 0));
}

function amountUsedFor(records = [], field, id) {
  return records
    .filter((record) => record[field] === id)
    .reduce((sum, record) => sum + (record.lines || []).reduce((lineSum, line) => lineSum + lineAmount(line), 0), 0);
}

function requisitionReceivedQty(receipts = [], requisitionId, itemId) {
  return receipts
    .filter((receipt) => receipt.requisitionId === requisitionId)
    .reduce((sum, receipt) => sum + (receipt.lines || [])
      .filter((line) => line.itemId === itemId)
      .reduce((lineSum, line) => lineSum + Number(line.quantity || 0), 0), 0);
}

function dateInRange(date, from, to) {
  const value = String(date || "").slice(0, 10);
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

function budgetUsageRows(data) {
  if (data.dashboard?.budgetUsage) return data.dashboard.budgetUsage;
  return data.budgetHeads.map((head) => {
    const used = amountUsedFor(data.receipts, "budgetHeadId", head.id);
    const amount = Number(head.amount || 0);
    return {
      id: head.id,
      name: head.name,
      amount,
      status: head.status || "Active",
      used,
      balance: amount - used
    };
  });
}

function infrastructureUsageRows(data) {
  if (data.dashboard?.infrastructureUsage) return data.dashboard.infrastructureUsage;
  return data.infrastructures.map((infra) => {
    const used = amountUsedFor(data.receipts, "infrastructureId", infra.id)
      + data.stockEvents
        .filter((event) => ["REPAIR_NOTE", "RETURNED_FROM_REPAIR"].includes(event.type) && (event.fromInfrastructureId || event.toInfrastructureId) === infra.id)
        .reduce((sum, event) => sum + Number(event.amount || 0), 0);
    return {
      id: infra.id,
      name: infra.name,
      status: infra.status || "Active",
      used
    };
  });
}

function useApi(token) {
  return useMemo(() => async (path, options = {}) => {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(path, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }, [token]);
}

function Login({ onLogin }) {
  const [error, setError] = useState("");
  const [form, setForm] = useState({ username: "", password: "" });

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await onLogin(form.username, form.password);
    } catch (err) {
      setError(err.message);
    }
  }

  async function demoLogin(key) {
    setError("");
    try {
      await onLogin(...demoUsers[key]);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="login">
      <div className="login-panel">
        <div className="login-copy">
          <h1>{APP_NAME}</h1>
          <p>Prepare requisitions, approve material requests, receive stock with Challan/DV/Bill details, and track every item in one ledger.</p>
          <div className="login-steps">
            <span>1. Request</span>
            <span>2. Approve</span>
            <span>3. Receive</span>
            <span>4. Track</span>
          </div>
        </div>
        <form className="login-form" onSubmit={submit}>
          <div>
            <h2>Sign in</h2>
            <p className="muted">Choose a demo role or enter credentials manually.</p>
          </div>
          <label>Username <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required /></label>
          <label>Password <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
          {error ? <div className="error">{error}</div> : null}
          <button className="primary" type="submit">Sign in</button>
          <div className="demo-users">
            {Object.keys(demoUsers).map((key) => (
              <button key={key} type="button" onClick={() => demoLogin(key)}>
                <strong>{roleLabels[key]}</strong>
                <span>{demoUsers[key][0]}</span>
              </button>
            ))}
          </div>
        </form>
      </div>
    </section>
  );
}

function App() {
  const [token, setToken] = useState(localStorage.getItem("yarju_token") || "");
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [data, setData] = useState({ dashboard: null, projects: [], budgetHeads: [], infrastructures: [], items: [], requisitions: [], receipts: [], issues: [], inventory: [], ledger: [], stockEvents: [], auditEvents: [], auditSummary: null, reports: null });
  const [loading, setLoading] = useState(true);
  const api = useApi(token);

  async function fetchIf(allowed, path, fallback) {
    return allowed ? api(path) : fallback;
  }

  async function loadBase(currentUser = user) {
    const [dashboard, projects, budgetHeads, infrastructures, items, requisitions, receipts, issues, inventory, stockEvents] = await Promise.all([
      fetchIf(can(currentUser, "dashboard:read"), "/api/dashboard", null),
      fetchIf(can(currentUser, "project:read"), "/api/projects", []),
      fetchIf(can(currentUser, "budget:read"), "/api/budget-heads", []),
      fetchIf(can(currentUser, "infrastructure:read"), "/api/infrastructures", []),
      fetchIf(can(currentUser, "item:read"), "/api/items", []),
      fetchIf(can(currentUser, "requisition:read"), "/api/requisitions", []),
      fetchIf(can(currentUser, "receipt:read"), "/api/receipts", []),
      fetchIf(can(currentUser, "issue:read"), "/api/issues", []),
      fetchIf(can(currentUser, "inventory:read"), "/api/inventory", []),
      fetchIf(can(currentUser, "stock:event:read"), "/api/stock-events", [])
    ]);
    setData((prev) => ({ ...prev, dashboard, projects, budgetHeads, infrastructures, items, requisitions, receipts, issues, inventory, stockEvents }));
  }

  async function refresh(nextView = view, currentUser = user) {
    if (!token) return;
    await loadBase(currentUser);
    if (can(currentUser, "ledger:read") && (nextView === "inventory" || nextView === "projects")) {
      const ledger = await api("/api/ledger");
      setData((prev) => ({ ...prev, ledger }));
    }
    if (!can(currentUser, "ledger:read")) {
      setData((prev) => ({ ...prev, ledger: [] }));
    }
    if (can(currentUser, "report:read") && nextView === "reports") {
      const reports = await api("/api/reports");
      setData((prev) => ({ ...prev, reports }));
    }
    if (!can(currentUser, "report:read")) {
      setData((prev) => ({ ...prev, reports: null }));
    }
    if (can(currentUser, "audit:read") && nextView === "audit") {
      const [auditEvents, auditSummary] = await Promise.all([api("/api/audit-events"), api("/api/audit-summary")]);
      setData((prev) => ({ ...prev, auditEvents, auditSummary }));
    }
    if (!can(currentUser, "audit:read")) {
      setData((prev) => ({ ...prev, auditEvents: [], auditSummary: null }));
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const me = await api("/api/me");
        if (cancelled) return;
        setUser(me);
        const allowedView = firstAllowedView(me);
        setView(allowedView);
        await refresh(allowedView, me);
      } catch {
        localStorage.removeItem("yarju_token");
        setToken("");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    boot();
    return () => { cancelled = true; };
  }, [token]);

  async function login(username, password) {
    const result = await api("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
    localStorage.setItem("yarju_token", result.token);
    setToken(result.token);
    setUser(result.user);
    setView(firstAllowedView(result.user));
  }

  async function changeView(nextView) {
    if (!viewAllowed(user, nextView)) return;
    setView(nextView);
    await refresh(nextView);
  }

  useEffect(() => {
    if (user && !viewAllowed(user, view)) setView(firstAllowedView(user));
  }, [user, view]);

  if (loading) return <div className="login"><div className="panel">Loading...</div></div>;
  if (!token || !user) return <Login onLogin={login} />;

  const navItems = [
    ["dashboard", "Dashboard", BarChart3, viewAllowed(user, "dashboard")],
    ["projects", "Budget Heads", FolderKanban, viewAllowed(user, "projects")],
    ["requisitions", "Requisitions", ClipboardList, viewAllowed(user, "requisitions")],
    ["approvals", "Approvals", ShieldCheck, viewAllowed(user, "approvals")],
    ["receive", "Receive Stock", PackageCheck, viewAllowed(user, "receive")],
    ["inventory", "Inventory", Boxes, viewAllowed(user, "inventory")],
    ["issue", "Issue Stock", PackageMinus, viewAllowed(user, "issue")],
    ["reports", "Reports", FileDown, viewAllowed(user, "reports")],
    ["audit", "Audit Trail", Activity, viewAllowed(user, "audit")]
  ];

  return (
    <section className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>{APP_NAME}</strong>
          <span>Materials and stock control</span>
        </div>
        <div className="userbox">
          <div className="avatar">{user.name.slice(0, 1)}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{roleLabels[user.role] || user.role}</span>
          </div>
        </div>
        <nav className="nav">
          {navItems.filter((item) => item[3]).map(([id, label, Icon]) => (
            <button key={id} className={view === id ? "active" : ""} onClick={() => changeView(id)}>
              <Icon size={17} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <button className="sidebar-action" onClick={() => { localStorage.removeItem("yarju_token"); setToken(""); setUser(null); }}>
          <LogOut size={16} />
          <span>Sign out</span>
        </button>
      </aside>
      <main className="content">
        <CurrentView view={view} user={user} data={data} api={api} refresh={refresh} setView={setView} token={token} />
      </main>
    </section>
  );
}

function Header({ title, subtitle, eyebrow }) {
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

function CurrentView(props) {
  if (!viewAllowed(props.user, props.view)) return <AccessDenied />;
  if (props.view === "dashboard") return <Dashboard {...props} />;
  if (props.view === "projects") return <ProjectsPage {...props} />;
  if (props.view === "requisitions") return <Requisitions {...props} />;
  if (props.view === "approvals") return <Approvals {...props} />;
  if (props.view === "receive") return <ReceiveStock {...props} />;
  if (props.view === "inventory") return <Inventory {...props} />;
  if (props.view === "issue") return <IssueStock {...props} />;
  if (props.view === "reports") return <Reports {...props} />;
  if (props.view === "audit") return <AuditTrail {...props} />;
}

function AccessDenied() {
  return (
    <div className="panel">
      <PanelTitle title="Access restricted" subtitle="This role is not allowed to view this feature." />
    </div>
  );
}

function Dashboard({ data, user, api, refresh }) {
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

function Kpi({ label, value }) {
  const display = typeof value === "number" || (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) ? num(value) : fmt(value);
  return <div className="kpi"><span>{label}</span><strong>{display}</strong></div>;
}

function SegmentedTabs({ tabs, active, onChange }) {
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

function UsageTable({ rows, emptyText, variant = "budget" }) {
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

function UsageBarChart({ rows, emptyText }) {
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

function WorkflowStrip() {
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

function PanelTitle({ title, subtitle }) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}

function CompactRequestList({ rows }) {
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

function BudgetHeadSelect({ budgetHeads, value, onChange }) {
  const rows = budgetHeads;
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select budget head</option>
      {rows.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select>
  );
}

function InfrastructureSelect({ infrastructures, value, onChange, storeOption = false, required = false }) {
  const rows = infrastructures;
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} required={required}>
      <option value="">{storeOption ? "Store / Not Assigned" : "Select infrastructure"}</option>
      {rows.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select>
  );
}

function ProjectsPage({ user, data, api, refresh }) {
  const [selectedBudgetHeadId, setSelectedBudgetHeadId] = useState(data.budgetHeads[0]?.id || "");
  const [budgetForm, setBudgetForm] = useState({ name: "", amount: "", status: "Active" });
  const [infraForm, setInfraForm] = useState({ name: "", status: "Active" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const budgetMap = byId(data.budgetHeads);
  const selectedBudgetHead = budgetMap[selectedBudgetHeadId] || data.budgetHeads[0];
  const infraRows = data.infrastructures;
  const ordered = data.requisitions.filter((req) => req.budgetHeadId === selectedBudgetHead?.id);
  const ledgerRows = data.ledger.filter((row) => row.budgetHeadId === selectedBudgetHead?.id);

  async function submitBudget(event) {
    event.preventDefault();
    await submitEntity("/api/budget-heads", budgetForm, () => setBudgetForm({ name: "", amount: "", status: "Active" }), "Budget head added.");
  }

  async function submitInfra(event) {
    event.preventDefault();
    await submitEntity("/api/infrastructures", infraForm, () => setInfraForm({ name: "", status: "Active" }), "Infrastructure added.");
  }

  async function submitEntity(path, body, reset, okMessage) {
    setMessage("");
    setError("");
    try {
      await api(path, { method: "POST", body: JSON.stringify(body) });
      reset();
      setMessage(okMessage);
      await refresh("projects");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <Header title="Budget Heads" eyebrow="Key activities" subtitle="Manage budget heads and key infrastructure activities." />
      {message ? <div className="success">{message}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {can(user, "budget:create") || can(user, "infrastructure:create") ? (
        <div className="grid two">
          <form className="panel grid" onSubmit={submitBudget}>
            <PanelTitle title="Add Budget Head" />
            <label>Budget Head Name <input value={budgetForm.name} onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })} required /></label>
            <label>Amount <input type="number" min="0" step="0.01" value={budgetForm.amount} onChange={(e) => setBudgetForm({ ...budgetForm, amount: e.target.value })} /></label>
            <label>Status <select value={budgetForm.status} onChange={(e) => setBudgetForm({ ...budgetForm, status: e.target.value })}><option>Active</option><option>Pending</option><option>Closed</option></select></label>
            <button className="primary" type="submit">Add budget head</button>
          </form>
          <form className="panel grid" onSubmit={submitInfra}>
            <PanelTitle title="Add Key Infrastructure" />
            <label>Infrastructure Name <input value={infraForm.name} onChange={(e) => setInfraForm({ ...infraForm, name: e.target.value })} required /></label>
            <label>Status <select value={infraForm.status} onChange={(e) => setInfraForm({ ...infraForm, status: e.target.value })}><option>Active</option><option>Pending</option><option>Closed</option></select></label>
            <button className="primary" type="submit">Add infrastructure</button>
          </form>
        </div>
      ) : null}
      <div className="grid two">
        <div className="panel">
          <PanelTitle title="Budget Heads" subtitle="Budget head name, amount, and status." />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Budget Head Name</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>{data.budgetHeads.map((head) => (
                <tr key={head.id} className={head.id === selectedBudgetHead?.id ? "selected-row" : ""} onClick={() => setSelectedBudgetHeadId(head.id)}>
                  <td><strong>{head.name}</strong></td>
                  <td>{num(head.amount)}</td>
                  <td><span className="status">{head.status || "Active"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
        <div className="panel">
          <PanelTitle title="Key Infrastructures" subtitle="Independent master list. Budget linkage happens when a requisition or stock transaction is created." />
          <div className="table-wrap">
            <table>
              <thead><tr><th>Infrastructure Name</th><th>Status</th></tr></thead>
              <tbody>{infraRows.map((infra) => (
                <tr key={infra.id}>
                  <td><strong>{infra.name}</strong></td>
                  <td><span className="status">{infra.status || "Active"}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {!infraRows.length ? <div className="empty compact-empty">No key infrastructures yet.</div> : null}
        </div>
      </div>
      <div className="panel">
        <PanelTitle title={selectedBudgetHead?.name || "Budget Head Detail"} subtitle="Ordered and issued items linked to the selected budget head through transactions." />
        <div className="detail-stack">
          <DetailBlock title="Ordered Items" rows={ordered.flatMap((req) => (req.lines || []).map((line) => `${req.requisitionNo}: ${line.itemName} (${lineCategory(line) || "No category"}) - ${num(line.quantity)} ${line.unit}`)).slice(0, 12)} />
          <DetailBlock title="Issued Items" rows={ledgerRows.filter((row) => row.type === "ISSUE").map((row) => `${row.itemName} (${num(row.quantity)} ${row.unit})`).slice(0, 12)} />
        </div>
      </div>
    </>
  );
}

function DetailBlock({ title, rows }) {
  return (
    <div className="detail-block">
      <strong>{title}</strong>
      {rows.length ? rows.map((row, index) => <span key={`${row}-${index}`}>{row}</span>) : <span className="muted">No records yet.</span>}
    </div>
  );
}

function LineEditor({ items, lines, setLines, receipt = false, arrival = false, inventory = [] }) {
  function update(index, patch) {
    setLines(lines.map((line, i) => i === index ? { ...line, ...patch } : line));
  }
  function matchItem(name) {
    const key = String(name || "").trim().toLowerCase();
    return items.find((item) => item.name.toLowerCase() === key);
  }
  function stockStatsForLine(line) {
    const item = line.itemId ? items.find((entry) => entry.id === line.itemId) : matchItem(line.itemName);
    if (!item) return null;
    const rows = inventory.filter((entry) => entry.itemId === item.id);
    return {
      store: rows.filter((entry) => !entry.infrastructureId).reduce((sum, entry) => sum + Number(entry.balance || 0), 0),
      total: rows.reduce((sum, entry) => sum + Number(entry.balance || 0), 0)
    };
  }
  return (
    <div className="line-section">
      <div className="line-section-head">
        <div>
          <strong>Item lines</strong>
          <span>Material description, quantity, unit, and remarks.</span>
        </div>
        <button type="button" className="soft-button" onClick={() => setLines([...lines, blankLine()])}>
          <Plus size={16} />
          <span>Add item</span>
        </button>
      </div>
      <datalist id="itemOptions">{items.map((item) => <option key={item.id} value={item.name} />)}</datalist>
      <div className="line-editor">
        {lines.map((line, index) => {
          const stockStats = inventory.length ? stockStatsForLine(line) : null;
          return (
          <div className={`line-row ${receipt ? "receipt-line" : ""} ${stockStats ? "stock-line" : ""}`} key={index}>
            <label>Item <input list="itemOptions" value={line.itemName} onChange={(e) => {
              const item = matchItem(e.target.value);
              update(index, {
                itemName: e.target.value,
                itemId: item?.id || line.itemId || "",
                category: item?.category || line.category,
                specification: item?.category || line.specification,
                unit: item?.unit || line.unit
              });
            }} required /></label>
            <label>Category
              <select value={line.category ?? line.specification ?? ""} onChange={(e) => update(index, { category: e.target.value, specification: e.target.value })}>
                <option value="">Select category</option>
                {itemCategories.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label>Qty <input type="number" step="0.01" min="0.01" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} required /></label>
            <label className="field-control">
              <span>Unit</span>
              <input value={line.unit} onChange={(e) => update(index, { unit: e.target.value })} />
            </label>
            {stockStats ? <div className="stock-hint-cell"><span className="stock-hint">Store stock: {num(stockStats.store)} {line.unit}{stockStats.total !== stockStats.store ? ` | Total stock: ${num(stockStats.total)} ${line.unit}` : ""}</span></div> : null}
            {receipt ? <label>Rate <input type="number" step="0.01" min="0" value={line.rate || ""} onChange={(e) => {
              const rate = e.target.value;
              const quantity = Number(line.quantity || 0);
              update(index, { rate, amount: quantity && rate !== "" ? String(Number(rate || 0) * quantity) : line.amount });
            }} /></label> : null}
            {receipt ? <label>Amount <input type="number" step="0.01" min="0" value={line.amount || ""} onChange={(e) => update(index, { amount: e.target.value })} /></label> : null}
            {arrival ? <label className="check-label">Arrived <input type="checkbox" checked={line.reached !== false} onChange={(e) => update(index, { reached: e.target.checked })} /></label> : null}
            <label>Remarks <input value={line.remarks} onChange={(e) => update(index, { remarks: e.target.value })} /></label>
            <button type="button" className="icon-button" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))} title="Remove item line">
              <Trash2 size={16} />
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function blankLine() {
  return { itemName: "", category: "", specification: "", quantity: "", unit: "", remarks: "" };
}

function Requisitions({ user, data, api, refresh }) {
  const [form, setForm] = useState({ requisitionNo: "", requestDate: today(), budgetHeadId: "", infrastructureId: "", purpose: "" });
  const [lines, setLines] = useState([blankLine(), blankLine()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const created = await api("/api/requisitions", { method: "POST", body: JSON.stringify({ ...form, lines }) });
      setForm({ requisitionNo: "", requestDate: today(), budgetHeadId: "", infrastructureId: "", purpose: "" });
      setLines([blankLine(), blankLine()]);
      setMessage(`Requisition ${created.requisitionNo} submitted for store verification.`);
      await refresh("requisitions");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <Header title="Requisitions" eyebrow="Request materials" subtitle="Order request, store verification, final approval, then order placement." />
      <div className="requisition-stack">
        <ApprovalStatusPanel requisitions={data.requisitions} receipts={data.receipts} />
        {can(user, "requisition:create") && (!data.budgetHeads.length || !data.items.length) ? (
          <div className="workflow-note">
            <strong>Setup needed before requests can move smoothly.</strong>
            <span>Add budget heads, key infrastructures, and item names first so requisitions can be linked and tracked cleanly.</span>
          </div>
        ) : null}
        {can(user, "requisition:create") ? (
          <form className="panel grid requisition-form-panel" onSubmit={submit}>
            <PanelTitle title="New Requisition" subtitle="Enter the request details. Document numbers are added only when stock is received." />
            {message ? <div className="success">{message}</div> : null}
            {error ? <div className="error">{error}</div> : null}
            <div className="grid two">
              <label>Requisition No <input value={form.requisitionNo} onChange={(e) => setForm({ ...form, requisitionNo: e.target.value })} placeholder="Auto if blank" /></label>
              <label>Request Date <input type="date" value={form.requestDate} onChange={(e) => setForm({ ...form, requestDate: e.target.value })} /></label>
            </div>
            <div className="grid two">
              <label>Budget Head <BudgetHeadSelect budgetHeads={data.budgetHeads} value={form.budgetHeadId} onChange={(budgetHeadId) => setForm({ ...form, budgetHeadId })} /></label>
              <label>Key Infrastructure <InfrastructureSelect infrastructures={data.infrastructures} value={form.infrastructureId} onChange={(infrastructureId) => setForm({ ...form, infrastructureId })} /></label>
            </div>
            <label>Purpose <textarea rows="2" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></label>
            <LineEditor items={data.items} lines={lines} setLines={setLines} />
            <div className="notice">Challan No, DV No, and Bill No are recorded only when approved stock reaches the store.</div>
            <button className="primary" type="submit">Submit requisition</button>
          </form>
        ) : (
          <div className="panel">
            <PanelTitle title="Requisition Register" subtitle="Your role can review status, approvals, and receipt progress here." />
            <div className="notice">Use the Approvals, Receive Stock, and Issue Stock screens to move approved items through the store and into key infrastructures.</div>
          </div>
        )}
      </div>
      <div className="panel"><PanelTitle title="All Requisitions" subtitle="Search by request number, item, status, purpose, or supply order." /><RequisitionTable rows={data.requisitions} receipts={data.receipts} /></div>
    </>
  );
}

function ApprovalStatusPanel({ requisitions, receipts }) {
  const active = requisitions.filter((r) => ["SUBMITTED", "STORE_VERIFIED", "APPROVED", "ORDERED", "PARTIALLY_RECEIVED"].includes(r.status)).slice(0, 6);
  const statuses = ["SUBMITTED", "STORE_VERIFIED", "APPROVED", "REJECTED", "PARTIALLY_RECEIVED", "RECEIVED"];
  return (
    <aside className="panel approval-status-panel">
      <PanelTitle title="Approvals" subtitle="Status is visible to requester, store, approver, and admin." />
      <div className="status-grid">
        {statuses.map((status) => (
          <div className="status-count" key={status}>
            <span className={`status ${status}`}>{statusLabels[status]}</span>
            <strong>{num(requisitions.filter((r) => r.status === status).length)}</strong>
          </div>
        ))}
      </div>
      <div className="workflow-mini">
        <strong>Workflow</strong>
        <span>{"Request > Store verify > Final approve > Order > Receive > Issue to infrastructure/duty person"}</span>
      </div>
      <div className="request-list">
        {active.map((row) => <RequisitionProgressCard key={row.id} row={row} receipts={receipts} />)}
        {!active.length ? <div className="empty compact-empty">No active requisitions.</div> : null}
      </div>
    </aside>
  );
}

function RequisitionProgressCard({ row, receipts }) {
  const orderedQty = (row.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const receivedQty = (row.lines || []).reduce((sum, line) => sum + requisitionReceivedQty(receipts, row.id, line.itemId), 0);
  return (
    <div className="request-card progress-card">
      <div>
        <strong>{fmt(row.requisitionNo)}</strong>
        <span>{lineSummary(row.lines)}</span>
      </div>
      <div className="progress-side">
        <span className={`status ${row.status}`}>{statusLabels[row.status] || row.status}</span>
        <small>{num(receivedQty)} / {num(orderedQty)} received</small>
      </div>
    </div>
  );
}

function RequisitionTable({ rows, receipts = [], compact = false }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = rows.filter((r) => {
    const statusOk = status === "all" || r.status === status;
    const queryOk = matchesSearch([r.requisitionNo, r.requestDate, r.status, r.purpose, r.supplyOrderNo, r.rejectionReason, ...(r.lines || []).map((line) => line.itemName)], query);
    return statusOk && queryOk;
  });
  if (!rows.length) return <div className="empty">No requisitions found.</div>;
  return (
    <>
      {!compact ? (
        <div className="table-tools">
          <SearchBox value={query} onChange={setQuery} placeholder="Search requisitions" />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      ) : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>No</th><th>Date</th><th>Status</th><th>Items</th><th>Received</th><th>Purpose</th><th>Supply Order</th></tr></thead>
          <tbody>
            {filtered.map((r) => {
              const orderedQty = (r.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
              const receivedQty = (r.lines || []).reduce((sum, line) => sum + requisitionReceivedQty(receipts, r.id, line.itemId), 0);
              return (
                <tr key={r.id}>
                  <td><strong>{fmt(r.requisitionNo)}</strong></td>
                  <td>{fmt(r.requestDate)}</td>
                  <td>
                    <span className={`status ${r.status}`}>{statusLabels[r.status] || r.status}</span>
                    {r.status === "REJECTED" && r.rejectionReason ? <div className="rejection-note compact">Reason: {r.rejectionReason}</div> : null}
                  </td>
                  <td>{compact ? num(r.lines?.length || 0) : r.lines?.map((l) => <div key={l.id || `${l.itemName}-${l.quantity}`}>{l.itemName} ({num(l.quantity)} {l.unit})</div>)}</td>
                  <td>{num(receivedQty)} / {num(orderedQty)}</td>
                  <td>{fmt(r.purpose)}</td>
                  <td>{fmt(r.supplyOrderNo)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!filtered.length ? <div className="empty compact-empty">No matching requisitions.</div> : null}
    </>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <label className="search-box">
      <Search size={16} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Approvals({ user, data, api, refresh }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function updateStatus(id, action) {
    const body = { action };
    if (action === "order") body.supplyOrderNo = window.prompt("Supply Order No") || "";
    if (action === "reject") {
      const note = window.prompt("Rejection reason");
      if (!note || !note.trim()) {
        setError("Rejection reason is required.");
        return;
      }
      body.note = note.trim();
    }
    setMessage("");
    setError("");
    try {
      const updated = await api(`/api/requisitions/${id}/status`, { method: "PATCH", body: JSON.stringify(body) });
      setMessage(`${updated.requisitionNo} is now ${statusLabels[updated.status] || updated.status}.`);
      await refresh("approvals");
    } catch (err) {
      setError(err.message);
    }
  }
  const rows = data.requisitions.filter((r) => ["SUBMITTED", "STORE_VERIFIED", "APPROVED"].includes(r.status));
  return (
    <>
      <Header title="Approvals" eyebrow="Review requests" subtitle="Store/PMU verifies first; final approver approves second." />
      <div className="panel">
        <PanelTitle title="Approval Queue" subtitle="Only actions allowed for your role are shown." />
        {message ? <div className="success">{message}</div> : null}
        {error ? <div className="error">{error}</div> : null}
        {!rows.length ? <div className="empty">No active approval items.</div> : (
          <div className="approval-list">{rows.map((r) => <ApprovalRow key={r.id} row={r} user={user} data={data} updateStatus={updateStatus} />)}</div>
        )}
      </div>
    </>
  );
}

function ApprovalRow({ row, user, data, updateStatus }) {
  const budgetHead = data.budgetHeads.find((entry) => entry.id === row.budgetHeadId);
  const infrastructure = data.infrastructures.find((entry) => entry.id === row.infrastructureId);
  return (
    <div className="approval-card">
      <div className="approval-main">
        <div>
          <strong>{fmt(row.requisitionNo)}</strong>
          <span>{fmt(row.purpose)}</span>
        </div>
        <span className={`status ${row.status}`}>{statusLabels[row.status] || row.status}</span>
      </div>
      <div className="approval-meta">
        <span><strong>Budget Head</strong>{fmt(budgetHead?.name || row.budgetHeadId)}</span>
        <span><strong>Key Infrastructure</strong>{fmt(infrastructure?.name || row.infrastructureId)}</span>
      </div>
      {row.status === "REJECTED" && row.rejectionReason ? <div className="rejection-note">Rejected: {row.rejectionReason}</div> : null}
      <ApprovalTimeline row={row} />
      <OrderedItemsTable lines={row.lines || []} />
      <div>
        <div className="actions">
          {can(user, "requisition:first_approve") && row.status === "SUBMITTED" ? <button className="primary" onClick={() => updateStatus(row.id, "verify")}>Verify</button> : null}
          {can(user, "requisition:final_approve") && row.status === "STORE_VERIFIED" ? <button className="primary" onClick={() => updateStatus(row.id, "final_approve")}>Final approve</button> : null}
          {can(user, "requisition:order") && row.status === "APPROVED" ? <button onClick={() => updateStatus(row.id, "order")}>Mark order placed</button> : null}
          {row.status !== "APPROVED" && (can(user, "requisition:first_approve") || can(user, "requisition:final_approve")) ? <button className="danger" onClick={() => updateStatus(row.id, "reject")}>Reject</button> : null}
        </div>
      </div>
    </div>
  );
}

function ApprovalTimeline({ row }) {
  const steps = [
    ["SUBMITTED", "Submitted"],
    ["STORE_VERIFIED", "Store verified"],
    ["APPROVED", "Final approved"],
    ["ORDERED", "Order placed"]
  ];
  const currentIndex = Math.max(0, steps.findIndex(([status]) => status === row.status));
  return (
    <div className="approval-timeline">
      {steps.map(([status, label], index) => (
        <span key={status} className={index <= currentIndex ? "done" : ""}>{label}</span>
      ))}
    </div>
  );
}

function OrderedItemsTable({ lines }) {
  if (!lines.length) return <div className="empty compact-empty">No ordered items.</div>;
  return (
    <div className="table-wrap compact-table">
      <table>
        <thead><tr><th>Item</th><th>Category</th><th>Qty</th><th>Unit</th><th>Remarks</th></tr></thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id || `${line.itemName}-${line.quantity}`}>
              <td><strong>{line.itemName}</strong></td>
              <td>{fmt(lineCategory(line))}</td>
              <td>{num(line.quantity)}</td>
              <td>{fmt(line.unit)}</td>
              <td>{fmt(line.remarks)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReceiveStock({ data, api, refresh, setView }) {
  const [form, setForm] = useState({ requisitionId: "", date: today(), budgetHeadId: "", infrastructureId: "", supplier: "", challanNo: "", challanDate: "", dvNo: "", dvDate: "", billNo: "", billDate: "", dispatchNo: "", remarks: "" });
  const [lines, setLines] = useState([blankLine()]);
  const [error, setError] = useState("");
  const approved = data.requisitions.filter((r) => ["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"].includes(r.status));
  const budgetMap = byId(data.budgetHeads);
  const infrastructureMap = byId(data.infrastructures);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const arrivedLines = lines.filter((line) => line.reached !== false);
      await api("/api/receipts", { method: "POST", body: JSON.stringify({ ...form, lines: arrivedLines }) });
      setView("inventory");
      await refresh("inventory");
    } catch (err) {
      setError(err.message);
    }
  }

  function selectRequisition(requisitionId) {
    const req = data.requisitions.find((entry) => entry.id === requisitionId);
    if (!req) {
      setForm({ ...form, requisitionId });
      return;
    }
    setForm({
      ...form,
      requisitionId,
      budgetHeadId: req.budgetHeadId || "",
      infrastructureId: req.infrastructureId || ""
    });
    setLines((req.lines || []).map((line) => ({
      itemName: line.itemName,
      category: lineCategory(line),
      specification: lineCategory(line),
      quantity: line.quantity,
      unit: line.unit,
      remarks: line.remarks || "",
      reached: true
    })));
  }

  return (
    <>
      <Header title="Receive Stock" eyebrow="Stock arrival" subtitle="Document numbers are captured here after approved stock reaches the store." />
      <form className="panel grid" onSubmit={submit}>
        <PanelTitle title="Receipt Details" subtitle="Use this screen only after the order has reached the store. Received stock is placed into Store first." />
        {error ? <div className="error">{error}</div> : null}
        <div className="grid four">
          <label>Linked Requisition <select value={form.requisitionId} onChange={(e) => selectRequisition(e.target.value)} required><option value="">Select approved requisition</option>{approved.map((r) => <option key={r.id} value={r.id}>{r.requisitionNo} - {statusLabels[r.status]}</option>)}</select></label>
          <label>Receipt Date <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
          <label>Supplier / Party <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></label>
        </div>
        <div className="workflow-note">
          <strong>Receipt goes to Store and charges the budget</strong>
          <span>Requested Budget Head: {fmt(budgetMap[form.budgetHeadId]?.name || form.budgetHeadId)}</span>
          <span>Requested Key Infrastructure: {fmt(infrastructureMap[form.infrastructureId]?.name || form.infrastructureId)}</span>
          <span>The actual arrived line amount is deducted from the linked budget head. Issue Stock assigns quantities and value to the key infrastructure.</span>
        </div>
        <div className="document-band">
          <PanelTitle title="Arrival Documents" subtitle="Record these only after approved stock reaches the store or site." />
          <div className="grid three">
            <label>Challan No <input value={form.challanNo} onChange={(e) => setForm({ ...form, challanNo: e.target.value })} /></label>
            <label>DV No(s) <input value={form.dvNo} onChange={(e) => setForm({ ...form, dvNo: e.target.value })} /></label>
            <label>Bill No(s) <input value={form.billNo} onChange={(e) => setForm({ ...form, billNo: e.target.value })} /></label>
          </div>
          <div className="grid four">
            <label>Challan Date <input type="date" value={form.challanDate} onChange={(e) => setForm({ ...form, challanDate: e.target.value })} /></label>
            <label>DV Date <input type="date" value={form.dvDate} onChange={(e) => setForm({ ...form, dvDate: e.target.value })} /></label>
            <label>Bill Date <input type="date" value={form.billDate} onChange={(e) => setForm({ ...form, billDate: e.target.value })} /></label>
            <label>Dispatch No <input value={form.dispatchNo} onChange={(e) => setForm({ ...form, dispatchNo: e.target.value })} /></label>
          </div>
        </div>
        <LineEditor items={data.items} lines={lines} setLines={setLines} receipt arrival />
        <label>Remarks <textarea rows="2" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
        <button className="primary" type="submit">Record receipt</button>
      </form>
    </>
  );
}

function Inventory({ data }) {
  const [activeTab, setActiveTab] = useState("summary");
  const [traceItemId, setTraceItemId] = useState("");
  const [infrastructureFilters, setInfrastructureFilters] = useState({ itemId: "", infrastructureId: "", dateFrom: "", dateTo: "" });
  const [ledgerFilters, setLedgerFilters] = useState({ itemId: "", infrastructureId: "", dateFrom: "", dateTo: "", query: "" });
  const infrastructureMap = byId(data.infrastructures);
  const groups = [];
  for (const infrastructure of data.infrastructures) {
    const ledger = filterInventoryLedger(data.ledger.filter((row) => row.infrastructureId === infrastructure.id), infrastructureFilters, infrastructure.id);
    const stock = summarizeLedger(ledger);
    groups.push({ id: infrastructure.id, name: infrastructure.name, status: infrastructure.status || "Active", ledger, stock });
  }
  const unassignedLedger = filterInventoryLedger(data.ledger.filter((row) => !row.infrastructureId || !infrastructureMap[row.infrastructureId]), infrastructureFilters, "store");
  const unassignedStock = summarizeLedger(unassignedLedger);
  const activeGroups = groups.filter((group) => (!infrastructureFilters.infrastructureId || infrastructureFilters.infrastructureId === group.id) && (group.stock.length || group.ledger.length));
  const allStockSummary = summarizeAllStock(data.inventory, data.ledger);
  return (
    <>
      <Header title="Inventory" eyebrow="Stock tracking" subtitle="Read-only stock summary, key infrastructure balances, item trace, and complete ledger history." />
      <SegmentedTabs
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "summary", label: "All Stock Summary" },
          { id: "infrastructure", label: "Key Infrastructure Stock" },
          { id: "ledger", label: "Stock Ledger / Item Trace" }
        ]}
      />
      {activeTab === "summary" ? (
        <div className="panel">
          <PanelTitle title="All Stock Summary" subtitle="One row per item across Store and all key infrastructures." />
          <AllStockSummaryTable rows={allStockSummary} />
        </div>
      ) : null}
      {activeTab === "infrastructure" ? (
        <div className="inventory-groups">
          <InventoryFilterBar
            filters={infrastructureFilters}
            setFilters={setInfrastructureFilters}
            items={data.items}
            infrastructures={data.infrastructures}
            includeSearch={false}
          />
          {activeGroups.map((group) => <InfrastructureInventorySection key={group.id} group={group} />)}
          {(!infrastructureFilters.infrastructureId || infrastructureFilters.infrastructureId === "store") && (unassignedStock.length || unassignedLedger.length) ? (
            <InfrastructureInventorySection group={{ id: "store", name: "Store / Not Assigned to Infrastructure", status: "Store", ledger: unassignedLedger, stock: unassignedStock }} />
          ) : null}
          {!activeGroups.length && !unassignedStock.length ? (
            <div className="panel"><div className="empty">No infrastructure stock movements found.</div></div>
          ) : null}
        </div>
      ) : null}
      {activeTab === "ledger" ? (
        <InventoryLedgerTab
          data={data}
          traceItemId={traceItemId}
          setTraceItemId={setTraceItemId}
          filters={ledgerFilters}
          setFilters={setLedgerFilters}
        />
      ) : null}
    </>
  );
}

function filterInventoryLedger(rows = [], filters = {}, groupId = "") {
  return rows.filter((row) => {
    if (filters.itemId && row.itemId !== filters.itemId) return false;
    if (!dateInRange(row.date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.infrastructureId && filters.infrastructureId !== groupId) return false;
    return true;
  });
}

function filterLifecycleRows(rows = [], filters = {}) {
  const query = filters.query || "";
  return rows.filter((row) => {
    if (filters.itemId && row.itemId !== filters.itemId) return false;
    if (!dateInRange(row.date, filters.dateFrom, filters.dateTo)) return false;
    if (query && !matchesSearch([row.date, row.type, row.lifecycleStatus, row.itemName, row.documentNo, row.dutyPerson, row.remarks], query)) return false;
    return true;
  });
}

function filterLifecycleEvents(events = [], filters = {}, infrastructures = []) {
  const infrastructureMap = byId(infrastructures);
  return events.filter((event) => {
    if (filters.infrastructureId) {
      const matchesInfrastructure = filters.infrastructureId === "store"
        ? !event.fromInfrastructureId && !event.toInfrastructureId
        : [event.fromInfrastructureId, event.toInfrastructureId].includes(filters.infrastructureId);
      if (!matchesInfrastructure) return false;
    }
    if (filters.query && !matchesSearch([
      event.date,
      event.type,
      event.lifecycle,
      event.itemName,
      event.documentNo,
      event.challanNo,
      event.dvNo,
      event.billNo,
      event.dutyPerson,
      event.remarks,
      infrastructureMap[event.fromInfrastructureId]?.name,
      infrastructureMap[event.toInfrastructureId]?.name
    ], filters.query)) return false;
    return true;
  });
}

function InventoryFilterBar({ filters, setFilters, items, infrastructures, includeSearch = true }) {
  return (
    <div className="panel compact-filter-panel">
      <div className="table-tools filter-grid">
        {includeSearch ? <SearchBox value={filters.query || ""} onChange={(query) => setFilters({ ...filters, query })} placeholder="Search item, document, person" /> : null}
        <label>Item <select value={filters.itemId || ""} onChange={(e) => setFilters({ ...filters, itemId: e.target.value })}><option value="">All items</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Key Infrastructure <select value={filters.infrastructureId || ""} onChange={(e) => setFilters({ ...filters, infrastructureId: e.target.value })}><option value="">All locations</option><option value="store">Store / Not Assigned</option>{infrastructures.map((infra) => <option key={infra.id} value={infra.id}>{infra.name}</option>)}</select></label>
        <label>From <input type="date" value={filters.dateFrom || ""} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></label>
        <label>To <input type="date" value={filters.dateTo || ""} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></label>
        <button type="button" className="soft-button" onClick={() => setFilters({ itemId: "", infrastructureId: "", dateFrom: "", dateTo: "", query: "" })}>Clear</button>
      </div>
    </div>
  );
}

function receiptForLedger(row, receiptMap = {}) {
  return row.referenceType === "receipt" ? receiptMap[row.referenceId] : null;
}

function ledgerDocumentFields(row, receiptMap = {}) {
  const receipt = receiptForLedger(row, receiptMap);
  return {
    challanNo: receipt?.challanNo || "",
    dvNo: receipt?.dvNo || "",
    billNo: receipt?.billNo || "",
    documentNo: row.documentNo || receipt?.challanNo || ""
  };
}

function ledgerAmount(row, receiptMap = {}, stockEventMap = {}) {
  if (Number(row.amount || 0) > 0) return Number(row.amount || 0);
  if (row.referenceType === "receipt") {
    const receipt = receiptMap[row.referenceId];
    const line = (receipt?.lines || []).find((entry) => entry.id === row.lineId)
      || (receipt?.lines || []).find((entry) => entry.itemId === row.itemId && Number(entry.quantity || 0) === Number(row.quantity || 0));
    return lineAmount(line);
  }
  if (row.referenceType === "stockEvent") return Number(stockEventMap[row.referenceId]?.amount || 0);
  return 0;
}

function lifecycleGroupKey(row) {
  if (row.lifecycleEventId) return row.lifecycleEventId;
  if (row.referenceType && row.referenceId) {
    const lineKey = row.lineId || `${row.itemId}:${row.quantity}:${row.unit || ""}`;
    return `${row.referenceType}:${row.referenceId}:${lineKey}`;
  }
  return row.id;
}

function lifecycleLabel(types, rows) {
  if (types.has("ISSUE") && types.has("TRANSFER_IN")) return "Issued to Infrastructure";
  if (types.has("TRANSFER_OUT") && types.has("TRANSFER_IN")) return "Infrastructure Transfer";
  const type = rows[0]?.type || "";
  if (type === "RECEIPT") return "Received at Store";
  if (type === "RETURNED_FROM_REPAIR") return "Returned from Repair";
  if (type === "REPAIR_NOTE") return "Under Repair";
  if (type === "DISPOSED") return "Disposed";
  if (type === "SPOILED") return "Spoiled";
  if (type === "ADJUSTMENT") return "Stock Adjustment";
  return rows[0]?.lifecycleStatus || type;
}

function buildLifecycleEvents(rows = [], receipts = [], stockEvents = []) {
  const receiptMap = byId(receipts);
  const stockEventMap = byId(stockEvents);
  const grouped = new Map();
  for (const row of rows) {
    const key = lifecycleGroupKey(row);
    const group = grouped.get(key) || [];
    group.push(row);
    grouped.set(key, group);
  }
  return [...grouped.entries()].map(([id, rawRows]) => {
    const types = new Set(rawRows.map((row) => row.type));
    const source = rawRows.find((row) => row.movementRole === "source" || ["ISSUE", "TRANSFER_OUT"].includes(row.type)) || rawRows[0];
    const destination = rawRows.find((row) => row.movementRole === "destination" || row.type === "TRANSFER_IN");
    const representative = source || rawRows[0];
    const receipt = representative.referenceType === "receipt" ? receiptMap[representative.referenceId] : null;
    const docs = ledgerDocumentFields(representative, receiptMap);
    const totalAmount = Math.max(...rawRows.map((row) => ledgerAmount(row, receiptMap, stockEventMap)));
    return {
      id,
      date: representative.date,
      lifecycle: lifecycleLabel(types, rawRows),
      type: types.has("ISSUE") ? "ISSUE" : types.has("TRANSFER_OUT") ? "TRANSFER" : representative.type,
      itemId: representative.itemId,
      itemName: representative.itemName,
      quantity: Math.max(...rawRows.map((row) => Number(row.quantity || 0))),
      unit: representative.unit,
      fromInfrastructureId: source?.fromInfrastructureId || (source?.type === "TRANSFER_OUT" ? source.infrastructureId : ""),
      toInfrastructureId: destination?.toInfrastructureId || destination?.infrastructureId || representative.toInfrastructureId || representative.infrastructureId || receipt?.infrastructureId || "",
      documentNo: docs.documentNo,
      challanNo: docs.challanNo,
      dvNo: docs.dvNo,
      billNo: docs.billNo,
      totalAmount,
      dutyPerson: representative.dutyPerson || representative.createdByName,
      remarks: representative.remarks,
      rawRows
    };
  }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.id).localeCompare(String(a.id)));
}

function InventoryLedgerTab({ data, traceItemId, setTraceItemId, filters, setFilters }) {
  const transferEvents = data.stockEvents.filter((event) => event.type === "TRANSFER");
  const conditionEvents = data.stockEvents.filter((event) => ["RETURNED_FROM_REPAIR", "REPAIR_NOTE", "DISPOSED", "SPOILED"].includes(event.type));
  return (
    <div className="inventory-ledger-stack">
      <InventoryFilterBar filters={filters} setFilters={setFilters} items={data.items} infrastructures={data.infrastructures} />
      <ItemTracePanel data={data} traceItemId={traceItemId} setTraceItemId={setTraceItemId} filters={filters} />
      <div className="ledger-history-grid">
        <div className="panel">
          <PanelTitle title="Issue History" subtitle="Issued stock movements kept for audit and traceability." />
          <IssueHistoryTable issues={data.issues} />
        </div>
        <div className="panel">
          <PanelTitle title="Transfer History" subtitle="Infrastructure-to-infrastructure transfer records." />
          <StockEventTable events={transferEvents} infrastructures={data.infrastructures} emptyText="No transfer records." />
        </div>
      </div>
      <div className="panel">
        <PanelTitle title="Return / Condition History" subtitle="Returned from repair, repair notes, disposed, and spoiled stock records." />
        <StockEventTable events={conditionEvents} infrastructures={data.infrastructures} emptyText="No return or condition records." showAmount />
      </div>
    </div>
  );
}

function ItemTracePanel({ data, traceItemId, setTraceItemId, filters }) {
  const rows = filterLifecycleRows(data.ledger, filters)
    .filter((row) => !traceItemId || row.itemId === traceItemId)
    .slice();
  const events = filterLifecycleEvents(buildLifecycleEvents(rows, data.receipts, data.stockEvents), filters, data.infrastructures);
  return (
    <div className="panel">
      <PanelTitle title="Stock Ledger / Item Trace" subtitle="Consolidated lifecycle movements with document numbers, locations, and linked amount." />
      <LifecycleLedgerTable events={events} infrastructures={data.infrastructures} receipts={data.receipts} stockEvents={data.stockEvents} />
      {!events.length ? <div className="empty compact-empty">No lifecycle movements found.</div> : null}
    </div>
  );
}

function StockEventForm({ data, onSubmit, title = "Stock Event", subtitle = "Record a stock movement or condition change.", types = Object.keys(stockEventTypes), showTypeSelect = true, submitLabel = "Record stock event" }) {
  const defaultType = types[0] || "TRANSFER";
  const [form, setForm] = useState({ type: defaultType, date: today(), itemId: "", quantity: "", unit: "", fromInfrastructureId: "", toInfrastructureId: "", budgetHeadId: "", amount: "", dutyPerson: "", documentNo: "", remarks: "" });
  const [error, setError] = useState("");
  const selectedItem = data.items.find((item) => item.id === form.itemId);
  const needsTo = ["TRANSFER", "RETURNED_FROM_REPAIR"].includes(form.type);
  const needsFrom = ["TRANSFER", "DISPOSED", "SPOILED", "REPAIR_NOTE"].includes(form.type);
  const quantityRequired = form.type !== "REPAIR_NOTE";
  const hasRepairAmount = ["REPAIR_NOTE", "RETURNED_FROM_REPAIR"].includes(form.type);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await onSubmit({ ...form, unit: form.unit || selectedItem?.unit || "" });
      setForm({ type: defaultType, date: today(), itemId: "", quantity: "", unit: "", fromInfrastructureId: "", toInfrastructureId: "", budgetHeadId: "", amount: "", dutyPerson: "", documentNo: "", remarks: "" });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="panel grid" onSubmit={submit}>
      <PanelTitle title={title} subtitle={subtitle} />
      {error ? <div className="error">{error}</div> : null}
      <div className="grid four">
        {showTypeSelect ? <label>Event Type <select value={form.type} onChange={(e) => {
          const nextType = e.target.value;
          const keepsAmount = ["REPAIR_NOTE", "RETURNED_FROM_REPAIR"].includes(nextType);
          setForm({ ...form, type: nextType, budgetHeadId: keepsAmount ? form.budgetHeadId : "", amount: keepsAmount ? form.amount : "" });
        }}>{types.map((key) => <option key={key} value={key}>{stockEventTypes[key] || key}</option>)}</select></label> : <div className="readonly-field"><span>Event Type</span><strong>{stockEventTypes[form.type] || form.type}</strong></div>}
        <label>Date <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
        <label>Item <select value={form.itemId} onChange={(e) => {
          const item = data.items.find((entry) => entry.id === e.target.value);
          setForm({ ...form, itemId: e.target.value, unit: item?.unit || form.unit });
        }} required><option value="">Select item</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Quantity <input type="number" min={quantityRequired ? "0.01" : "0"} step="0.01" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required={quantityRequired} /></label>
      </div>
      <div className="grid four">
        <label>Unit <input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder={selectedItem?.unit || ""} /></label>
        {needsFrom ? <label>From <InfrastructureSelect infrastructures={data.infrastructures} value={form.fromInfrastructureId} onChange={(fromInfrastructureId) => setForm({ ...form, fromInfrastructureId })} storeOption={form.type !== "TRANSFER"} required={form.type === "TRANSFER"} /></label> : <div />}
        {needsTo ? <label>To <InfrastructureSelect infrastructures={data.infrastructures} value={form.toInfrastructureId} onChange={(toInfrastructureId) => setForm({ ...form, toInfrastructureId })} storeOption={form.type !== "TRANSFER"} required={form.type === "TRANSFER"} /></label> : <div />}
        <label>Document / Reference <input value={form.documentNo} onChange={(e) => setForm({ ...form, documentNo: e.target.value })} /></label>
      </div>
      {hasRepairAmount ? (
        <div className="grid two">
          <label>Budget Head <BudgetHeadSelect budgetHeads={data.budgetHeads} value={form.budgetHeadId} onChange={(budgetHeadId) => setForm({ ...form, budgetHeadId })} /></label>
          <label>Amount <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></label>
        </div>
      ) : null}
      <div className="grid two">
        <label>Duty Personnel <input value={form.dutyPerson} onChange={(e) => setForm({ ...form, dutyPerson: e.target.value })} /></label>
        <label>Remarks <input value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
      </div>
      <button className="primary" type="submit">{submitLabel}</button>
    </form>
  );
}

function InfrastructureInventorySection({ group }) {
  const received = group.stock.reduce((sum, row) => sum + Number(row.received || 0), 0);
  const issued = group.stock.reduce((sum, row) => sum + Number(row.issued || 0), 0);
  const balance = group.stock.reduce((sum, row) => sum + Number(row.balance || 0), 0);
  return (
    <section className="panel infrastructure-stock-section">
      <PanelTitle title={group.name} subtitle={`${group.status} | Received ${num(received)} | Issued ${num(issued)} | Balance ${num(balance)}`} />
      <div className="grid two infrastructure-stock-grid">
        <div>
          <h3 className="section-subtitle">Current Stock</h3>
          <InventoryTable rows={group.stock} compact />
        </div>
        <div>
          <h3 className="section-subtitle">Recent Movements</h3>
          <RecentMovementTable rows={group.ledger.slice().reverse().slice(0, 5)} />
        </div>
      </div>
    </section>
  );
}

function RecentMovementTable({ rows = [] }) {
  if (!rows.length) return <div className="empty compact-empty">No recent movements.</div>;
  return (
    <div className="recent-movement-table">
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Item</th><th>Quantity</th></tr></thead>
        <tbody>{rows.map((row) => (
          <tr key={row.id}>
            <td>{fmt(row.date)}</td>
            <td><span className="movement-type">{fmt(row.type)}</span></td>
            <td><strong>{fmt(row.itemName)}</strong></td>
            <td>{num(row.quantity)} {fmt(row.unit)}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function InventoryTable({ rows, compact = false, infrastructures = [] }) {
  const [query, setQuery] = useState("");
  const infrastructureMap = byId(infrastructures);
  const filtered = rows.filter((r) => matchesSearch([r.itemName, r.category, r.unit, r.lastMovementAt, infrastructureMap[r.infrastructureId]?.name], query));
  if (!rows.length) return <div className="empty">No stock movements found.</div>;
  return (
    <>
      {!compact ? <div className="table-tools"><SearchBox value={query} onChange={setQuery} placeholder="Search stock" /></div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th>{compact ? null : <th>Location</th>}<th>Category</th><th>Received</th><th>Issued</th><th>Balance</th><th>Unit</th><th>Last Movement</th></tr></thead>
          <tbody>{filtered.map((r) => <tr key={`${r.infrastructureId || "store"}-${r.itemId}`}><td><strong>{fmt(r.itemName)}</strong></td>{compact ? null : <td>{fmt(infrastructureMap[r.infrastructureId]?.name || "Store")}</td>}<td>{fmt(r.category)}</td><td>{num(r.received)}</td><td>{num(r.issued)}</td><td><strong className={Number(r.balance) <= 0 ? "negative" : "positive"}>{num(r.balance)}</strong></td><td>{fmt(r.unit)}</td><td>{fmt(r.lastMovementAt)}</td></tr>)}</tbody>
        </table>
      </div>
      {!filtered.length ? <div className="empty compact-empty">No matching stock items.</div> : null}
    </>
  );
}

function AllStockSummaryTable({ rows = [] }) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((row) => matchesSearch([row.itemName, row.category, row.unit, row.lastMovementAt], query));
  if (!rows.length) return <div className="empty">No stock movements found.</div>;
  return (
    <>
      <div className="table-tools"><SearchBox value={query} onChange={setQuery} placeholder="Search all stock" /></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Category</th><th>Received at Arrival</th><th>Store Stock</th><th>Infrastructure Stock</th><th>Disposed / Spoiled</th><th>Total Available</th><th>Unit</th><th>Last Movement</th></tr></thead>
          <tbody>{filtered.map((row) => (
            <tr key={row.itemId}>
              <td><strong>{fmt(row.itemName)}</strong></td>
              <td>{fmt(row.category)}</td>
              <td>{num(row.receivedAtArrival)}</td>
              <td>{num(row.storeStock)}</td>
              <td>{num(row.infrastructureStock)}</td>
              <td>{num(row.disposedOrSpoiled)}</td>
              <td><strong className={Number(row.totalAvailable) <= 0 ? "negative" : "positive"}>{num(row.totalAvailable)}</strong></td>
              <td>{fmt(row.unit)}</td>
              <td>{fmt(row.lastMovementAt)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!filtered.length ? <div className="empty compact-empty">No matching stock items.</div> : null}
    </>
  );
}

function LedgerTable({ rows, compact = false, infrastructures = [], receipts = [] }) {
  const infrastructureMap = byId(infrastructures);
  const receiptMap = byId(receipts);
  if (!rows.length) return <div className="empty">No ledger movements found.</div>;
  return (
    <table>
      <thead><tr><th>Date</th><th>Type</th>{compact ? null : <th>Lifecycle</th>}<th>Item</th><th>Qty</th><th>Unit</th>{compact ? null : <th>From</th>}{compact ? null : <th>To</th>}{compact ? null : <th>Challan No</th>}{compact ? null : <th>DV No</th>}{compact ? null : <th>Bill No</th>}{compact ? null : <th>Document</th>}{compact ? null : <th>Duty Person</th>}{compact ? null : <th>Remarks</th>}</tr></thead>
      <tbody>{rows.map((r) => {
        const docs = ledgerDocumentFields(r, receiptMap);
        return (
          <tr key={r.id}>
            <td>{fmt(r.date)}</td>
            <td>{fmt(r.type)}</td>
            {compact ? null : <td><span className="status">{fmt(r.lifecycleStatus)}</span></td>}
            <td>{fmt(r.itemName)}</td>
            <td>{num(r.quantity)}</td>
            <td>{fmt(r.unit)}</td>
            {compact ? null : <td>{fmt(infrastructureMap[r.fromInfrastructureId]?.name || (r.fromInfrastructureId ? r.fromInfrastructureId : "Store"))}</td>}
            {compact ? null : <td>{fmt(infrastructureMap[r.toInfrastructureId]?.name || (r.toInfrastructureId ? r.toInfrastructureId : ""))}</td>}
            {compact ? null : <td>{fmt(docs.challanNo)}</td>}
            {compact ? null : <td>{fmt(docs.dvNo)}</td>}
            {compact ? null : <td>{fmt(docs.billNo)}</td>}
            {compact ? null : <td>{fmt(docs.documentNo)}</td>}
            {compact ? null : <td>{fmt(r.dutyPerson || r.createdByName)}</td>}
            {compact ? null : <td>{fmt(r.remarks)}</td>}
          </tr>
        );
      })}</tbody>
    </table>
  );
}

function StockEventTable({ events = [], infrastructures = [], emptyText = "No stock events recorded.", showAmount = false }) {
  const [query, setQuery] = useState("");
  const infrastructureMap = byId(infrastructures);
  const rows = events.filter((event) => matchesSearch([event.type, event.itemName, event.dutyPerson, event.documentNo, event.remarks], query));
  if (!events.length) return <div className="empty">{emptyText}</div>;
  return (
    <>
      <div className="table-tools"><SearchBox value={query} onChange={setQuery} placeholder="Search stock events" /></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Type</th><th>Item</th><th>Qty</th><th>From</th><th>To</th>{showAmount ? <th>Amount</th> : null}<th>Document</th><th>Duty Person</th><th>Remarks</th></tr></thead>
          <tbody>{rows.map((event) => <tr key={event.id}><td>{fmt(event.date)}</td><td>{stockEventTypes[event.type] || event.type}</td><td>{fmt(event.itemName)}</td><td>{num(event.quantity)} {fmt(event.unit)}</td><td>{fmt(infrastructureMap[event.fromInfrastructureId]?.name || (event.fromInfrastructureId ? event.fromInfrastructureId : "Store"))}</td><td>{fmt(infrastructureMap[event.toInfrastructureId]?.name || event.toInfrastructureId)}</td>{showAmount ? <td>{event.amount ? num(event.amount) : "-"}</td> : null}<td>{fmt(event.documentNo)}</td><td>{fmt(event.dutyPerson)}</td><td>{fmt(event.remarks)}</td></tr>)}</tbody>
        </table>
      </div>
      {!rows.length ? <div className="empty compact-empty">No matching stock events.</div> : null}
    </>
  );
}

function IssueHistoryTable({ issues = [] }) {
  const [query, setQuery] = useState("");
  const rows = issues.filter((issue) => matchesSearch([issue.date, issue.issueChallanNo, issue.issuedTo, issue.remarks, ...(issue.lines || []).map((line) => line.itemName)], query));
  if (!issues.length) return <div className="empty">No issue history recorded.</div>;
  return (
    <>
      <div className="table-tools"><SearchBox value={query} onChange={setQuery} placeholder="Search issue history" /></div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Date</th><th>Issue Challan</th><th>Duty Person</th><th>Items</th><th>Remarks</th></tr></thead>
          <tbody>{rows.map((issue) => (
            <tr key={issue.id}>
              <td>{fmt(issue.date)}</td>
              <td>{fmt(issue.issueChallanNo)}</td>
              <td>{fmt(issue.issuedTo)}</td>
              <td>{(issue.lines || []).map((line) => <div key={line.id || `${line.itemName}-${line.quantity}`}>{fmt(line.itemName)} ({num(line.quantity)} {fmt(line.unit)})</div>)}</td>
              <td>{fmt(issue.remarks)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!rows.length ? <div className="empty compact-empty">No matching issue records.</div> : null}
    </>
  );
}

function FullLedgerTable({ rows = [], infrastructures = [], receipts = [] }) {
  const [query, setQuery] = useState("");
  const infrastructureMap = byId(infrastructures);
  const events = buildLifecycleEvents(rows, receipts);
  const filtered = events.filter((event) => {
    return matchesSearch([event.date, event.type, event.lifecycle, event.itemName, event.documentNo, event.challanNo, event.dvNo, event.billNo, event.dutyPerson, event.remarks, infrastructureMap[event.fromInfrastructureId]?.name, infrastructureMap[event.toInfrastructureId]?.name], query);
  });
  if (!rows.length) return <div className="empty">No ledger movements found.</div>;
  return (
    <>
      <div className="table-tools"><SearchBox value={query} onChange={setQuery} placeholder="Search lifecycle ledger" /></div>
      <LifecycleLedgerTable events={filtered} infrastructures={infrastructures} receipts={receipts} />
      {!filtered.length ? <div className="empty compact-empty">No matching ledger movements.</div> : null}
    </>
  );
}

function LifecycleLedgerTable({ events = [], infrastructures = [], receipts = [], stockEvents = [] }) {
  const infrastructureMap = byId(infrastructures);
  if (!events.length) return <div className="empty">No lifecycle movements found.</div>;
  return (
    <div className="table-wrap full-ledger-wrap">
      <table className="lifecycle-table">
        <thead><tr><th>Date</th><th>Lifecycle</th><th>Item</th><th>Qty</th><th>Total Amount</th><th>From</th><th>To / Location</th><th>Challan No</th><th>DV No</th><th>Bill No</th><th>Document</th><th>Duty Person</th><th>Remarks</th><th>Audit Detail</th></tr></thead>
        <tbody>{events.map((event) => (
          <React.Fragment key={event.id}>
            <tr>
              <td>{fmt(event.date)}</td>
              <td><span className="status">{fmt(event.lifecycle)}</span></td>
              <td><strong>{fmt(event.itemName)}</strong></td>
              <td>{num(event.quantity)} {fmt(event.unit)}</td>
              <td>{event.totalAmount ? num(event.totalAmount) : "-"}</td>
              <td>{fmt(infrastructureMap[event.fromInfrastructureId]?.name || (event.fromInfrastructureId ? event.fromInfrastructureId : "Store"))}</td>
              <td>{fmt(infrastructureMap[event.toInfrastructureId]?.name || (event.toInfrastructureId ? event.toInfrastructureId : "Store"))}</td>
              <td>{fmt(event.challanNo)}</td>
              <td>{fmt(event.dvNo)}</td>
              <td>{fmt(event.billNo)}</td>
              <td>{fmt(event.documentNo)}</td>
              <td>{fmt(event.dutyPerson)}</td>
              <td>{fmt(event.remarks)}</td>
              <td>
                <details className="ledger-raw-details">
                  <summary>{event.rawRows.length} raw movement{event.rawRows.length === 1 ? "" : "s"}</summary>
                  <div className="ledger-raw-table">
                    <LedgerTable rows={event.rawRows} infrastructures={infrastructures} receipts={receipts} />
                  </div>
                </details>
              </td>
            </tr>
          </React.Fragment>
        ))}</tbody>
      </table>
    </div>
  );
}

function IssueStock({ data, api, refresh, setView }) {
  const [activeTab, setActiveTab] = useState("issue");

  async function submitStockEvent(body) {
    await api("/api/stock-events", { method: "POST", body: JSON.stringify(body) });
    await refresh("issue");
  }

  const transferEvents = data.stockEvents.filter((event) => event.type === "TRANSFER");
  const conditionEvents = data.stockEvents.filter((event) => ["RETURNED_FROM_REPAIR", "REPAIR_NOTE", "DISPOSED", "SPOILED"].includes(event.type));

  return (
    <>
      <Header title="Issue Stock" eyebrow="Material release" subtitle="Issue stock, transfer between infrastructures, and record return or condition changes." />
      <SegmentedTabs
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "issue", label: "Issue Stock" },
          { id: "transfer", label: "Transfer Stock" },
          { id: "condition", label: "Return / Condition" }
        ]}
      />
      {activeTab === "issue" ? (
        <>
          <IssueStockForm data={data} api={api} refresh={refresh} setView={setView} />
          <div className="panel">
            <PanelTitle title="Issue History" subtitle="Issued stock records for audit and follow-up." />
            <IssueHistoryTable issues={data.issues} />
          </div>
        </>
      ) : null}
      {activeTab === "transfer" ? (
        <>
          <StockEventForm
            data={data}
            onSubmit={submitStockEvent}
            title="Transfer Stock"
            subtitle="Move available stock from one infrastructure or store location to another infrastructure."
            types={["TRANSFER"]}
            showTypeSelect={false}
            submitLabel="Record transfer"
          />
          <div className="panel">
            <PanelTitle title="Transfer History" subtitle="Infrastructure-to-infrastructure transfer audit records." />
            <StockEventTable events={transferEvents} infrastructures={data.infrastructures} emptyText="No transfer records." />
          </div>
        </>
      ) : null}
      {activeTab === "condition" ? (
        <>
          <StockEventForm
            data={data}
            onSubmit={submitStockEvent}
            title="Return / Condition"
            subtitle="Record returned-from-repair stock, repair notes, disposed stock, and spoiled stock."
            types={["RETURNED_FROM_REPAIR", "REPAIR_NOTE", "DISPOSED", "SPOILED"]}
            submitLabel="Record condition event"
          />
          <div className="panel">
            <PanelTitle title="Return / Condition History" subtitle="Returned, repair, disposed, and spoiled records for audit." />
            <StockEventTable events={conditionEvents} infrastructures={data.infrastructures} emptyText="No return or condition records." showAmount />
          </div>
        </>
      ) : null}
    </>
  );
}

function IssueStockForm({ data, api, refresh, setView }) {
  const [form, setForm] = useState({ date: today(), budgetHeadId: "", infrastructureId: "", issueChallanNo: "", issuedTo: "", remarks: "" });
  const [lines, setLines] = useState([blankLine()]);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/issues", { method: "POST", body: JSON.stringify({ ...form, lines }) });
      setView("inventory");
      await refresh("inventory");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="panel grid" onSubmit={submit}>
      <PanelTitle title="Issue Details" subtitle="Issue available stock to a key infrastructure and duty personnel." />
      {error ? <div className="error">{error}</div> : null}
      <div className="grid four">
        <label>Issue Date <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
        <label>Issue Challan No <input value={form.issueChallanNo} onChange={(e) => setForm({ ...form, issueChallanNo: e.target.value })} /></label>
        <label>Duty Personnel / Issued To <input value={form.issuedTo} onChange={(e) => setForm({ ...form, issuedTo: e.target.value })} required /></label>
      </div>
      <div className="grid two">
        <label>Budget Head <BudgetHeadSelect budgetHeads={data.budgetHeads} value={form.budgetHeadId} onChange={(budgetHeadId) => setForm({ ...form, budgetHeadId })} /></label>
        <label>Key Infrastructure <InfrastructureSelect infrastructures={data.infrastructures} value={form.infrastructureId} onChange={(infrastructureId) => setForm({ ...form, infrastructureId })} /></label>
      </div>
      <div className="workflow-note">
        <strong>Issue preview</strong>
        <span>Stock will reduce from Store and be traced to the selected key infrastructure and duty personnel. The budget was already charged from the actual receipt amount when the stock arrived.</span>
      </div>
      <LineEditor items={data.items} lines={lines} setLines={setLines} inventory={data.inventory} />
      <label>Remarks <textarea rows="2" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
      <button className="primary" type="submit">Issue stock</button>
    </form>
  );
}

function Reports({ data }) {
  const reports = data.reports;
  if (!reports) return <><Header title="Reports" /><div className="panel">Loading reports...</div></>;
  return (
    <>
      <Header title="Reports" eyebrow="Audit view" subtitle="Imported manual expense records and recent stock movements." />
      <div className="grid two">
        <div className="panel"><PanelTitle title="Budget Heads" /><div className="table-wrap"><table><thead><tr><th>Budget Head</th><th>Amount</th><th>Status</th></tr></thead><tbody>{data.budgetHeads.map((head) => <tr key={head.id}><td>{head.name}</td><td>{num(head.amount)}</td><td>{head.status || "Active"}</td></tr>)}</tbody></table></div></div>
        <div className="panel"><PanelTitle title="Document Coverage" /><table><tbody><tr><th>Receipts with Challan No</th><td>{num(reports.dashboard.documents.receiptsWithChallan)}</td></tr><tr><th>Receipts with DV No</th><td>{num(reports.dashboard.documents.receiptsWithDv)}</td></tr><tr><th>Receipts with Bill No</th><td>{num(reports.dashboard.documents.receiptsWithBill)}</td></tr></tbody></table></div>
      </div>
      <div className="panel">
        <PanelTitle title="Imported Expense Sample" subtitle="Sample rows from the historical manual expense sheets." />
        <div className="table-wrap">
          <table>
            <thead><tr><th>Bill</th><th>DV</th><th>Challan</th><th>Item</th><th>Qty</th><th>Amount</th><th>Enterprise</th></tr></thead>
            <tbody>{reports.expenses.slice(0, 80).map((e, index) => <tr key={`${e.billNo}-${index}`}><td>{fmt(e.billNo)}</td><td>{fmt(e.dvNo)}</td><td>{fmt(e.challanNo)}</td><td>{fmt(e.itemName)}</td><td>{num(e.quantity)} {fmt(e.unit)}</td><td>{num(e.amount)}</td><td>{fmt(e.enterprise)}</td></tr>)}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function AuditTrail({ data, token }) {
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

createRoot(document.getElementById("root")).render(<App />);
