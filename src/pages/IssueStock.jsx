import { useState } from "react";
import { today } from "../lib/utils.js";
import { Header, PanelTitle, SegmentedTabs } from "../components/common.jsx";
import { BudgetHeadSelect, InfrastructureSelect, LineEditor, blankLine } from "../components/forms.jsx";
import { IssueHistoryTable, StockEventForm, StockEventTable } from "../components/stock.jsx";

export function IssueStock({ data, api, refresh, setView }) {
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


