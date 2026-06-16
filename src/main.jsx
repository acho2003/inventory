import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
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
  CLOSED: "Closed",
  REJECTED: "Rejected",
  IMPORTED_FOLLOW_UP: "Imported follow-up"
};

const demoUsers = {
  requester: ["requester", "request123"],
  store: ["store", "store123"],
  approver: ["approver", "approve123"]
};

const roleLabels = {
  requester: "Requisition",
  store: "Store / PMU",
  approver: "Final Approver"
};

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
  for (const movement of rows) {
    const current = stock.get(movement.itemId) || {
      itemId: movement.itemId,
      itemName: movement.itemName,
      category: movement.category || "General",
      unit: movement.unit || "",
      received: 0,
      issued: 0,
      balance: 0,
      lastMovementAt: movement.date
    };
    if (movement.type === "RECEIPT") current.received += Number(movement.quantity || 0);
    if (movement.type === "ISSUE") current.issued += Number(movement.quantity || 0);
    current.balance = current.received - current.issued;
    if (!current.lastMovementAt || movement.date > current.lastMovementAt) current.lastMovementAt = movement.date;
    stock.set(movement.itemId, current);
  }
  return [...stock.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

function lineCategory(line = {}) {
  return line.category || line.specification || "";
}

function amountUsedFor(receipts = [], field, id) {
  return receipts
    .filter((receipt) => receipt[field] === id)
    .reduce((sum, receipt) => sum + (receipt.lines || []).reduce((lineSum, line) => lineSum + Number(line.amount || 0), 0), 0);
}

function budgetUsageRows(data) {
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
  return data.infrastructures.map((infra) => {
    const used = amountUsedFor(data.receipts, "infrastructureId", infra.id);
    const amount = Number(infra.amount || 0);
    return {
      id: infra.id,
      name: infra.name,
      amount,
      status: infra.status || "Active",
      used,
      balance: amount - used
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

  return (
    <section className="login">
      <div className="login-panel">
        <div className="login-copy">
          <h1>Inventory System</h1>
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
              <button key={key} type="button" onClick={() => onLogin(...demoUsers[key])}>
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
  const [data, setData] = useState({ dashboard: null, projects: [], budgetHeads: [], infrastructures: [], items: [], requisitions: [], receipts: [], inventory: [], ledger: [], reports: null });
  const [loading, setLoading] = useState(true);
  const api = useApi(token);

  async function loadBase() {
    const [dashboard, projects, budgetHeads, infrastructures, items, requisitions, receipts, inventory] = await Promise.all([
      api("/api/dashboard"),
      api("/api/projects"),
      api("/api/budget-heads"),
      api("/api/infrastructures"),
      api("/api/items"),
      api("/api/requisitions"),
      api("/api/receipts"),
      api("/api/inventory")
    ]);
    setData((prev) => ({ ...prev, dashboard, projects, budgetHeads, infrastructures, items, requisitions, receipts, inventory }));
  }

  async function refresh(nextView = view) {
    if (!token) return;
    await loadBase();
    if (nextView === "inventory" || nextView === "projects") {
      const ledger = await api("/api/ledger");
      setData((prev) => ({ ...prev, ledger }));
    }
    if (nextView === "reports") {
      const reports = await api("/api/reports");
      setData((prev) => ({ ...prev, reports }));
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
        await refresh();
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
  }

  async function changeView(nextView) {
    setView(nextView);
    await refresh(nextView);
  }

  if (loading) return <div className="login"><div className="panel">Loading...</div></div>;
  if (!token || !user) return <Login onLogin={login} />;

  const navItems = [
    ["dashboard", "Dashboard", BarChart3, true],
    ["projects", "Budget Heads", FolderKanban, true],
    ["requisitions", "Requisitions", ClipboardList, true],
    ["approvals", "Approvals", ShieldCheck, user.role !== "requester"],
    ["receive", "Receive Stock", PackageCheck, user.role === "store"],
    ["inventory", "Inventory", Boxes, true],
    ["issue", "Issue Stock", PackageMinus, user.role === "store"],
    ["reports", "Reports", FileDown, user.role !== "requester"]
  ];

  return (
    <section className="shell">
      <aside className="sidebar">
        <div className="brand">
          <strong>Inventory</strong>
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
        <CurrentView view={view} user={user} data={data} api={api} refresh={refresh} setView={setView} />
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
  if (props.view === "dashboard") return <Dashboard {...props} />;
  if (props.view === "projects") return <ProjectsPage {...props} />;
  if (props.view === "requisitions") return <Requisitions {...props} />;
  if (props.view === "approvals") return <Approvals {...props} />;
  if (props.view === "receive") return <ReceiveStock {...props} />;
  if (props.view === "inventory") return <Inventory {...props} />;
  if (props.view === "issue") return <IssueStock {...props} />;
  if (props.view === "reports") return <Reports {...props} />;
}

function Dashboard({ data }) {
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
      <div className="grid three">
        <div className="panel">
          <PanelTitle title="Needs Attention" subtitle="Requests waiting for verification, approval, or order placement." />
          {urgent.length ? <CompactRequestList rows={urgent} /> : <div className="empty compact-empty">No active approvals right now.</div>}
        </div>
        <div className="panel">
          <PanelTitle title="Stock Snapshot" subtitle="Top inventory balances from the current ledger." />
          <InventoryTable rows={data.inventory.slice(0, 10)} compact />
        </div>
        <div className="panel">
          <PanelTitle title="Budget Heads" subtitle="Available for requisitions and store tracking." />
          <div className="detail-stack">
            {data.budgetHeads.slice(0, 8).map((head) => <div className="mini-row" key={head.id}><strong>{head.name}</strong><span>{num(head.amount)}</span></div>)}
            {!data.budgetHeads.length ? <div className="empty compact-empty">No budget heads yet.</div> : null}
          </div>
        </div>
      </div>
      <div className="grid two">
        <div className="panel">
          <PanelTitle title="Budget Head Usage" subtitle="Amount used and balance by budget head." />
          <UsageTable rows={budgetRows} emptyText="No budget heads yet." />
        </div>
        <div className="panel">
          <PanelTitle title="Key Infrastructure Usage" subtitle="Amount used and balance by infrastructure." />
          <UsageTable rows={infraRows} emptyText="No key infrastructure yet." />
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value }) {
  return <div className="kpi"><span>{label}</span><strong>{num(value)}</strong></div>;
}

function UsageTable({ rows, emptyText }) {
  if (!rows.length) return <div className="empty compact-empty">{emptyText}</div>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Name</th><th>Amount</th><th>Used</th><th>Balance</th><th>Status</th></tr></thead>
        <tbody>
          {rows.slice(0, 12).map((row) => (
            <tr key={row.id}>
              <td><strong>{row.name}</strong></td>
              <td>{num(row.amount)}</td>
              <td>{num(row.used)}</td>
              <td><strong className={row.balance < 0 ? "negative" : "positive"}>{num(row.balance)}</strong></td>
              <td><span className="status">{row.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkflowStrip() {
  const steps = [
    ["Request", "Requester enters item needs"],
    ["Verify", "Store checks request"],
    ["Approve", "Final approver signs off"],
    ["Receive", "Store enters Challan, DV, Bill"]
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

function InfrastructureSelect({ infrastructures, value, onChange, budgetHeadId = "" }) {
  const rows = infrastructures.filter((entry) => !budgetHeadId || entry.budgetHeadId === budgetHeadId);
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select infrastructure</option>
      {rows.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
    </select>
  );
}

function ProjectsPage({ user, data, api, refresh }) {
  const [selectedBudgetHeadId, setSelectedBudgetHeadId] = useState(data.budgetHeads[0]?.id || "");
  const [budgetForm, setBudgetForm] = useState({ name: "", amount: "", status: "Active" });
  const [infraForm, setInfraForm] = useState({ budgetHeadId: "", name: "", amount: "", status: "Active" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const budgetMap = byId(data.budgetHeads);
  const selectedBudgetHead = budgetMap[selectedBudgetHeadId] || data.budgetHeads[0];
  const infraRows = data.infrastructures.filter((entry) => entry.budgetHeadId === selectedBudgetHead?.id);
  const ordered = data.requisitions.filter((req) => req.budgetHeadId === selectedBudgetHead?.id);
  const ledgerRows = data.ledger.filter((row) => row.budgetHeadId === selectedBudgetHead?.id);

  async function submitBudget(event) {
    event.preventDefault();
    await submitEntity("/api/budget-heads", budgetForm, () => setBudgetForm({ name: "", amount: "", status: "Active" }), "Budget head added.");
  }

  async function submitInfra(event) {
    event.preventDefault();
    await submitEntity("/api/infrastructures", infraForm, () => setInfraForm({ budgetHeadId: "", name: "", amount: "", status: "Active" }), "Infrastructure added.");
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
      {user.role === "approver" ? (
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
            <label>Budget Head <BudgetHeadSelect budgetHeads={data.budgetHeads} value={infraForm.budgetHeadId} onChange={(budgetHeadId) => setInfraForm({ ...infraForm, budgetHeadId })} /></label>
            <label>Infrastructure Name <input value={infraForm.name} onChange={(e) => setInfraForm({ ...infraForm, name: e.target.value })} required /></label>
            <label>Amount <input type="number" min="0" step="0.01" value={infraForm.amount} onChange={(e) => setInfraForm({ ...infraForm, amount: e.target.value })} /></label>
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
          <PanelTitle title={selectedBudgetHead?.name || "Budget Head Detail"} subtitle="Key infrastructure, ordered items, and issued items." />
          <div className="detail-stack">
            <DetailBlock title="Infrastructure Activities" rows={infraRows.map((row) => `${row.name} - ${num(row.amount)} - ${row.status || "Active"}`)} />
            <DetailBlock title="Ordered Items" rows={ordered.flatMap((req) => (req.lines || []).map((line) => `${req.requisitionNo}: ${line.itemName} (${lineCategory(line) || "No category"}) - ${num(line.quantity)} ${line.unit}`)).slice(0, 12)} />
            <DetailBlock title="Issued Items" rows={ledgerRows.filter((row) => row.type === "ISSUE").map((row) => `${row.itemName} (${num(row.quantity)} ${row.unit})`).slice(0, 12)} />
          </div>
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

function LineEditor({ items, lines, setLines, receipt = false, arrival = false }) {
  function update(index, patch) {
    setLines(lines.map((line, i) => i === index ? { ...line, ...patch } : line));
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
        {lines.map((line, index) => (
          <div className={`line-row ${receipt ? "receipt-line" : ""}`} key={index}>
            <label>Item <input list="itemOptions" value={line.itemName} onChange={(e) => update(index, { itemName: e.target.value })} required /></label>
            <label>Category <input value={line.category ?? line.specification ?? ""} onChange={(e) => update(index, { category: e.target.value, specification: e.target.value })} /></label>
            <label>Qty <input type="number" step="0.01" min="0.01" value={line.quantity} onChange={(e) => update(index, { quantity: e.target.value })} required /></label>
            <label>Unit <input value={line.unit} onChange={(e) => update(index, { unit: e.target.value })} /></label>
            {receipt ? <label>Rate <input type="number" step="0.01" min="0" value={line.rate || ""} onChange={(e) => update(index, { rate: e.target.value })} /></label> : null}
            {receipt ? <label>Amount <input type="number" step="0.01" min="0" value={line.amount || ""} onChange={(e) => update(index, { amount: e.target.value })} /></label> : null}
            {arrival ? <label className="check-label">Arrived <input type="checkbox" checked={line.reached !== false} onChange={(e) => update(index, { reached: e.target.checked })} /></label> : null}
            <label>Remarks <input value={line.remarks} onChange={(e) => update(index, { remarks: e.target.value })} /></label>
            <button type="button" className="icon-button" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, i) => i !== index))} title="Remove item line">
              <Trash2 size={16} />
            </button>
          </div>
        ))}
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
      {user.role === "requester" ? (
        <form className="panel grid" onSubmit={submit}>
          <PanelTitle title="New Requisition" subtitle="Enter the request details. Document numbers are added only when stock is received." />
          {message ? <div className="success">{message}</div> : null}
          {error ? <div className="error">{error}</div> : null}
          <div className="grid two">
            <label>Requisition No <input value={form.requisitionNo} onChange={(e) => setForm({ ...form, requisitionNo: e.target.value })} placeholder="Auto if blank" /></label>
            <label>Request Date <input type="date" value={form.requestDate} onChange={(e) => setForm({ ...form, requestDate: e.target.value })} /></label>
          </div>
          <div className="grid two">
            <label>Budget Head <BudgetHeadSelect budgetHeads={data.budgetHeads} value={form.budgetHeadId} onChange={(budgetHeadId) => setForm({ ...form, budgetHeadId, infrastructureId: "" })} /></label>
            <label>Key Infrastructure <InfrastructureSelect infrastructures={data.infrastructures} value={form.infrastructureId} budgetHeadId={form.budgetHeadId} onChange={(infrastructureId) => setForm({ ...form, infrastructureId })} /></label>
          </div>
          <label>Purpose <textarea rows="2" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></label>
          <LineEditor items={data.items} lines={lines} setLines={setLines} />
          <div className="notice">Challan No, DV No, and Bill No are recorded only when approved stock reaches the store.</div>
          <button className="primary" type="submit">Submit requisition</button>
        </form>
      ) : null}
      <div className="panel"><PanelTitle title="All Requisitions" subtitle="Search by request number, item, status, purpose, or supply order." /><RequisitionTable rows={data.requisitions} /></div>
    </>
  );
}

function RequisitionTable({ rows, compact = false }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = rows.filter((r) => {
    const statusOk = status === "all" || r.status === status;
    const queryOk = matchesSearch([r.requisitionNo, r.requestDate, r.status, r.purpose, r.supplyOrderNo, ...(r.lines || []).map((line) => line.itemName)], query);
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
          <thead><tr><th>No</th><th>Date</th><th>Status</th><th>Items</th><th>Purpose</th><th>Supply Order</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td><strong>{fmt(r.requisitionNo)}</strong></td>
                <td>{fmt(r.requestDate)}</td>
                <td><span className={`status ${r.status}`}>{statusLabels[r.status] || r.status}</span></td>
                <td>{compact ? num(r.lines?.length || 0) : r.lines?.map((l) => <div key={l.id || `${l.itemName}-${l.quantity}`}>{l.itemName} ({num(l.quantity)} {l.unit})</div>)}</td>
                <td>{fmt(r.purpose)}</td>
                <td>{fmt(r.supplyOrderNo)}</td>
              </tr>
            ))}
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
          <div className="approval-list">{rows.map((r) => <ApprovalRow key={r.id} row={r} user={user} updateStatus={updateStatus} />)}</div>
        )}
      </div>
    </>
  );
}

function ApprovalRow({ row, user, updateStatus }) {
  return (
    <div className="approval-card">
      <div className="approval-main">
        <div>
          <strong>{fmt(row.requisitionNo)}</strong>
          <span>{fmt(row.purpose)}</span>
        </div>
        <span className={`status ${row.status}`}>{statusLabels[row.status] || row.status}</span>
      </div>
      <OrderedItemsTable lines={row.lines || []} />
      <div>
        <div className="actions">
          {user.role === "store" && row.status === "SUBMITTED" ? <button className="primary" onClick={() => updateStatus(row.id, "verify")}>Verify</button> : null}
          {user.role === "approver" && row.status === "STORE_VERIFIED" ? <button className="primary" onClick={() => updateStatus(row.id, "final_approve")}>Final approve</button> : null}
          {user.role === "store" && row.status === "APPROVED" ? <button onClick={() => updateStatus(row.id, "order")}>Mark order placed</button> : null}
          {row.status !== "APPROVED" && (user.role === "store" || user.role === "approver") ? <button className="danger" onClick={() => updateStatus(row.id, "reject")}>Reject</button> : null}
        </div>
      </div>
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
        <PanelTitle title="Receipt Details" subtitle="Use this screen only after the order has reached the store or site." />
        {error ? <div className="error">{error}</div> : null}
        <div className="grid four">
          <label>Linked Requisition <select value={form.requisitionId} onChange={(e) => selectRequisition(e.target.value)}><option value="">No linked requisition</option>{approved.map((r) => <option key={r.id} value={r.id}>{r.requisitionNo} - {statusLabels[r.status]}</option>)}</select></label>
          <label>Receipt Date <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
          <label>Supplier / Party <input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></label>
        </div>
        <div className="grid two">
          <label>Budget Head <BudgetHeadSelect budgetHeads={data.budgetHeads} value={form.budgetHeadId} onChange={(budgetHeadId) => setForm({ ...form, budgetHeadId, infrastructureId: "" })} /></label>
          <label>Key Infrastructure <InfrastructureSelect infrastructures={data.infrastructures} value={form.infrastructureId} budgetHeadId={form.budgetHeadId} onChange={(infrastructureId) => setForm({ ...form, infrastructureId })} /></label>
        </div>
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
        <LineEditor items={data.items} lines={lines} setLines={setLines} receipt arrival />
        <label>Remarks <textarea rows="2" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
        <button className="primary" type="submit">Record receipt</button>
      </form>
    </>
  );
}

function Inventory({ data }) {
  const [filters, setFilters] = useState({ budgetHeadId: "", infrastructureId: "", itemId: "" });
  const filteredLedger = data.ledger.filter((row) => {
    if (filters.budgetHeadId && row.budgetHeadId !== filters.budgetHeadId) return false;
    if (filters.infrastructureId && row.infrastructureId !== filters.infrastructureId) return false;
    if (filters.itemId && row.itemId !== filters.itemId) return false;
    return true;
  });
  const rows = filters.budgetHeadId || filters.infrastructureId || filters.itemId ? summarizeLedger(filteredLedger) : data.inventory;
  return (
    <>
      <Header title="Inventory" eyebrow="Stock balance" subtitle="Current stock is calculated from every receipt and issue movement." />
      <div className="panel">
        <PanelTitle title="Filter by" subtitle="Budget head, key infrastructure, and item." />
        <div className="grid three">
          <label>Budget Head <BudgetHeadSelect budgetHeads={data.budgetHeads} value={filters.budgetHeadId} onChange={(budgetHeadId) => setFilters({ ...filters, budgetHeadId, infrastructureId: "" })} /></label>
          <label>Key Infrastructure <InfrastructureSelect infrastructures={data.infrastructures} value={filters.infrastructureId} budgetHeadId={filters.budgetHeadId} onChange={(infrastructureId) => setFilters({ ...filters, infrastructureId })} /></label>
          <label>Item <select value={filters.itemId} onChange={(e) => setFilters({ ...filters, itemId: e.target.value })}><option value="">All items</option>{data.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
      </div>
      <div className="panel"><PanelTitle title="Current Stock" subtitle="Search by item, category, or unit." /><InventoryTable rows={rows} /></div>
      <div className="panel"><PanelTitle title="Recent Ledger" subtitle="Latest receipt and issue movements." /><LedgerTable rows={data.ledger.slice(0, 100)} /></div>
    </>
  );
}

function InventoryTable({ rows, compact = false }) {
  const [query, setQuery] = useState("");
  const filtered = rows.filter((r) => matchesSearch([r.itemName, r.category, r.unit, r.lastMovementAt], query));
  if (!rows.length) return <div className="empty">No stock movements found.</div>;
  return (
    <>
      {!compact ? <div className="table-tools"><SearchBox value={query} onChange={setQuery} placeholder="Search stock" /></div> : null}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Item</th><th>Category</th><th>Received</th><th>Issued</th><th>Balance</th><th>Unit</th><th>Last Movement</th></tr></thead>
          <tbody>{filtered.map((r) => <tr key={r.itemId}><td><strong>{fmt(r.itemName)}</strong></td><td>{fmt(r.category)}</td><td>{num(r.received)}</td><td>{num(r.issued)}</td><td><strong className={Number(r.balance) <= 0 ? "negative" : "positive"}>{num(r.balance)}</strong></td><td>{fmt(r.unit)}</td><td>{fmt(r.lastMovementAt)}</td></tr>)}</tbody>
        </table>
      </div>
      {!filtered.length ? <div className="empty compact-empty">No matching stock items.</div> : null}
    </>
  );
}

function LedgerTable({ rows }) {
  if (!rows.length) return <div className="empty">No ledger movements found.</div>;
  return (
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Item</th><th>Qty</th><th>Unit</th><th>Document</th><th>Remarks</th></tr></thead>
      <tbody>{rows.map((r) => <tr key={r.id}><td>{fmt(r.date)}</td><td>{fmt(r.type)}</td><td>{fmt(r.itemName)}</td><td>{num(r.quantity)}</td><td>{fmt(r.unit)}</td><td>{fmt(r.documentNo)}</td><td>{fmt(r.remarks)}</td></tr>)}</tbody>
    </table>
  );
}

function IssueStock({ data, api, refresh, setView }) {
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
    <>
      <Header title="Issue Stock" eyebrow="Material release" subtitle="Issued quantities reduce stock and appear immediately in the ledger." />
      <form className="panel grid" onSubmit={submit}>
        <PanelTitle title="Issue Details" subtitle="Issue stock only when the item has available balance." />
        {error ? <div className="error">{error}</div> : null}
        <div className="grid four">
          <label>Issue Date <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></label>
          <label>Issue Challan No <input value={form.issueChallanNo} onChange={(e) => setForm({ ...form, issueChallanNo: e.target.value })} /></label>
          <label>Issued To <input value={form.issuedTo} onChange={(e) => setForm({ ...form, issuedTo: e.target.value })} required /></label>
        </div>
        <div className="grid two">
          <label>Budget Head <BudgetHeadSelect budgetHeads={data.budgetHeads} value={form.budgetHeadId} onChange={(budgetHeadId) => setForm({ ...form, budgetHeadId, infrastructureId: "" })} /></label>
          <label>Key Infrastructure <InfrastructureSelect infrastructures={data.infrastructures} value={form.infrastructureId} budgetHeadId={form.budgetHeadId} onChange={(infrastructureId) => setForm({ ...form, infrastructureId })} /></label>
        </div>
        <LineEditor items={data.items} lines={lines} setLines={setLines} />
        <label>Remarks <textarea rows="2" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></label>
        <button className="primary" type="submit">Issue stock</button>
      </form>
    </>
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

createRoot(document.getElementById("root")).render(<App />);
