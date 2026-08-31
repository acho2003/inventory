import { useEffect, useMemo, useState } from "react";
import { Lock, RefreshCw } from "lucide-react";
import { APP_NAME } from "../config/constants.js";
import { Header, Kpi, PanelTitle, SegmentedTabs } from "../components/common.jsx";
import { dateInRange } from "../lib/utils.js";
import { AllStockSummaryTable, InfrastructureInventorySection, InventoryFilterBar } from "./Inventory.jsx";

const emptyPublicStock = {
  generatedAt: "",
  items: [],
  infrastructures: [],
  summary: [],
  groups: []
};

export function PublicStock({ onSignIn }) {
  const [activeTab, setActiveTab] = useState("summary");
  const [filters, setFilters] = useState({ itemId: "", infrastructureId: "", dateFrom: "", dateTo: "" });
  const [payload, setPayload] = useState(emptyPublicStock);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPublicStock() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/public-stock");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Could not load public stock.");
      setPayload(data);
    } catch (err) {
      setError(err.message || "Could not load public stock.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPublicStock();
  }, []);

  const filteredSummary = useMemo(() => {
    return payload.summary.filter((row) => {
      if (filters.itemId && row.itemId !== filters.itemId) return false;
      if (!dateInRange(row.lastMovementAt, filters.dateFrom, filters.dateTo)) return false;
      return true;
    });
  }, [payload.summary, filters]);

  const filteredGroups = useMemo(() => {
    return payload.groups
      .filter((group) => !filters.infrastructureId || group.id === filters.infrastructureId)
      .map((group) => ({
        ...group,
        stock: group.stock.filter((row) => {
          if (filters.itemId && row.itemId !== filters.itemId) return false;
          if (!dateInRange(row.lastMovementAt, filters.dateFrom, filters.dateTo)) return false;
          return true;
        })
      }))
      .filter((group) => group.stock.length);
  }, [payload.groups, filters]);

  const totals = useMemo(() => {
    return payload.summary.reduce((result, row) => ({
      received: result.received + Number(row.receivedAtArrival || 0),
      store: result.store + Number(row.storeStock || 0),
      infrastructure: result.infrastructure + Number(row.infrastructureStock || 0),
      available: result.available + Number(row.totalAvailable || 0)
    }), { received: 0, store: 0, infrastructure: 0, available: 0 });
  }, [payload.summary]);

  return (
    <section className="public-stock-page">
      <div className="public-stock-shell">
        <div className="public-stock-header">
          <div className="brand compact-brand">
            <div><Lock size={18} /></div>
            <span>
              <strong>{APP_NAME}</strong>
              <small>Public stock view</small>
            </span>
          </div>
          <div className="public-stock-actions">
            <button type="button" onClick={loadPublicStock} disabled={loading}>
              <RefreshCw size={16} />
              <span>{loading ? "Refreshing" : "Refresh"}</span>
            </button>
            <button type="button" className="primary" onClick={onSignIn}>Sign in</button>
          </div>
        </div>

        <Header
          title="Stock Summary"
          eyebrow="Public inventory"
          subtitle="Read-only stock summary and key infrastructure balances. Sign in to manage requisitions, receipts, issues, and reports."
        />

        {error ? <div className="error">{error}</div> : null}

        <div className="kpis">
          <Kpi label="Items" value={payload.summary.length} hint="Tracked stock items" tone="forest" />
          <Kpi label="Store Stock" value={totals.store} hint="Available in store" tone="blue" />
          <Kpi label="Infrastructure Stock" value={totals.infrastructure} hint="Assigned to key infrastructure" tone="amber" />
          <Kpi label="Total Available" value={totals.available} hint="Store plus infrastructure" tone={totals.available <= 0 ? "red" : "forest"} />
        </div>

        <SegmentedTabs
          active={activeTab}
          onChange={setActiveTab}
          tabs={[
            { id: "summary", label: "All Stock Summary" },
            { id: "infrastructure", label: "Key Infrastructure Stock" }
          ]}
        />

        {loading ? (
          <div className="panel"><div className="empty">Loading public stock...</div></div>
        ) : null}

        {!loading && activeTab === "summary" ? (
          <div className="panel">
            <PanelTitle title="All Stock Summary" subtitle={`Last refreshed: ${payload.generatedAt ? new Date(payload.generatedAt).toLocaleString() : "-"}`} />
            <AllStockSummaryTable rows={filteredSummary} />
          </div>
        ) : null}

        {!loading && activeTab === "infrastructure" ? (
          <div className="inventory-groups">
            <InventoryFilterBar
              filters={filters}
              setFilters={setFilters}
              items={payload.items}
              infrastructures={payload.infrastructures}
              includeSearch={false}
            />
            {filteredGroups.map((group) => <InfrastructureInventorySection key={group.id} group={group} />)}
            {!filteredGroups.length ? <div className="panel"><div className="empty">No key infrastructure stock matches the selected filters.</div></div> : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
