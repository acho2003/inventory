import { useState } from "react";
import { statusLabels } from "../config/constants.js";
import { byId, fmt, lineCategory, num, today } from "../lib/utils.js";
import { Header, PanelTitle } from "../components/common.jsx";
import { LineEditor, blankLine } from "../components/forms.jsx";

export function ReceiveStock({ data, api, refresh, setView }) {
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

