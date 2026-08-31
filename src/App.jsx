import { useEffect, useState } from "react";
import { Activity, BarChart3, Boxes, ClipboardList, FileDown, FolderKanban, LogOut, PackageCheck, PackageMinus, ShieldCheck } from "lucide-react";
import { APP_NAME, can, firstAllowedView, roleLabels, viewAllowed } from "./config/constants.js";
import { useApi } from "./hooks/useApi.js";
import { AccessDenied } from "./components/common.jsx";
import { Login } from "./pages/Login.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { ProjectsPage } from "./pages/Projects.jsx";
import { Requisitions } from "./pages/Requisitions.jsx";
import { Approvals } from "./pages/Approvals.jsx";
import { ReceiveStock } from "./pages/ReceiveStock.jsx";
import { Inventory } from "./pages/Inventory.jsx";
import { IssueStock } from "./pages/IssueStock.jsx";
import { Reports } from "./pages/Reports.jsx";
import { AuditTrail } from "./pages/AuditTrail.jsx";
import { PublicStock } from "./pages/PublicStock.jsx";

const publicStockPath = "/stock";

export function App() {
  const [token, setToken] = useState(localStorage.getItem("yarju_token") || "");
  const [user, setUser] = useState(null);
  const [view, setView] = useState("dashboard");
  const [route, setRoute] = useState(window.location.pathname === publicStockPath ? "public-stock" : "app");
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

  useEffect(() => {
    function syncRoute() {
      setRoute(window.location.pathname === publicStockPath ? "public-stock" : "app");
    }
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  async function login(username, password) {
    const result = await api("/api/login", { method: "POST", body: JSON.stringify({ username, password }) });
    localStorage.setItem("yarju_token", result.token);
    setToken(result.token);
    setUser(result.user);
    setView(firstAllowedView(result.user));
    window.history.pushState({}, "", "/");
    setRoute("app");
  }

  async function changeView(nextView) {
    if (!viewAllowed(user, nextView)) return;
    setView(nextView);
    await refresh(nextView);
  }

  useEffect(() => {
    if (user && !viewAllowed(user, view)) setView(firstAllowedView(user));
  }, [user, view]);

  function openPublicStock() {
    window.history.pushState({}, "", publicStockPath);
    setRoute("public-stock");
  }

  function openSignIn() {
    window.history.pushState({}, "", "/");
    setRoute("app");
  }

  if (loading) return <div className="login"><div className="panel">Loading...</div></div>;
  if (route === "public-stock") return <PublicStock onSignIn={openSignIn} />;
  if (!token || !user) return <Login onLogin={login} onOpenPublicStock={openPublicStock} />;

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
          <div>
            <Boxes size={20} />
          </div>
          <span>
            <strong>Yarju OAP</strong>
            <small>Inventory control</small>
          </span>
        </div>
        <div className="sidebar-nav-group">
          <span className="nav-label">Workspace</span>
          <nav className="nav">
            {navItems.filter((item) => item[3]).map(([id, label, Icon]) => (
              <button key={id} className={view === id ? "active" : ""} onClick={() => changeView(id)}>
                <Icon size={17} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-footer">
          <div className="userbox">
            <div className="avatar">{user.name.slice(0, 1)}</div>
            <div>
              <strong>{user.name}</strong>
              <span>{roleLabels[user.role] || user.role}</span>
            </div>
          </div>
          <button className="sidebar-action" onClick={() => { localStorage.removeItem("yarju_token"); setToken(""); setUser(null); }}>
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <main className="content">
        <CurrentView view={view} user={user} data={data} api={api} refresh={refresh} setView={setView} token={token} />
      </main>
    </section>
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
