import { useState } from "react";
import { stockEventTypes } from "../config/constants.js";
import { byId, fmt, matchesSearch, num, today } from "../lib/utils.js";
import { BudgetHeadSelect, InfrastructureSelect } from "./forms.jsx";
import { PanelTitle, SearchBox } from "./common.jsx";

export function StockEventForm({ data, onSubmit, title = "Stock Event", subtitle = "Record a stock movement or condition change.", types = Object.keys(stockEventTypes), showTypeSelect = true, submitLabel = "Record stock event" }) {
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



export function StockEventTable({ events = [], infrastructures = [], emptyText = "No stock events recorded.", showAmount = false }) {
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



export function IssueHistoryTable({ issues = [] }) {
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


