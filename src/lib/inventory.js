import { byId, dateInRange, lineAmount, matchesSearch } from "./utils.js";

export function summarizeLedger(rows = []) {
  const stock = new Map();
  const incomingTypes = new Set(["RECEIPT", "TRANSFER_IN", "RETURNED_FROM_REPAIR", "ADJUSTMENT"]);
  const outgoingTypes = new Set(["ISSUE", "TRANSFER_OUT", "DISPOSED", "SPOILED"]);
  for (const movement of rows) {
    if (movement.type === "REPAIR_NOTE") continue;
    const key = `${movement.infrastructureId || ""}::${movement.itemId}`;
    const current = stock.get(key) || {
      itemId: movement.itemId,
      itemName: movement.itemName,
      category: movement.category || "General",
      unit: movement.unit || "",
      infrastructureId: movement.infrastructureId || "",
      received: 0,
      issued: 0,
      balance: 0,
      lastMovementAt: movement.date
    };
    if (incomingTypes.has(movement.type)) current.received += Number(movement.quantity || 0);
    if (outgoingTypes.has(movement.type)) current.issued += Number(movement.quantity || 0);
    current.balance = current.received - current.issued;
    if (!current.lastMovementAt || movement.date > current.lastMovementAt) current.lastMovementAt = movement.date;
    stock.set(key, current);
  }
  return [...stock.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}



export function summarizeAllStock(inventory = [], ledger = []) {
  const rows = new Map();
  for (const stock of inventory) {
    const current = rows.get(stock.itemId) || {
      itemId: stock.itemId,
      itemName: stock.itemName,
      category: stock.category || "General",
      unit: stock.unit || "",
      receivedAtArrival: 0,
      storeStock: 0,
      infrastructureStock: 0,
      disposedOrSpoiled: 0,
      totalAvailable: 0,
      lastMovementAt: stock.lastMovementAt || ""
    };
    if (stock.infrastructureId) current.infrastructureStock += Number(stock.balance || 0);
    else current.storeStock += Number(stock.balance || 0);
    if (!current.lastMovementAt || String(stock.lastMovementAt || "") > current.lastMovementAt) current.lastMovementAt = stock.lastMovementAt || "";
    rows.set(stock.itemId, current);
  }
  for (const movement of ledger) {
    const current = rows.get(movement.itemId) || {
      itemId: movement.itemId,
      itemName: movement.itemName,
      category: movement.category || "General",
      unit: movement.unit || "",
      receivedAtArrival: 0,
      storeStock: 0,
      infrastructureStock: 0,
      disposedOrSpoiled: 0,
      totalAvailable: 0,
      lastMovementAt: movement.date || ""
    };
    if (movement.type === "RECEIPT") current.receivedAtArrival += Number(movement.quantity || 0);
    if (["DISPOSED", "SPOILED"].includes(movement.type)) current.disposedOrSpoiled += Number(movement.quantity || 0);
    if (!current.lastMovementAt || String(movement.date || "") > current.lastMovementAt) current.lastMovementAt = movement.date || "";
    rows.set(movement.itemId, current);
  }
  return [...rows.values()]
    .map((row) => ({ ...row, totalAvailable: row.storeStock + row.infrastructureStock }))
    .sort((a, b) => a.itemName.localeCompare(b.itemName));
}



function receiptForLedger(row, receiptMap = {}) {
  return row.referenceType === "receipt" ? receiptMap[row.referenceId] : null;
}



export function ledgerDocumentFields(row, receiptMap = {}) {
  const receipt = receiptForLedger(row, receiptMap);
  return {
    challanNo: receipt?.challanNo || "",
    dvNo: receipt?.dvNo || "",
    billNo: receipt?.billNo || "",
    documentNo: row.documentNo || receipt?.challanNo || ""
  };
}



export function ledgerAmount(row, receiptMap = {}, stockEventMap = {}) {
  if (Number(row.amount || 0) > 0) return Number(row.amount || 0);
  if (row.referenceType === "receipt") {
    const receipt = receiptMap[row.referenceId];
    const line = (receipt?.lines || []).find((entry) => entry.id === row.lineId)
      || (receipt?.lines || []).find((entry) => entry.itemId === row.itemId && Number(entry.quantity || 0) === Number(row.quantity || 0));
    return lineAmount(line);
  }
  if (row.referenceType === "stockEvent") return Number(stockEventMap[row.referenceId]?.amount || 0);
  return 0;
}



export function lifecycleGroupKey(row) {
  if (row.lifecycleEventId) return row.lifecycleEventId;
  if (row.referenceType && row.referenceId) {
    const lineKey = row.lineId || `${row.itemId}:${row.quantity}:${row.unit || ""}`;
    return `${row.referenceType}:${row.referenceId}:${lineKey}`;
  }
  return row.id;
}



export function lifecycleLabel(types, rows) {
  if (types.has("ISSUE") && types.has("TRANSFER_IN")) return "Issued to Infrastructure";
  if (types.has("TRANSFER_OUT") && types.has("TRANSFER_IN")) return "Infrastructure Transfer";
  const type = rows[0]?.type || "";
  if (type === "RECEIPT") return "Received at Store";
  if (type === "RETURNED_FROM_REPAIR") return "Returned from Repair";
  if (type === "REPAIR_NOTE") return "Under Repair";
  if (type === "DISPOSED") return "Disposed";
  if (type === "SPOILED") return "Spoiled";
  if (type === "ADJUSTMENT") return "Stock Adjustment";
  return rows[0]?.lifecycleStatus || type;
}



export function buildLifecycleEvents(rows = [], receipts = [], stockEvents = []) {
  const receiptMap = byId(receipts);
  const stockEventMap = byId(stockEvents);
  const grouped = new Map();
  for (const row of rows) {
    const key = lifecycleGroupKey(row);
    const group = grouped.get(key) || [];
    group.push(row);
    grouped.set(key, group);
  }
  return [...grouped.entries()].map(([id, rawRows]) => {
    const types = new Set(rawRows.map((row) => row.type));
    const source = rawRows.find((row) => row.movementRole === "source" || ["ISSUE", "TRANSFER_OUT"].includes(row.type)) || rawRows[0];
    const destination = rawRows.find((row) => row.movementRole === "destination" || row.type === "TRANSFER_IN");
    const representative = source || rawRows[0];
    const receipt = representative.referenceType === "receipt" ? receiptMap[representative.referenceId] : null;
    const docs = ledgerDocumentFields(representative, receiptMap);
    const totalAmount = Math.max(...rawRows.map((row) => ledgerAmount(row, receiptMap, stockEventMap)));
    return {
      id,
      date: representative.date,
      lifecycle: lifecycleLabel(types, rawRows),
      type: types.has("ISSUE") ? "ISSUE" : types.has("TRANSFER_OUT") ? "TRANSFER" : representative.type,
      itemId: representative.itemId,
      itemName: representative.itemName,
      quantity: Math.max(...rawRows.map((row) => Number(row.quantity || 0))),
      unit: representative.unit,
      fromInfrastructureId: source?.fromInfrastructureId || (source?.type === "TRANSFER_OUT" ? source.infrastructureId : ""),
      toInfrastructureId: destination?.toInfrastructureId || destination?.infrastructureId || representative.toInfrastructureId || representative.infrastructureId || receipt?.infrastructureId || "",
      documentNo: docs.documentNo,
      challanNo: docs.challanNo,
      dvNo: docs.dvNo,
      billNo: docs.billNo,
      totalAmount,
      dutyPerson: representative.dutyPerson || representative.createdByName,
      remarks: representative.remarks,
      rawRows
    };
  }).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || String(b.id).localeCompare(String(a.id)));
}



export function filterInventoryLedger(rows = [], filters = {}, groupId = "") {
  return rows.filter((row) => {
    if (filters.itemId && row.itemId !== filters.itemId) return false;
    if (!dateInRange(row.date, filters.dateFrom, filters.dateTo)) return false;
    if (filters.infrastructureId && filters.infrastructureId !== groupId) return false;
    return true;
  });
}



export function filterLifecycleRows(rows = [], filters = {}) {
  const query = filters.query || "";
  return rows.filter((row) => {
    if (filters.itemId && row.itemId !== filters.itemId) return false;
    if (!dateInRange(row.date, filters.dateFrom, filters.dateTo)) return false;
    if (query && !matchesSearch([row.date, row.type, row.lifecycleStatus, row.itemName, row.documentNo, row.dutyPerson, row.remarks], query)) return false;
    return true;
  });
}



export function filterLifecycleEvents(events = [], filters = {}, infrastructures = []) {
  const infrastructureMap = byId(infrastructures);
  return events.filter((event) => {
    if (filters.infrastructureId) {
      const matchesInfrastructure = filters.infrastructureId === "store"
        ? !event.fromInfrastructureId && !event.toInfrastructureId
        : [event.fromInfrastructureId, event.toInfrastructureId].includes(filters.infrastructureId);
      if (!matchesInfrastructure) return false;
    }
    if (filters.query && !matchesSearch([
      event.date,
      event.type,
      event.lifecycle,
      event.itemName,
      event.documentNo,
      event.challanNo,
      event.dvNo,
      event.billNo,
      event.dutyPerson,
      event.remarks,
      infrastructureMap[event.fromInfrastructureId]?.name,
      infrastructureMap[event.toInfrastructureId]?.name
    ], filters.query)) return false;
    return true;
  });
}


