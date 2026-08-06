import { useState } from "react";
import { can, statusLabels } from "../config/constants.js";
import { fmt, lineIsRejected, lineSummary, matchesSearch, num, requisitionProgressLines, requisitionReceivedQty, today } from "../lib/utils.js";
import { Header, PanelTitle, SearchBox } from "../components/common.jsx";
import { BudgetHeadSelect, InfrastructureSelect, LineEditor, blankLine } from "../components/forms.jsx";

export function Requisitions({ user, data, api, refresh }) {
  const [form, setForm] = useState({ requisitionNo: "", requestDate: today(), budgetHeadId: "", infrastructureId: "", purpose: "" });
  const [lines, setLines] = useState([blankLine(), blankLine()]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState("");

  function resetForm() {
    setForm({ requisitionNo: "", requestDate: today(), budgetHeadId: "", infrastructureId: "", purpose: "" });
    setLines([blankLine(), blankLine()]);
    setEditingId("");
  }

  function startEdit(requisition) {
    setEditingId(requisition.id);
    setForm({
      requisitionNo: requisition.requisitionNo || "",
      requestDate: requisition.requestDate || today(),
      budgetHeadId: requisition.budgetHeadId || "",
      infrastructureId: requisition.infrastructureId || "",
      purpose: requisition.purpose || ""
    });
    setLines((requisition.lines || []).map((line) => ({
      id: line.id,
      itemId: line.itemId,
      itemName: line.itemName || "",
      category: line.category || "",
      specification: line.specification || "",
      quantity: line.quantity,
      unit: line.unit || "",
      issuedTillDate: line.issuedTillDate || 0,
      balance: line.balance || 0,
      remarks: line.remarks || ""
    })));
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const saved = await api(editingId ? `/api/requisitions/${editingId}` : "/api/requisitions", { method: editingId ? "PATCH" : "POST", body: JSON.stringify({ ...form, lines }) });
      resetForm();
      setMessage(editingId ? `Requisition ${saved.requisitionNo} updated and resubmitted for fresh approval.` : `Requisition ${saved.requisitionNo} submitted for store verification.`);
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
            <PanelTitle title={editingId ? "Edit and Resubmit Requisition" : "New Requisition"} subtitle={editingId ? "Saving changes clears current item decisions and restarts Store and PMU approval." : "Enter the request details. Document numbers are added only when stock is received."} />
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
            <div className="actions">
              <button className="primary" type="submit">{editingId ? "Save and resubmit" : "Submit requisition"}</button>
              {editingId ? <button type="button" onClick={resetForm}>Cancel edit</button> : null}
            </div>
          </form>
        ) : (
          <div className="panel">
            <PanelTitle title="Requisition Register" subtitle="Your role can review status, approvals, and receipt progress here." />
            <div className="notice">Use the Approvals, Receive Stock, and Issue Stock screens to move approved items through the store and into key infrastructures.</div>
          </div>
        )}
      </div>
      <div className="panel"><PanelTitle title="All Requisitions" subtitle="Search by request number, item, status, purpose, or supply order." /><RequisitionTable rows={data.requisitions} receipts={data.receipts} user={user} onEdit={startEdit} /></div>
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
  const progressLines = requisitionProgressLines(row);
  const orderedQty = progressLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const receivedQty = progressLines.reduce((sum, line) => sum + requisitionReceivedQty(receipts, row.id, line.itemId, line.id), 0);
  const remainingQty = Math.max(0, orderedQty - receivedQty);
  return (
    <div className="request-card progress-card">
      <div>
        <strong>{fmt(row.requisitionNo)}</strong>
        <span>{lineSummary(requisitionProgressLines(row))}</span>
      </div>
      <div className="progress-side">
        <span className={`status ${row.status}`}>{statusLabels[row.status] || row.status}</span>
        <small>Received {num(receivedQty)} / {num(orderedQty)} | To receive {num(remainingQty)}</small>
      </div>
    </div>
  );
}



function RequisitionTable({ rows, receipts = [], compact = false, user, onEdit }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const filtered = rows.filter((r) => {
    const statusOk = status === "all" || r.status === status;
    const queryOk = matchesSearch([r.requisitionNo, r.requestDate, r.status, r.purpose, r.supplyOrderNo, r.rejectionReason, ...(r.lines || []).flatMap((line) => [line.itemName, line.specification, line.reviews?.store?.note, line.reviews?.pmu?.note])], query);
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
          <thead><tr><th>No</th><th>Date</th><th>Status</th><th>Items</th><th>Specification</th><th>Received</th><th>Purpose</th><th>Supply Order</th>{onEdit ? <th>Actions</th> : null}</tr></thead>
          <tbody>
            {filtered.map((r) => {
              const progressLines = requisitionProgressLines(r);
              const orderedQty = progressLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
              const receivedQty = progressLines.reduce((sum, line) => sum + requisitionReceivedQty(receipts, r.id, line.itemId, line.id), 0);
              const remainingQty = Math.max(0, orderedQty - receivedQty);
              const hasReceipt = receipts.some((receipt) => receipt.requisitionId === r.id);
              const editable = can(user, "requisition:edit") && user?.role === "requester" && r.createdBy === user.id && ["SUBMITTED", "STORE_VERIFIED", "REJECTED"].includes(r.status) && !r.supplyOrderNo && !r.orderedAt && !hasReceipt;
              return (
                <tr key={r.id}>
                  <td><strong>{fmt(r.requisitionNo)}</strong></td>
                  <td>{fmt(r.requestDate)}</td>
                  <td>
                    <span className={`status ${r.status}`}>{statusLabels[r.status] || r.status}</span>
                    {r.status === "REJECTED" && r.rejectionReason ? <div className="rejection-note compact">Reason: {r.rejectionReason}</div> : null}
                  </td>
                  <td>{compact ? num(r.lines?.length || 0) : r.lines?.map((l) => <div className={lineIsRejected(l) ? "requisition-line rejected" : "requisition-line"} key={l.id || `${l.itemName}-${l.quantity}`}><span>{l.itemName} ({num(l.quantity)} {l.unit})</span><LineReviewStatus line={l} /></div>)}</td>
                  <td>{compact ? "-" : r.lines?.map((l) => <div key={l.id || `${l.itemName}-${l.quantity}`}>{fmt(l.specification)}</div>)}</td>
                  <td>
                    <strong>{num(receivedQty)} / {num(orderedQty)}</strong>
                    <div className="muted">To receive: {num(remainingQty)}</div>
                  </td>
                  <td>{fmt(r.purpose)}</td>
                  <td>{fmt(r.supplyOrderNo)}</td>
                  {onEdit ? <td>{editable ? <button type="button" onClick={() => onEdit(r)}>Edit</button> : <span className="muted">Locked</span>}</td> : null}
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

function LineReviewStatus({ line }) {
  const reviews = [
    ["Store", line.reviews?.store],
    ["PMU", line.reviews?.pmu]
  ].filter(([, review]) => review);
  if (!reviews.length) return null;
  return (
    <small className="line-review-list">
      {reviews.map(([label, review]) => (
        <span className={review.decision === "REJECTED" ? "rejected" : "approved"} key={label}>
          {label}: {review.decision === "REJECTED" ? `Rejected — ${review.note}` : "Approved"}
        </span>
      ))}
    </small>
  );
}
