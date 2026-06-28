import React, { useState } from "react";
import { stockEventTypes } from "../config/constants.js";
import { byId, fmt, matchesSearch, num } from "../lib/utils.js";
import { buildLifecycleEvents, filterInventoryLedger, filterLifecycleEvents, filterLifecycleRows, ledgerDocumentFields, summarizeAllStock, summarizeLedger } from "../lib/inventory.js";
import { Header, PanelTitle, SearchBox, SegmentedTabs } from "../components/common.jsx";
import { IssueHistoryTable, StockEventTable } from "../components/stock.jsx";

export function Inventory({ data }) {
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



function InventoryFilterBar({ filters, setFilters, items, infrastructures, includeSearch = true }) {
  return (
    <div className="panel compact-filter-panel">
      {includeSearch ? (
        <div className="filter-search-row">
          <SearchBox value={filters.query || ""} onChange={(query) => setFilters({ ...filters, query })} placeholder="Search item, document, person" />
        </div>
      ) : null}
      <div className="table-tools filter-grid">
        <label>Item <select value={filters.itemId || ""} onChange={(e) => setFilters({ ...filters, itemId: e.target.value })}><option value="">All items</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Key Infrastructure <select value={filters.infrastructureId || ""} onChange={(e) => setFilters({ ...filters, infrastructureId: e.target.value })}><option value="">All locations</option><option value="store">Store / Not Assigned</option>{infrastructures.map((infra) => <option key={infra.id} value={infra.id}>{infra.name}</option>)}</select></label>
        <label>From <input type="date" value={filters.dateFrom || ""} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></label>
        <label>To <input type="date" value={filters.dateTo || ""} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></label>
        <button type="button" className="soft-button" onClick={() => setFilters({ itemId: "", infrastructureId: "", dateFrom: "", dateTo: "", query: "" })}>Clear</button>
      </div>
    </div>
  );
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

