export function today() {
  return new Date().toISOString().slice(0, 10);
}



export function num(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
}



export function fmt(value) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}



export function matchesSearch(values, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => String(value || "").toLowerCase().includes(needle));
}



export function lineSummary(lines = []) {
  if (!lines.length) return "No items";
  const first = lines[0];
  const suffix = lines.length > 1 ? ` +${lines.length - 1} more` : "";
  return `${first.itemName || "Item"} (${num(first.quantity)} ${first.unit || ""})${suffix}`;
}



export function byId(rows = []) {
  return Object.fromEntries(rows.map((row) => [row.id, row]));
}



export function lineCategory(line = {}) {
  return line.category || line.specification || "";
}



export function lineAmount(line = {}) {
  const explicit = Number(line.amount || 0);
  return explicit || (Number(line.rate || 0) * Number(line.quantity || 0));
}



export function amountUsedFor(records = [], field, id) {
  return records
    .filter((record) => record[field] === id)
    .reduce((sum, record) => sum + (record.lines || []).reduce((lineSum, line) => lineSum + lineAmount(line), 0), 0);
}



export function requisitionReceivedQty(receipts = [], requisitionId, itemId) {
  return receipts
    .filter((receipt) => receipt.requisitionId === requisitionId)
    .reduce((sum, receipt) => sum + (receipt.lines || [])
      .filter((line) => line.itemId === itemId)
      .reduce((lineSum, line) => lineSum + Number(line.quantity || 0), 0), 0);
}



export function dateInRange(date, from, to) {
  const value = String(date || "").slice(0, 10);
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}



export function budgetUsageRows(data) {
  if (data.dashboard?.budgetUsage) return data.dashboard.budgetUsage;
  return data.budgetHeads.map((head) => {
    const used = amountUsedFor(data.receipts, "budgetHeadId", head.id);
    const amount = Number(head.amount || 0);
    return {
      id: head.id,
      name: head.name,
      amount,
      status: head.status || "Active",
      used,
      balance: amount - used
    };
  });
}



export function infrastructureUsageRows(data) {
  if (data.dashboard?.infrastructureUsage) return data.dashboard.infrastructureUsage;
  return data.infrastructures.map((infra) => {
    const used = amountUsedFor(data.receipts, "infrastructureId", infra.id)
      + data.stockEvents
        .filter((event) => ["REPAIR_NOTE", "RETURNED_FROM_REPAIR"].includes(event.type) && (event.fromInfrastructureId || event.toInfrastructureId) === infra.id)
        .reduce((sum, event) => sum + Number(event.amount || 0), 0);
    return {
      id: infra.id,
      name: infra.name,
      status: infra.status || "Active",
      used
    };
  });
}


