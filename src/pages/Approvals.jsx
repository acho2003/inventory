import { useEffect, useState } from "react";
import { can, statusLabels } from "../config/constants.js";
import { fmt, lineCategory, lineIsRejected, num } from "../lib/utils.js";
import { Header, PanelTitle } from "../components/common.jsx";

export function Approvals({ user, data, api, refresh }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function updateStatus(id, action, lineDecisions = []) {
    const body = { action, lineDecisions };
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

  const rows = data.requisitions.filter((requisition) => ["SUBMITTED", "STORE_VERIFIED", "APPROVED"].includes(requisition.status) || isLegacyWholeRejected(requisition));
  return (
    <>
      <Header title="Approvals" eyebrow="Review requests" subtitle="Store reviews every item first; PMU gives the final item-level decision." />
      <div className="panel">
        <PanelTitle title="Approval Queue" subtitle="Approve or reject individual items. Legacy whole-rejected requests can be reopened here for item-level review." />
        {message ? <div className="success">{message}</div> : null}
        {error ? <div className="error">{error}</div> : null}
        {!rows.length ? <div className="empty">No active approval items.</div> : (
          <div className="approval-list">{rows.map((row) => <ApprovalRow key={row.id} row={row} user={user} data={data} updateStatus={updateStatus} setError={setError} />)}</div>
        )}
      </div>
    </>
  );
}

function isLegacyWholeRejected(requisition) {
  return requisition.status === "REJECTED"
    && !(requisition.lines || []).some((line) => Boolean(line.reviews?.store || line.reviews?.pmu));
}

function defaultDecisions(row) {
  const eligibleLines = row.status === "STORE_VERIFIED"
    ? (row.lines || []).filter((line) => !lineIsRejected(line))
    : row.lines || [];
  return Object.fromEntries(eligibleLines.map((line) => [line.id, { decision: "APPROVED", note: "" }]));
}

function ApprovalRow({ row, user, data, updateStatus, setError }) {
  const [decisions, setDecisions] = useState(() => defaultDecisions(row));
  const budgetHead = data.budgetHeads.find((entry) => entry.id === row.budgetHeadId);
  const infrastructure = data.infrastructures.find((entry) => entry.id === row.infrastructureId);
  const legacyRejected = isLegacyWholeRejected(row);
  const reopenBlocked = Boolean(row.supplyOrderNo || row.orderedAt || data.receipts.some((receipt) => receipt.requisitionId === row.id));
  const canReopen = legacyRejected && !reopenBlocked && (can(user, "requisition:first_approve") || can(user, "requisition:final_approve") || can(user, "admin:crud"));
  const stage = row.status === "SUBMITTED" && can(user, "requisition:first_approve")
    ? "store"
    : row.status === "STORE_VERIFIED" && can(user, "requisition:final_approve")
      ? "pmu"
      : "";

  useEffect(() => {
    setDecisions(defaultDecisions(row));
  }, [row.id, row.status]);

  function updateDecision(lineId, patch) {
    setDecisions((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] || { decision: "APPROVED", note: "" }), ...patch }
    }));
  }

  function submitReview() {
    const lineDecisions = Object.entries(decisions).map(([lineId, decision]) => ({ lineId, ...decision }));
    if (lineDecisions.some((entry) => entry.decision === "REJECTED" && !entry.note.trim())) {
      setError("Enter a rejection reason for every rejected item.");
      return;
    }
    updateStatus(row.id, stage === "store" ? "verify" : "final_approve", lineDecisions);
  }

  function reopenForItemReview() {
    const previousReason = row.rejectionReason ? `\n\nPrevious reason: ${row.rejectionReason}` : "";
    if (!window.confirm(`Reopen ${row.requisitionNo} for a fresh Store item-level review?${previousReason}`)) return;
    updateStatus(row.id, "reopen_item_review");
  }

  const allRejected = Object.values(decisions).length > 0 && Object.values(decisions).every((entry) => entry.decision === "REJECTED");
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
      {legacyRejected ? <div className="rejection-note">Legacy whole-request rejection: {fmt(row.rejectionReason)}</div> : null}
      <ApprovalTimeline row={row} />
      <OrderedItemsTable lines={row.lines || []} stage={stage} decisions={decisions} updateDecision={updateDecision} />
      <div className="actions">
        {stage ? (
          <button className={allRejected ? "danger" : "primary"} onClick={submitReview}>
            {allRejected ? "Complete review — all rejected" : stage === "store" ? "Verify approved items" : "Final approve items"}
          </button>
        ) : null}
        {canReopen ? <button className="primary" onClick={reopenForItemReview}>Reopen for item review</button> : null}
        {legacyRejected && reopenBlocked ? <span className="muted">Cannot reopen because an order or receipt is linked.</span> : null}
        {can(user, "requisition:order") && row.status === "APPROVED" ? <button onClick={() => updateStatus(row.id, "order")}>Mark order placed</button> : null}
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

function ReviewSummary({ review, label }) {
  if (!review) return <span className="muted">{label}: Pending</span>;
  return (
    <span className={`line-review-summary ${review.decision.toLowerCase()}`}>
      {label}: {review.decision === "APPROVED" ? "Approved" : "Rejected"} by {fmt(review.byName)}
      {review.note ? <small>{review.note}</small> : null}
    </span>
  );
}

function OrderedItemsTable({ lines, stage, decisions, updateDecision }) {
  if (!lines.length) return <div className="empty compact-empty">No ordered items.</div>;
  return (
    <div className="table-wrap compact-table approval-items-table">
      <table>
        <thead><tr><th>Item</th><th>Category</th><th>Specification</th><th>Qty</th><th>Unit</th><th>Review history</th>{stage ? <th>Current decision</th> : null}</tr></thead>
        <tbody>
          {lines.map((line) => {
            const locked = stage === "pmu" && line.reviews?.store?.decision === "REJECTED";
            const current = decisions[line.id];
            return (
              <tr key={line.id || `${line.itemName}-${line.quantity}`} className={lineIsRejected(line) ? "rejected-line" : ""}>
                <td><strong>{line.itemName}</strong><div className="muted">{fmt(line.remarks)}</div></td>
                <td>{fmt(lineCategory(line))}</td>
                <td>{fmt(line.specification)}</td>
                <td>{num(line.quantity)}</td>
                <td>{fmt(line.unit)}</td>
                <td><div className="line-review-history"><ReviewSummary review={line.reviews?.store} label="Store" /><ReviewSummary review={line.reviews?.pmu} label="PMU" /></div></td>
                {stage ? (
                  <td>
                    {locked ? <div className="rejection-note compact">Locked: rejected by Store<br />{fmt(line.reviews.store.note)}</div> : (
                      <div className="line-decision-control">
                        <select value={current?.decision || "APPROVED"} onChange={(event) => updateDecision(line.id, { decision: event.target.value, note: event.target.value === "APPROVED" ? "" : current?.note || "" })}>
                          <option value="APPROVED">Approve</option>
                          <option value="REJECTED">Reject</option>
                        </select>
                        {current?.decision === "REJECTED" ? <input value={current.note} onChange={(event) => updateDecision(line.id, { note: event.target.value })} placeholder="Rejection reason" required /> : null}
                      </div>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
