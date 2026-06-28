import { useState } from "react";
import { can } from "../config/constants.js";
import { byId, fmt, lineCategory, num } from "../lib/utils.js";
import { Header, PanelTitle, DetailBlock } from "../components/common.jsx";

export function ProjectsPage({ user, data, api, refresh }) {
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


