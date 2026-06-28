import { useState } from "react";
import { can, statusLabels } from "../config/constants.js";
import { fmt, lineCategory, num } from "../lib/utils.js";
import { Header, PanelTitle } from "../components/common.jsx";

export function Approvals({ user, data, api, refresh }) {
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


