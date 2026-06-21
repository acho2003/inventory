import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const DIST_DIR = path.join(__dirname, "dist");
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_HOST = process.env.PUBLIC_HOST || process.env.RENDER_EXTERNAL_HOSTNAME || "localhost";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const USE_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const REQUIRE_SUPABASE = process.env.REQUIRE_SUPABASE === "true";
const supabase = USE_SUPABASE
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })
  : null;
const collections = ["users", "projects", "budgetHeads", "infrastructures", "items", "requisitions", "receipts", "issues", "ledger", "expenses", "stockEvents", "auditEvents"];

const sessions = new Map();

if (REQUIRE_SUPABASE && !USE_SUPABASE) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when REQUIRE_SUPABASE=true.");
}

function isMissingSupabaseSchema(error) {
  return error?.message?.includes("Could not find the table 'public.app_state'");
}

function supabaseSetupMessage(error) {
  if (isMissingSupabaseSchema(error)) {
    return "Supabase is connected, but the database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor, then run npm run supabase:sync.";
  }
  return error?.message || "Supabase check failed.";
}

const rolePermissions = {
  requester: [
    "requisition:create",
    "requisition:read",
    "budget:read",
    "infrastructure:read",
    "item:read"
  ],
  store: [
    "dashboard:read",
    "requisition:read",
    "requisition:first_approve",
    "requisition:order",
    "budget:read",
    "infrastructure:read",
    "item:read",
    "receipt:read",
    "receipt:create",
    "issue:read",
    "issue:create",
    "stock:event:read",
    "stock:event",
    "inventory:read",
    "ledger:read",
    "report:read",
    "audit:read"
  ],
  approver: [
    "dashboard:read",
    "project:read",
    "budget:read",
    "infrastructure:read",
    "item:read",
    "requisition:read",
    "requisition:final_approve",
    "receipt:read",
    "issue:read",
    "stock:event:read",
    "inventory:read",
    "ledger:read",
    "report:read",
    "audit:read",
    "project:create",
    "budget:create",
    "infrastructure:create"
  ],
  admin: [
    "dashboard:read",
    "project:read",
    "budget:read",
    "infrastructure:read",
    "item:read",
    "requisition:create",
    "requisition:read",
    "requisition:first_approve",
    "requisition:final_approve",
    "requisition:order",
    "receipt:read",
    "receipt:create",
    "issue:read",
    "issue:create",
    "stock:event:read",
    "stock:event",
    "inventory:read",
    "ledger:read",
    "report:read",
    "audit:read",
    "project:create",
    "budget:create",
    "infrastructure:create",
    "admin:crud"
  ]
};

const defaultUsers = () => [
  { id: "u-admin", username: "admin", password: "admin123", name: "Administrator", role: "admin" },
  { id: "u-requester", username: "requester", password: "request123", name: "Requisition User", role: "requester" },
  { id: "u-store", username: "store", password: "store123", name: "Store / PMU Officer", role: "store" },
  { id: "u-approver", username: "approver", password: "approve123", name: "Final Approver", role: "approver" }
];

const defaultStore = () => ({
  meta: {
    name: "Yarju_OAP_inventory",
    createdAt: new Date().toISOString(),
    source: "Manual Yarju OAP records"
  },
  users: defaultUsers(),
  projects: [
    { id: "p-road", name: "PMU Road Construction", budget: 9000000 },
    { id: "p-main-15", name: "PMU Construction 15m", budget: 15000000 },
    { id: "p-main-20-18", name: "PMU Construction 20+18M", budget: 38000000 },
    { id: "p-main-50", name: "PMU Construction 50M", budget: 50000000 },
    { id: "p-temp-shed", name: "PMU Temporary Shed", budget: 1480000 },
    { id: "p-mushroom", name: "Mushroom Shed", budget: 3449790 }
  ],
  budgetHeads: [],
  infrastructures: [],
  items: [
    { id: "i-diesel", name: "Diesel", category: "Fuel", unit: "Ltrs" },
    { id: "i-petrol", name: "Petrol", category: "Fuel", unit: "Ltrs" },
    { id: "i-cement", name: "Cement", category: "Construction Material", unit: "Bags" },
    { id: "i-sand", name: "Sand", category: "Construction Material", unit: "T/L" },
    { id: "i-boulders", name: "Boulders", category: "Construction Material", unit: "T/L" },
    { id: "i-timber", name: "Timber", category: "Construction Material", unit: "Cft" },
    { id: "i-tmt", name: "TMT Rod", category: "Steel", unit: "Bundles" }
  ],
  requisitions: [],
  receipts: [],
  issues: [],
  ledger: [],
  expenses: [],
  stockEvents: [],
  auditEvents: [],
  counters: { requisition: 1, receipt: 1, issue: 1, movement: 1, project: 1, budgetHead: 1, infrastructure: 1, stockEvent: 1, transfer: 1, adjustment: 1, auditEvent: 1 }
});

function normalizeStore(store) {
  store.users ||= [];
  for (const user of defaultUsers()) {
    if (!store.users.some((entry) => entry.username?.toLowerCase() === user.username)) {
      store.users.push(user);
    }
  }
  store.projects ||= [];
  store.budgetHeads ||= [];
  store.infrastructures ||= [];
  store.items ||= [];
  store.requisitions ||= [];
  store.receipts ||= [];
  store.issues ||= [];
  store.ledger ||= [];
  store.expenses ||= [];
  store.stockEvents ||= [];
  store.auditEvents ||= [];
  store.counters ||= {};
  for (const key of ["requisition", "receipt", "issue", "movement", "project", "budgetHead", "infrastructure", "stockEvent", "transfer", "adjustment", "auditEvent"]) {
    store.counters[key] ||= 1;
  }
  for (const project of store.projects) {
    project.status ||= "Active";
    project.budget = Number(project.budget || 0);
  }
  for (const budgetHead of store.budgetHeads) {
    budgetHead.status ||= "Active";
    budgetHead.amount = Number(budgetHead.amount || 0);
  }
  for (const infrastructure of store.infrastructures) {
    infrastructure.status ||= "Active";
    infrastructure.amount = Number(infrastructure.amount || 0);
  }
  if (!store.budgetHeads.length && store.projects.length) {
    store.budgetHeads = store.projects.map((project) => ({
      id: `bh-${project.id.replace(/^p-/, "")}`,
      projectId: project.id,
      name: project.name,
      amount: Number(project.budget || 0),
      status: project.status || "Active",
      createdBy: "system",
      createdByName: "Imported record",
      createdAt: store.meta?.importedAt || store.meta?.createdAt || new Date().toISOString()
    }));
  }
  return store;
}

async function ensureStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(STORE_FILE);
  } catch {
    await fs.writeFile(STORE_FILE, JSON.stringify(defaultStore(), null, 2));
  }
}

function sortByUpdatedData(rows) {
  return rows.map((row) => row.data);
}

async function readSupabaseStore() {
  const store = defaultStore();
  const state = await supabase.from("app_state").select("id,data").eq("id", "main").maybeSingle();
  if (state.error) throw state.error;

  for (const collection of collections) store[collection] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const records = await supabase
      .from("app_records")
      .select("collection,id,data")
      .order("collection", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);
    if (records.error) throw records.error;
    for (const row of records.data || []) {
      if (collections.includes(row.collection)) store[row.collection].push(row.data);
    }
    if (!records.data || records.data.length < pageSize) break;
  }

  if (state.data?.data) {
    store.meta = state.data.data.meta || store.meta;
    store.counters = state.data.data.counters || store.counters;
  }

  if (!store.users.length) {
    const seeded = defaultStore();
    await writeSupabaseStore(seeded);
    return normalizeStore(seeded);
  }

  store.users = sortByUpdatedData(store.users.map((data) => ({ data })));
  return normalizeStore(store);
}

async function readLoginUsers() {
  if (!USE_SUPABASE) {
    await ensureStore();
    const store = normalizeStore(JSON.parse(await fs.readFile(STORE_FILE, "utf8")));
    return store.users;
  }

  const result = await supabase
    .from("app_records")
    .select("data")
    .eq("collection", "users");
  if (result.error) throw result.error;
  const users = (result.data || []).map((row) => row.data);
  for (const user of defaultUsers()) {
    if (!users.some((entry) => entry.username?.toLowerCase() === user.username)) {
      users.push(user);
    }
  }
  return users;
}

async function writeSupabaseStore(store) {
  const state = {
    id: "main",
    data: {
      meta: store.meta,
      counters: store.counters
    },
    updated_at: new Date().toISOString()
  };
  const stateResult = await supabase.from("app_state").upsert(state);
  if (stateResult.error) throw stateResult.error;

  for (const collection of collections) {
    const rows = (store[collection] || []).map((record) => ({
      collection,
      id: String(record.id),
      data: record,
      updated_at: new Date().toISOString()
    }));
    if (!rows.length) continue;
    const result = await supabase.from("app_records").upsert(rows, { onConflict: "collection,id" });
    if (result.error) throw result.error;
  }
}

async function readStore() {
  if (USE_SUPABASE) return readSupabaseStore();
  await ensureStore();
  return normalizeStore(JSON.parse(await fs.readFile(STORE_FILE, "utf8")));
}

async function writeStore(store) {
  normalizeStore(store);
  store.meta.updatedAt = new Date().toISOString();
  if (USE_SUPABASE) {
    await writeSupabaseStore(store);
    return;
  }
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

function cleanUser(user) {
  const { password, ...safe } = user;
  safe.permissions = rolePermissions[user.role] || [];
  return safe;
}

function hasPermission(user, permission) {
  return Boolean(user && (rolePermissions[user.role] || []).includes(permission));
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

function sendCsv(res, filename, rows) {
  res.writeHead(200, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`
  });
  res.end(rows);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body");
  }
}

async function requireUser(req, res, store) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const session = sessions.get(token);
  if (!session) {
    sendError(res, 401, "Please sign in.");
    return null;
  }
  const user = store.users.find((entry) => entry.id === session.userId);
  if (!user) {
    sendError(res, 401, "Session user no longer exists.");
    return null;
  }
  return user;
}

function nextId(store, key, prefix) {
  store.counters[key] = Number(store.counters[key] || 1);
  const value = `${prefix}-${String(store.counters[key]).padStart(5, "0")}`;
  store.counters[key] += 1;
  return value;
}

function normalizeText(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function activeRows(rows = []) {
  return rows.filter((row) => !row.isDeleted && !row.deletedAt && row.status !== "Deleted");
}

function activeStore(store) {
  return {
    ...store,
    projects: activeRows(store.projects),
    budgetHeads: activeRows(store.budgetHeads),
    infrastructures: activeRows(store.infrastructures),
    items: activeRows(store.items),
    requisitions: activeRows(store.requisitions),
    receipts: activeRows(store.receipts),
    issues: activeRows(store.issues),
    stockEvents: activeRows(store.stockEvents),
    ledger: activeRows(store.ledger),
    auditEvents: store.auditEvents || []
  };
}

function softDelete(record, user) {
  record.isDeleted = true;
  record.deletedAt = new Date().toISOString();
  record.deletedBy = user.id;
  record.deletedByName = user.name;
  record.status = "Deleted";
}

function cloneForAudit(value) {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
}

function changedFields(before = {}, after = {}) {
  const changes = {};
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  for (const key of keys) {
    if (["updatedAt"].includes(key)) continue;
    const previous = before?.[key];
    const next = after?.[key];
    if (JSON.stringify(previous) !== JSON.stringify(next)) changes[key] = { before: previous ?? null, after: next ?? null };
  }
  return changes;
}

function requestAuditMeta(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return {
    ip: forwarded || req.socket?.remoteAddress || "",
    userAgent: String(req.headers["user-agent"] || "")
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function auditHash(event) {
  const { hash, ...payload } = event;
  return crypto.createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function verifyAuditChain(events = []) {
  const ordered = [...events].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  let previousHash = "";
  for (const event of ordered) {
    if ((event.previousHash || "") !== previousHash) return false;
    if (auditHash(event) !== event.hash) return false;
    previousHash = event.hash || "";
  }
  return true;
}

function appendAuditEvent(store, req, user, payload) {
  store.auditEvents ||= [];
  const previous = store.auditEvents[store.auditEvents.length - 1];
  const before = cloneForAudit(payload.before);
  const after = cloneForAudit(payload.after);
  const event = {
    id: nextId(store, "auditEvent", "AUD"),
    at: new Date().toISOString(),
    actorId: user?.id || "",
    actorName: user?.name || payload.actorName || "Unknown",
    actorRole: user?.role || payload.actorRole || "anonymous",
    eventType: payload.eventType,
    entityType: payload.entityType || "",
    entityId: payload.entityId || "",
    entityLabel: payload.entityLabel || "",
    before,
    after,
    changes: payload.changes || changedFields(before, after),
    reason: payload.reason || "",
    remarks: payload.remarks || "",
    documentNo: payload.documentNo || "",
    linkedLedgerIds: payload.linkedLedgerIds || [],
    linkedRequisitionId: payload.linkedRequisitionId || "",
    linkedReceiptId: payload.linkedReceiptId || "",
    linkedIssueId: payload.linkedIssueId || "",
    ip: requestAuditMeta(req).ip,
    userAgent: requestAuditMeta(req).userAgent,
    previousHash: previous?.hash || ""
  };
  event.hash = auditHash(event);
  store.auditEvents.push(event);
  return event;
}

function appendNewItemAudits(store, req, user, beforeItemIds) {
  for (const item of store.items.filter((entry) => !beforeItemIds.has(entry.id))) {
    appendAuditEvent(store, req, user, {
      eventType: "CREATE",
      entityType: "item",
      entityId: item.id,
      entityLabel: item.name,
      after: item,
      remarks: "Created from item line entry"
    });
  }
}

function adminOnly(user) {
  return hasPermission(user, "admin:crud");
}

function canRead(user, permission) {
  return hasPermission(user, permission);
}

function requireReadPermission(user, res, permission, label) {
  if (canRead(user, permission)) return true;
  sendError(res, 403, `Your role cannot view ${label}.`);
  return false;
}

function visibleRequisitionsForUser(store, user) {
  const rows = activeRows(store.requisitions);
  if (user.role === "requester") return rows.filter((row) => row.createdBy === user.id);
  return rows;
}

function findItemById(store, itemId) {
  const item = store.items.find((entry) => entry.id === itemId && !entry.isDeleted && !entry.deletedAt);
  if (!item) throw new Error("Item not found.");
  return item;
}

function findOrCreateItem(store, line) {
  if (line.itemId) {
    const byId = store.items.find((entry) => entry.id === line.itemId && !entry.isDeleted && !entry.deletedAt);
    if (byId) return byId;
  }
  const name = normalizeText(line.itemName || line.name);
  if (!name) throw new Error("Item name is required.");
  const unit = normalizeText(line.unit);
  const category = normalizeText(line.category || "General");
  const key = name.toLowerCase();
  let item = store.items.find((entry) => !entry.isDeleted && !entry.deletedAt && entry.name.toLowerCase() === key && (!unit || entry.unit === unit));
  if (!item) item = store.items.find((entry) => !entry.isDeleted && !entry.deletedAt && entry.name.toLowerCase() === key);
  if (!item) {
    item = {
      id: `i-${crypto.randomUUID().slice(0, 8)}`,
      name,
      category,
      unit: unit || "Nos"
    };
    store.items.push(item);
  }
  return item;
}

function qtyNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) throw new Error("Quantity must be greater than zero.");
  return num;
}

function inventorySummary(store) {
  const stock = new Map();
  const incomingTypes = new Set(["RECEIPT", "TRANSFER_IN", "RETURNED_FROM_REPAIR", "ADJUSTMENT"]);
  const outgoingTypes = new Set(["ISSUE", "TRANSFER_OUT", "DISPOSED", "SPOILED"]);
  for (const movement of activeRows(store.ledger)) {
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

function availableQty(store, itemId, infrastructureId = "") {
  return inventorySummary(store)
    .filter((entry) => entry.itemId === itemId && (entry.infrastructureId || "") === (infrastructureId || ""))
    .reduce((sum, entry) => sum + Number(entry.balance || 0), 0);
}

function receivedQtyForRequisition(store, requisitionId, itemId) {
  return store.receipts
    .filter((receipt) => receipt.requisitionId === requisitionId)
    .reduce((sum, receipt) => sum + (receipt.lines || [])
      .filter((line) => line.itemId === itemId)
      .reduce((lineSum, line) => lineSum + Number(line.quantity || 0), 0), 0);
}

function dashboard(store) {
  const inventory = inventorySummary(store);
  return {
    requisitions: {
      total: store.requisitions.length,
      pendingFirstApproval: store.requisitions.filter((r) => r.status === "SUBMITTED").length,
      pendingFinalApproval: store.requisitions.filter((r) => r.status === "STORE_VERIFIED").length,
      approved: store.requisitions.filter((r) => ["APPROVED", "ORDERED"].includes(r.status)).length
    },
    inventory: {
      itemCount: inventory.length,
      lowStock: inventory.filter((entry) => entry.balance <= 0).length,
      totalReceivedLines: store.receipts.reduce((sum, receipt) => sum + receipt.lines.length, 0),
      totalIssuedLines: store.issues.reduce((sum, issue) => sum + issue.lines.length, 0)
    },
    documents: {
      receiptsWithChallan: store.receipts.filter((r) => r.challanNo).length,
      receiptsWithDv: store.receipts.filter((r) => r.dvNo).length,
      receiptsWithBill: store.receipts.filter((r) => r.billNo).length
    }
  };
}

function deletedAuditCounts(store) {
  const collectionsToCount = ["budgetHeads", "infrastructures", "items", "requisitions", "receipts", "issues", "stockEvents"];
  return collectionsToCount.reduce((result, collection) => {
    result[collection] = (store[collection] || []).filter((row) => row.isDeleted || row.deletedAt).length;
    return result;
  }, {});
}

function auditSummary(store) {
  const inventory = inventorySummary(activeStore(store));
  const auditEvents = store.auditEvents || [];
  const receipts = activeRows(store.receipts);
  const requisitions = activeRows(store.requisitions);
  const stockEvents = activeRows(store.stockEvents);
  const deleted = deletedAuditCounts(store);
  return {
    totalAuditEvents: auditEvents.length,
    hashChainValid: verifyAuditChain(auditEvents),
    lastAuditAt: auditEvents[auditEvents.length - 1]?.at || "",
    eventTypes: auditEvents.reduce((result, event) => {
      result[event.eventType] = (result[event.eventType] || 0) + 1;
      return result;
    }, {}),
    exceptions: {
      missingChallan: receipts.filter((receipt) => !receipt.challanNo).length,
      missingDv: receipts.filter((receipt) => !receipt.dvNo).length,
      missingBill: receipts.filter((receipt) => !receipt.billNo).length,
      negativeStock: inventory.filter((row) => Number(row.balance || 0) < 0).length,
      zeroStock: inventory.filter((row) => Number(row.balance || 0) === 0).length,
      rejectedRequests: requisitions.filter((row) => row.status === "REJECTED").length,
      underRepair: stockEvents.filter((event) => event.type === "REPAIR_NOTE").length,
      disposedOrSpoiled: stockEvents.filter((event) => ["DISPOSED", "SPOILED"].includes(event.type)).length,
      deletedTotal: Object.values(deleted).reduce((sum, value) => sum + value, 0)
    },
    deleted
  };
}

function lifecycleStatusForMovement(type, infrastructureId = "") {
  if (type === "RECEIPT") return infrastructureId ? "Received To Infrastructure" : "In Store";
  if (type === "ISSUE") return "Issued";
  if (type === "TRANSFER_OUT") return "Transferred Out";
  if (type === "TRANSFER_IN") return "Transferred";
  if (type === "DISPOSED") return "Disposed";
  if (type === "SPOILED") return "Spoiled";
  if (type === "REPAIR_NOTE") return "Under Repair";
  if (type === "RETURNED_FROM_REPAIR") return "Returned";
  if (type === "ADJUSTMENT") return "Adjusted";
  return type || "";
}

function addLedgerMovement(store, movement) {
  const row = {
    id: nextId(store, "movement", "MOV"),
    date: movement.date || new Date().toISOString().slice(0, 10),
    type: movement.type,
    itemId: movement.item.id,
    itemName: movement.item.name,
    category: movement.item.category,
    quantity: movement.quantity,
    unit: movement.unit || movement.item.unit,
    projectId: movement.projectId || "",
    budgetHeadId: movement.budgetHeadId || "",
    infrastructureId: movement.infrastructureId || "",
    fromInfrastructureId: movement.fromInfrastructureId || "",
    toInfrastructureId: movement.toInfrastructureId || "",
    dutyPerson: movement.dutyPerson || "",
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    documentNo: movement.documentNo || "",
    remarks: movement.remarks || "",
    lifecycleStatus: movement.lifecycleStatus || lifecycleStatusForMovement(movement.type, movement.infrastructureId || ""),
    createdBy: movement.createdBy || "",
    createdByName: movement.createdByName || ""
  };
  store.ledger.push(row);
  return row;
}

function applyBasicPatch(record, body, fields) {
  for (const field of fields) {
    if (Object.hasOwn(body, field)) {
      record[field] = typeof record[field] === "number" ? Number(body[field] || 0) : normalizeText(body[field]);
    }
  }
  record.updatedAt = new Date().toISOString();
}

function findRecord(rows, id, label) {
  const record = rows.find((entry) => entry.id === id);
  if (!record) throw new Error(`${label} not found.`);
  return record;
}

function sendThrown(res, error) {
  sendError(res, error.message?.includes("not found") ? 404 : 400, error.message || "Request failed.");
}

function parseResourcePath(pathname, resource) {
  const match = pathname.match(new RegExp(`^/api/${resource}/([^/]+)$`));
  return match?.[1] || "";
}

async function routeApi(req, res, pathname) {
  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const username = normalizeText(body.username).toLowerCase();
    const password = normalizeText(body.password);
    const users = await readLoginUsers();
    const user = users.find((entry) => String(entry.username || "").toLowerCase() === username && String(entry.password || "") === password);
    const auditStore = await readStore();
    if (!user) {
      appendAuditEvent(auditStore, req, null, {
        eventType: "LOGIN_FAILED",
        entityType: "auth",
        entityId: username || "unknown",
        entityLabel: username || "Unknown login",
        after: { username },
        reason: "Invalid username or password"
      });
      await writeStore(auditStore);
      return sendError(res, 401, "Invalid username or password.");
    }
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, { userId: user.id, createdAt: Date.now() });
    appendAuditEvent(auditStore, req, user, {
      eventType: "LOGIN_SUCCESS",
      entityType: "auth",
      entityId: user.id,
      entityLabel: user.username,
      after: { username: user.username, role: user.role }
    });
    await writeStore(auditStore);
    return sendJson(res, 200, { token, user: cleanUser(user) });
  }

  const store = await readStore();
  const user = await requireUser(req, res, store);
  if (!user) return;
  const visible = activeStore(store);
  const userVisible = { ...visible, requisitions: visibleRequisitionsForUser(store, user) };

  if (req.method === "GET" && pathname === "/api/me") return sendJson(res, 200, cleanUser(user));
  if (req.method === "GET" && pathname === "/api/dashboard") {
    if (!requireReadPermission(user, res, "dashboard:read", "dashboard")) return;
    return sendJson(res, 200, dashboard(visible));
  }
  if (req.method === "GET" && pathname === "/api/projects") {
    if (!requireReadPermission(user, res, "project:read", "projects")) return;
    return sendJson(res, 200, visible.projects);
  }
  if (req.method === "GET" && pathname === "/api/budget-heads") {
    if (!requireReadPermission(user, res, "budget:read", "budget heads")) return;
    return sendJson(res, 200, visible.budgetHeads);
  }
  if (req.method === "GET" && pathname === "/api/infrastructures") {
    if (!requireReadPermission(user, res, "infrastructure:read", "key infrastructures")) return;
    return sendJson(res, 200, visible.infrastructures);
  }
  if (req.method === "GET" && pathname === "/api/items") {
    if (!requireReadPermission(user, res, "item:read", "items")) return;
    return sendJson(res, 200, visible.items.sort((a, b) => a.name.localeCompare(b.name)));
  }
  if (req.method === "GET" && pathname === "/api/requisitions") {
    if (!requireReadPermission(user, res, "requisition:read", "requisitions")) return;
    return sendJson(res, 200, userVisible.requisitions.slice().reverse());
  }
  if (req.method === "GET" && pathname === "/api/receipts") {
    if (!requireReadPermission(user, res, "receipt:read", "receipts")) return;
    return sendJson(res, 200, visible.receipts.slice().reverse());
  }
  if (req.method === "GET" && pathname === "/api/issues") {
    if (!requireReadPermission(user, res, "issue:read", "issues")) return;
    return sendJson(res, 200, visible.issues.slice().reverse());
  }
  if (req.method === "GET" && pathname === "/api/stock-events") {
    if (!requireReadPermission(user, res, "stock:event:read", "stock events")) return;
    return sendJson(res, 200, visible.stockEvents.slice().reverse());
  }
  if (req.method === "GET" && pathname === "/api/inventory") {
    if (!requireReadPermission(user, res, "inventory:read", "inventory")) return;
    return sendJson(res, 200, inventorySummary(visible));
  }
  if (req.method === "GET" && pathname === "/api/ledger") {
    if (!requireReadPermission(user, res, "ledger:read", "ledger")) return;
    return sendJson(res, 200, visible.ledger.slice().reverse());
  }
  if (req.method === "GET" && pathname === "/api/reports") {
    if (!requireReadPermission(user, res, "report:read", "reports")) return;
    return sendJson(res, 200, {
      dashboard: dashboard(visible),
      projects: visible.projects,
      expenses: store.expenses.slice(0, 500),
      recentLedger: visible.ledger.slice(-200).reverse(),
      deleted: {
        budgetHeads: store.budgetHeads.filter((row) => row.isDeleted || row.deletedAt),
        infrastructures: store.infrastructures.filter((row) => row.isDeleted || row.deletedAt),
        items: store.items.filter((row) => row.isDeleted || row.deletedAt),
        requisitions: store.requisitions.filter((row) => row.isDeleted || row.deletedAt),
        receipts: store.receipts.filter((row) => row.isDeleted || row.deletedAt),
        issues: store.issues.filter((row) => row.isDeleted || row.deletedAt),
        stockEvents: store.stockEvents.filter((row) => row.isDeleted || row.deletedAt)
      }
    });
  }
  if (req.method === "GET" && pathname === "/api/audit-summary") {
    if (!requireReadPermission(user, res, "audit:read", "audit summary")) return;
    return sendJson(res, 200, auditSummary(store));
  }
  if (req.method === "GET" && pathname === "/api/audit-events/export.csv") {
    if (!requireReadPermission(user, res, "audit:read", "audit events")) return;
    const headers = ["id", "at", "actorName", "actorRole", "eventType", "entityType", "entityLabel", "reason", "documentNo", "hash", "previousHash"];
    const csv = [
      headers.map(csvCell).join(","),
      ...(store.auditEvents || []).slice().reverse().map((event) => headers.map((key) => csvCell(event[key])).join(","))
    ].join("\n");
    return sendCsv(res, "audit-events.csv", csv);
  }
  if (req.method === "GET" && pathname === "/api/audit-events") {
    if (!requireReadPermission(user, res, "audit:read", "audit events")) return;
    return sendJson(res, 200, (store.auditEvents || []).slice().reverse());
  }

  if (req.method === "POST" && pathname === "/api/projects") {
    if (!hasPermission(user, "project:create")) return sendError(res, 403, "Only the final approver can add projects.");
    const body = await readBody(req);
    const name = normalizeText(body.name);
    if (!name) return sendError(res, 400, "Project name is required.");
    const project = {
      id: nextId(store, "project", "PROJ"),
      name,
      budget: Number(body.budget || 0),
      status: normalizeText(body.status || "Active"),
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString()
    };
    store.projects.push(project);
    appendAuditEvent(store, req, user, {
      eventType: "CREATE",
      entityType: "project",
      entityId: project.id,
      entityLabel: project.name,
      after: project
    });
    await writeStore(store);
    return sendJson(res, 201, project);
  }

  if (req.method === "POST" && pathname === "/api/budget-heads") {
    if (!hasPermission(user, "budget:create")) return sendError(res, 403, "Only the final approver can add budget heads.");
    const body = await readBody(req);
    const name = normalizeText(body.name);
    if (!name) return sendError(res, 400, "Budget head name is required.");
    const budgetHead = {
      id: nextId(store, "budgetHead", "BH"),
      projectId: normalizeText(body.projectId),
      name,
      amount: Number(body.amount || 0),
      status: normalizeText(body.status || "Active"),
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString()
    };
    store.budgetHeads.push(budgetHead);
    appendAuditEvent(store, req, user, {
      eventType: "CREATE",
      entityType: "budgetHead",
      entityId: budgetHead.id,
      entityLabel: budgetHead.name,
      after: budgetHead
    });
    await writeStore(store);
    return sendJson(res, 201, budgetHead);
  }

  if (req.method === "POST" && pathname === "/api/infrastructures") {
    if (!hasPermission(user, "infrastructure:create")) return sendError(res, 403, "Only the final approver can add infrastructure.");
    const body = await readBody(req);
    const name = normalizeText(body.name);
    const budgetHeadId = normalizeText(body.budgetHeadId);
    if (!name) return sendError(res, 400, "Infrastructure name is required.");
    if (!budgetHeadId) return sendError(res, 400, "Budget head is required.");
    const budgetHead = store.budgetHeads.find((entry) => entry.id === budgetHeadId);
    const infrastructure = {
      id: nextId(store, "infrastructure", "INFRA"),
      projectId: normalizeText(body.projectId || budgetHead?.projectId),
      budgetHeadId,
      name,
      amount: Number(body.amount || 0),
      status: normalizeText(body.status || "Active"),
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString()
    };
    store.infrastructures.push(infrastructure);
    appendAuditEvent(store, req, user, {
      eventType: "CREATE",
      entityType: "infrastructure",
      entityId: infrastructure.id,
      entityLabel: infrastructure.name,
      after: infrastructure
    });
    await writeStore(store);
    return sendJson(res, 201, infrastructure);
  }

  const budgetHeadIdForEdit = parseResourcePath(pathname, "budget-heads");
  if (budgetHeadIdForEdit && ["PATCH", "DELETE"].includes(req.method)) {
    if (!adminOnly(user)) return sendError(res, 403, "Only admin can edit or delete budget heads.");
    try {
      const record = findRecord(store.budgetHeads, budgetHeadIdForEdit, "Budget head");
      const before = cloneForAudit(record);
      if (req.method === "DELETE") {
        softDelete(record, user);
      } else {
        applyBasicPatch(record, await readBody(req), ["projectId", "name", "amount", "status"]);
      }
      appendAuditEvent(store, req, user, {
        eventType: req.method === "DELETE" ? "SOFT_DELETE" : "UPDATE",
        entityType: "budgetHead",
        entityId: record.id,
        entityLabel: record.name,
        before,
        after: record
      });
      await writeStore(store);
      return sendJson(res, 200, record);
    } catch (error) {
      return sendThrown(res, error);
    }
  }

  const infrastructureIdForEdit = parseResourcePath(pathname, "infrastructures");
  if (infrastructureIdForEdit && ["PATCH", "DELETE"].includes(req.method)) {
    if (!adminOnly(user)) return sendError(res, 403, "Only admin can edit or delete infrastructures.");
    try {
      const record = findRecord(store.infrastructures, infrastructureIdForEdit, "Infrastructure");
      const before = cloneForAudit(record);
      if (req.method === "DELETE") {
        softDelete(record, user);
      } else {
        applyBasicPatch(record, await readBody(req), ["projectId", "budgetHeadId", "name", "amount", "status"]);
      }
      appendAuditEvent(store, req, user, {
        eventType: req.method === "DELETE" ? "SOFT_DELETE" : "UPDATE",
        entityType: "infrastructure",
        entityId: record.id,
        entityLabel: record.name,
        before,
        after: record
      });
      await writeStore(store);
      return sendJson(res, 200, record);
    } catch (error) {
      return sendThrown(res, error);
    }
  }

  const itemIdForEdit = parseResourcePath(pathname, "items");
  if (itemIdForEdit && ["PATCH", "DELETE"].includes(req.method)) {
    if (!adminOnly(user)) return sendError(res, 403, "Only admin can edit or delete items.");
    try {
      const record = findRecord(store.items, itemIdForEdit, "Item");
      const before = cloneForAudit(record);
      if (req.method === "DELETE") {
        softDelete(record, user);
      } else {
        applyBasicPatch(record, await readBody(req), ["name", "category", "unit"]);
      }
      appendAuditEvent(store, req, user, {
        eventType: req.method === "DELETE" ? "SOFT_DELETE" : "UPDATE",
        entityType: "item",
        entityId: record.id,
        entityLabel: record.name,
        before,
        after: record
      });
      await writeStore(store);
      return sendJson(res, 200, record);
    } catch (error) {
      return sendThrown(res, error);
    }
  }

  if (req.method === "POST" && pathname === "/api/requisitions") {
    if (!hasPermission(user, "requisition:create")) return sendError(res, 403, "Only the requisition user can create requests.");
    const body = await readBody(req);
    const lines = (body.lines || []).filter((line) => normalizeText(line.itemName || line.name));
    if (!lines.length) return sendError(res, 400, "Add at least one item.");
    const beforeItemIds = new Set(store.items.map((item) => item.id));
    const reqLines = lines.map((line) => {
      const item = findOrCreateItem(store, line);
      return {
        id: `rl-${crypto.randomUUID().slice(0, 8)}`,
        itemId: item.id,
        itemName: item.name,
        category: normalizeText(line.category || line.specification),
        specification: normalizeText(line.category || line.specification),
        quantity: qtyNumber(line.quantity),
        unit: normalizeText(line.unit || item.unit),
        issuedTillDate: Number(line.issuedTillDate || 0),
        balance: Number(line.balance || 0),
        remarks: normalizeText(line.remarks)
      };
    });
    const requisition = {
      id: nextId(store, "requisition", "REQ"),
      requisitionNo: body.requisitionNo ? normalizeText(body.requisitionNo) : `YRJ-${new Date().getFullYear()}-${String(store.counters.requisition - 1).padStart(4, "0")}`,
      requestDate: body.requestDate || new Date().toISOString().slice(0, 10),
      receivedDate: body.receivedDate || "",
      projectId: normalizeText(body.projectId),
      budgetHeadId: normalizeText(body.budgetHeadId),
      infrastructureId: normalizeText(body.infrastructureId),
      purpose: normalizeText(body.purpose),
      status: "SUBMITTED",
      createdBy: user.id,
      createdByName: user.name,
      createdAt: new Date().toISOString(),
      approvals: [],
      lines: reqLines
    };
    store.requisitions.push(requisition);
    appendNewItemAudits(store, req, user, beforeItemIds);
    appendAuditEvent(store, req, user, {
      eventType: "CREATE",
      entityType: "requisition",
      entityId: requisition.id,
      entityLabel: requisition.requisitionNo,
      after: requisition,
      linkedRequisitionId: requisition.id
    });
    await writeStore(store);
    return sendJson(res, 201, requisition);
  }

  const requisitionIdForEdit = parseResourcePath(pathname, "requisitions");
  if (requisitionIdForEdit && ["PATCH", "DELETE"].includes(req.method)) {
    if (!adminOnly(user)) return sendError(res, 403, "Only admin can edit or delete requisitions.");
    try {
      const record = findRecord(store.requisitions, requisitionIdForEdit, "Requisition");
      const before = cloneForAudit(record);
      if (req.method === "DELETE") {
        softDelete(record, user);
      } else {
        const body = await readBody(req);
        applyBasicPatch(record, body, ["requisitionNo", "requestDate", "receivedDate", "projectId", "budgetHeadId", "infrastructureId", "purpose", "status", "supplyOrderNo"]);
        if (Array.isArray(body.lines)) record.lines = body.lines;
      }
      appendAuditEvent(store, req, user, {
        eventType: req.method === "DELETE" ? "SOFT_DELETE" : "UPDATE",
        entityType: "requisition",
        entityId: record.id,
        entityLabel: record.requisitionNo,
        before,
        after: record,
        linkedRequisitionId: record.id
      });
      await writeStore(store);
      return sendJson(res, 200, record);
    } catch (error) {
      return sendThrown(res, error);
    }
  }

  const statusMatch = pathname.match(/^\/api\/requisitions\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const requisition = store.requisitions.find((entry) => entry.id === statusMatch[1]);
    if (!requisition) return sendError(res, 404, "Requisition not found.");
    const body = await readBody(req);
    const action = body.action;
    const now = new Date().toISOString();
    const before = cloneForAudit(requisition);
    if (action === "verify") {
      if (!hasPermission(user, "requisition:first_approve")) return sendError(res, 403, "Only store/PMU can verify.");
      if (requisition.status !== "SUBMITTED") return sendError(res, 400, "Only submitted requisitions can be verified.");
      requisition.status = "STORE_VERIFIED";
    } else if (action === "final_approve") {
      if (!hasPermission(user, "requisition:final_approve")) return sendError(res, 403, "Only the final approver can approve.");
      if (requisition.status !== "STORE_VERIFIED") return sendError(res, 400, "Final approval requires store verification first.");
      requisition.status = "APPROVED";
    } else if (action === "order") {
      if (!hasPermission(user, "requisition:order")) return sendError(res, 403, "Only store/PMU can mark order placed.");
      if (requisition.status !== "APPROVED") return sendError(res, 400, "Only final approved requisitions can be ordered.");
      requisition.status = "ORDERED";
      requisition.supplyOrderNo = normalizeText(body.supplyOrderNo);
      requisition.orderedAt = now;
    } else if (action === "reject") {
      if (!hasPermission(user, "requisition:first_approve") && !hasPermission(user, "requisition:final_approve")) {
        return sendError(res, 403, "Only approvers can reject.");
      }
      if (!normalizeText(body.note)) return sendError(res, 400, "Rejection reason is required.");
      requisition.status = "REJECTED";
      requisition.rejectionReason = normalizeText(body.note);
      requisition.rejectedAt = now;
      requisition.rejectedByName = user.name;
    } else if (action === "close") {
      if (!hasPermission(user, "requisition:order")) return sendError(res, 403, "Only store/PMU can close.");
      requisition.status = "CLOSED";
    } else {
      return sendError(res, 400, "Unknown status action.");
    }
    requisition.approvals.push({
      action,
      by: user.id,
      byName: user.name,
      role: user.role,
      note: normalizeText(body.note),
      at: now
    });
    appendAuditEvent(store, req, user, {
      eventType: "STATUS_CHANGE",
      entityType: "requisition",
      entityId: requisition.id,
      entityLabel: requisition.requisitionNo,
      before,
      after: requisition,
      reason: normalizeText(body.note),
      documentNo: requisition.supplyOrderNo || "",
      linkedRequisitionId: requisition.id
    });
    await writeStore(store);
    return sendJson(res, 200, requisition);
  }

  if (req.method === "POST" && pathname === "/api/stock-events") {
    if (!hasPermission(user, "stock:event")) return sendError(res, 403, "Only store/admin can record stock events.");
    try {
      const body = await readBody(req);
      const type = normalizeText(body.type).toUpperCase();
      const allowed = new Set(["TRANSFER", "DISPOSED", "SPOILED", "REPAIR_NOTE", "RETURNED_FROM_REPAIR"]);
      if (!allowed.has(type)) return sendError(res, 400, "Unknown stock event type.");
      const item = findItemById(store, normalizeText(body.itemId));
      const quantity = type === "REPAIR_NOTE" ? Number(body.quantity || 0) : qtyNumber(body.quantity);
      const fromInfrastructureId = normalizeText(body.fromInfrastructureId);
      const toInfrastructureId = normalizeText(body.toInfrastructureId);
      if (type === "TRANSFER" && fromInfrastructureId === toInfrastructureId) return sendError(res, 400, "Transfer source and destination must be different.");
      if (type === "TRANSFER" && !toInfrastructureId) return sendError(res, 400, "Transfer destination infrastructure is required.");
      if (["TRANSFER", "DISPOSED", "SPOILED"].includes(type) && availableQty(store, item.id, fromInfrastructureId) < quantity) {
        return sendError(res, 400, `Insufficient stock for ${item.name}. Available: ${availableQty(store, item.id, fromInfrastructureId)} ${item.unit}`);
      }
      const event = {
        id: nextId(store, "stockEvent", "SE"),
        type,
        date: body.date || new Date().toISOString().slice(0, 10),
        itemId: item.id,
        itemName: item.name,
        category: item.category || "",
        quantity,
        unit: normalizeText(body.unit || item.unit),
        fromInfrastructureId,
        toInfrastructureId,
        dutyPerson: normalizeText(body.dutyPerson),
        documentNo: normalizeText(body.documentNo),
        remarks: normalizeText(body.remarks),
        createdBy: user.id,
        createdByName: user.name,
        createdAt: new Date().toISOString()
      };
      store.stockEvents.push(event);
      const linkedLedgerIds = [];

      if (type === "TRANSFER") {
        const transferNo = nextId(store, "transfer", "TR");
        linkedLedgerIds.push(addLedgerMovement(store, {
          type: "TRANSFER_OUT",
          date: event.date,
          item,
          quantity,
          unit: event.unit,
          infrastructureId: fromInfrastructureId,
          fromInfrastructureId,
          toInfrastructureId,
          referenceType: "stockEvent",
          referenceId: event.id,
          documentNo: event.documentNo || transferNo,
          dutyPerson: event.dutyPerson,
          remarks: event.remarks,
          createdBy: user.id,
          createdByName: user.name
        }).id);
        linkedLedgerIds.push(addLedgerMovement(store, {
          type: "TRANSFER_IN",
          date: event.date,
          item,
          quantity,
          unit: event.unit,
          infrastructureId: toInfrastructureId,
          fromInfrastructureId,
          toInfrastructureId,
          referenceType: "stockEvent",
          referenceId: event.id,
          documentNo: event.documentNo || transferNo,
          dutyPerson: event.dutyPerson,
          remarks: event.remarks,
          createdBy: user.id,
          createdByName: user.name
        }).id);
      } else if (["DISPOSED", "SPOILED", "REPAIR_NOTE", "RETURNED_FROM_REPAIR"].includes(type)) {
        linkedLedgerIds.push(addLedgerMovement(store, {
          type,
          date: event.date,
          item,
          quantity,
          unit: event.unit,
          infrastructureId: type === "RETURNED_FROM_REPAIR" ? toInfrastructureId : fromInfrastructureId,
          fromInfrastructureId,
          toInfrastructureId,
          referenceType: "stockEvent",
          referenceId: event.id,
          documentNo: event.documentNo,
          dutyPerson: event.dutyPerson,
          remarks: event.remarks,
          createdBy: user.id,
          createdByName: user.name
        }).id);
      }
      appendAuditEvent(store, req, user, {
        eventType: "STOCK_MOVEMENT",
        entityType: "stockEvent",
        entityId: event.id,
        entityLabel: `${type} ${item.name}`,
        after: event,
        remarks: event.remarks,
        documentNo: event.documentNo,
        linkedLedgerIds
      });
      await writeStore(store);
      return sendJson(res, 201, event);
    } catch (error) {
      return sendThrown(res, error);
    }
  }

  const stockEventIdForEdit = parseResourcePath(pathname, "stock-events");
  if (stockEventIdForEdit && ["PATCH", "DELETE"].includes(req.method)) {
    if (!adminOnly(user)) return sendError(res, 403, "Only admin can edit or delete stock events.");
    try {
      const record = findRecord(store.stockEvents, stockEventIdForEdit, "Stock event");
      const before = cloneForAudit(record);
      if (req.method === "DELETE") {
        softDelete(record, user);
        for (const movement of store.ledger.filter((entry) => entry.referenceType === "stockEvent" && entry.referenceId === record.id)) softDelete(movement, user);
      } else {
        applyBasicPatch(record, await readBody(req), ["date", "dutyPerson", "documentNo", "remarks"]);
      }
      appendAuditEvent(store, req, user, {
        eventType: req.method === "DELETE" ? "SOFT_DELETE" : "UPDATE",
        entityType: "stockEvent",
        entityId: record.id,
        entityLabel: `${record.type} ${record.itemName}`,
        before,
        after: record,
        remarks: record.remarks,
        documentNo: record.documentNo,
        linkedLedgerIds: store.ledger.filter((entry) => entry.referenceType === "stockEvent" && entry.referenceId === record.id).map((entry) => entry.id)
      });
      await writeStore(store);
      return sendJson(res, 200, record);
    } catch (error) {
      return sendThrown(res, error);
    }
  }

  if (req.method === "POST" && pathname === "/api/receipts") {
    if (!hasPermission(user, "receipt:create")) return sendError(res, 403, "Only store/PMU can receive stock.");
    const body = await readBody(req);
    const lines = (body.lines || []).filter((line) => normalizeText(line.itemName || line.name));
    if (!lines.length) return sendError(res, 400, "Add at least one received item.");
    const beforeItemIds = new Set(store.items.map((item) => item.id));
    const requisition = body.requisitionId ? store.requisitions.find((entry) => entry.id === body.requisitionId) : null;
    if (body.requisitionId && !requisition) return sendError(res, 404, "Linked requisition not found.");
    if (requisition && !["APPROVED", "ORDERED", "PARTIALLY_RECEIVED"].includes(requisition.status)) {
      return sendError(res, 400, "Stock can be received only after approval/order placement.");
    }
    const receipt = {
      id: nextId(store, "receipt", "REC"),
      date: body.date || new Date().toISOString().slice(0, 10),
      requisitionId: body.requisitionId || "",
      projectId: normalizeText(body.projectId || requisition?.projectId),
      budgetHeadId: normalizeText(body.budgetHeadId || requisition?.budgetHeadId),
      infrastructureId: normalizeText(body.infrastructureId || requisition?.infrastructureId),
      supplier: normalizeText(body.supplier),
      challanNo: normalizeText(body.challanNo),
      challanDate: body.challanDate || "",
      dvNo: normalizeText(body.dvNo),
      dvDate: body.dvDate || "",
      billNo: normalizeText(body.billNo),
      billDate: body.billDate || "",
      dispatchNo: normalizeText(body.dispatchNo),
      receivedBy: user.id,
      receivedByName: user.name,
      remarks: normalizeText(body.remarks),
      lines: []
    };
    const linkedLedgerIds = [];
    for (const line of lines) {
      const item = findOrCreateItem(store, line);
      const quantity = qtyNumber(line.quantity);
      const unit = normalizeText(line.unit || item.unit);
      receipt.lines.push({
        itemId: item.id,
        itemName: item.name,
        category: normalizeText(line.category || line.specification),
        specification: normalizeText(line.category || line.specification),
        quantity,
        unit,
        rate: Number(line.rate || 0),
        amount: Number(line.amount || (Number(line.rate || 0) * quantity)),
        remarks: normalizeText(line.remarks)
      });
      linkedLedgerIds.push(addLedgerMovement(store, {
        type: "RECEIPT",
        date: receipt.date,
        item,
        quantity,
        unit,
        projectId: receipt.projectId,
        budgetHeadId: receipt.budgetHeadId,
        infrastructureId: receipt.infrastructureId,
        referenceType: "receipt",
        referenceId: receipt.id,
        documentNo: receipt.challanNo,
        remarks: receipt.remarks
      }).id);
    }
    store.receipts.push(receipt);
    appendNewItemAudits(store, req, user, beforeItemIds);
    if (requisition) {
      const allReceived = (requisition.lines || []).every((line) => {
        const ordered = Number(line.quantity || 0);
        return ordered > 0 && receivedQtyForRequisition(store, requisition.id, line.itemId) >= ordered;
      });
      requisition.status = allReceived ? "RECEIVED" : "PARTIALLY_RECEIVED";
      requisition.receipts = [...(requisition.receipts || []), receipt.id];
    }
    appendAuditEvent(store, req, user, {
      eventType: "STOCK_MOVEMENT",
      entityType: "receipt",
      entityId: receipt.id,
      entityLabel: receipt.challanNo || receipt.id,
      after: receipt,
      remarks: receipt.remarks,
      documentNo: receipt.challanNo,
      linkedLedgerIds,
      linkedRequisitionId: receipt.requisitionId,
      linkedReceiptId: receipt.id
    });
    await writeStore(store);
    return sendJson(res, 201, receipt);
  }

  const receiptIdForEdit = parseResourcePath(pathname, "receipts");
  if (receiptIdForEdit && ["PATCH", "DELETE"].includes(req.method)) {
    if (!adminOnly(user)) return sendError(res, 403, "Only admin can edit or delete receipts.");
    try {
      const record = findRecord(store.receipts, receiptIdForEdit, "Receipt");
      const before = cloneForAudit(record);
      if (req.method === "DELETE") {
        softDelete(record, user);
        for (const movement of store.ledger.filter((entry) => entry.referenceType === "receipt" && entry.referenceId === record.id)) softDelete(movement, user);
      } else {
        applyBasicPatch(record, await readBody(req), ["date", "supplier", "challanNo", "challanDate", "dvNo", "dvDate", "billNo", "billDate", "dispatchNo", "remarks", "budgetHeadId", "infrastructureId"]);
      }
      appendAuditEvent(store, req, user, {
        eventType: req.method === "DELETE" ? "SOFT_DELETE" : "UPDATE",
        entityType: "receipt",
        entityId: record.id,
        entityLabel: record.challanNo || record.id,
        before,
        after: record,
        remarks: record.remarks,
        documentNo: record.challanNo,
        linkedLedgerIds: store.ledger.filter((entry) => entry.referenceType === "receipt" && entry.referenceId === record.id).map((entry) => entry.id),
        linkedRequisitionId: record.requisitionId,
        linkedReceiptId: record.id
      });
      await writeStore(store);
      return sendJson(res, 200, record);
    } catch (error) {
      return sendThrown(res, error);
    }
  }

  if (req.method === "POST" && pathname === "/api/issues") {
    if (!hasPermission(user, "issue:create")) return sendError(res, 403, "Only store/PMU can issue stock.");
    const body = await readBody(req);
    const lines = (body.lines || []).filter((line) => normalizeText(line.itemName || line.name));
    if (!lines.length) return sendError(res, 400, "Add at least one issued item.");
    const beforeItemIds = new Set(store.items.map((item) => item.id));
    const issue = {
      id: nextId(store, "issue", "ISS"),
      date: body.date || new Date().toISOString().slice(0, 10),
      projectId: normalizeText(body.projectId),
      budgetHeadId: normalizeText(body.budgetHeadId),
      infrastructureId: normalizeText(body.infrastructureId),
      issueChallanNo: normalizeText(body.issueChallanNo),
      issuedTo: normalizeText(body.issuedTo),
      issuedBy: user.id,
      issuedByName: user.name,
      remarks: normalizeText(body.remarks),
      lines: []
    };
    const linkedLedgerIds = [];
    for (const line of lines) {
      const item = findOrCreateItem(store, line);
      const quantity = qtyNumber(line.quantity);
      if (availableQty(store, item.id) < quantity) {
        return sendError(res, 400, `Insufficient stock for ${item.name}. Available: ${availableQty(store, item.id)} ${item.unit}`);
      }
      const unit = normalizeText(item.unit || line.unit);
      const category = normalizeText(item.category || line.category || line.specification);
      issue.lines.push({
        itemId: item.id,
        itemName: item.name,
        category,
        specification: category,
        quantity,
        unit,
        remarks: normalizeText(line.remarks)
      });
      linkedLedgerIds.push(addLedgerMovement(store, {
        type: "ISSUE",
        date: issue.date,
        item,
        quantity,
        unit,
        projectId: issue.projectId,
        budgetHeadId: issue.budgetHeadId,
        infrastructureId: "",
        fromInfrastructureId: "",
        toInfrastructureId: issue.infrastructureId,
        referenceType: "issue",
        referenceId: issue.id,
        documentNo: issue.issueChallanNo,
        dutyPerson: issue.issuedTo,
        remarks: issue.remarks
      }).id);
      if (issue.infrastructureId) {
        linkedLedgerIds.push(addLedgerMovement(store, {
          type: "TRANSFER_IN",
          date: issue.date,
          item,
          quantity,
          unit,
          projectId: issue.projectId,
          budgetHeadId: issue.budgetHeadId,
          infrastructureId: issue.infrastructureId,
          fromInfrastructureId: "",
          toInfrastructureId: issue.infrastructureId,
          referenceType: "issue",
          referenceId: issue.id,
          documentNo: issue.issueChallanNo,
          dutyPerson: issue.issuedTo,
          remarks: issue.remarks
        }).id);
      }
    }
    store.issues.push(issue);
    appendNewItemAudits(store, req, user, beforeItemIds);
    appendAuditEvent(store, req, user, {
      eventType: "STOCK_MOVEMENT",
      entityType: "issue",
      entityId: issue.id,
      entityLabel: issue.issueChallanNo || issue.id,
      after: issue,
      remarks: issue.remarks,
      documentNo: issue.issueChallanNo,
      linkedLedgerIds,
      linkedIssueId: issue.id
    });
    await writeStore(store);
    return sendJson(res, 201, issue);
  }

  const issueIdForEdit = parseResourcePath(pathname, "issues");
  if (issueIdForEdit && ["PATCH", "DELETE"].includes(req.method)) {
    if (!adminOnly(user)) return sendError(res, 403, "Only admin can edit or delete issues.");
    try {
      const record = findRecord(store.issues, issueIdForEdit, "Issue");
      const before = cloneForAudit(record);
      if (req.method === "DELETE") {
        softDelete(record, user);
        for (const movement of store.ledger.filter((entry) => entry.referenceType === "issue" && entry.referenceId === record.id)) softDelete(movement, user);
      } else {
        applyBasicPatch(record, await readBody(req), ["date", "budgetHeadId", "infrastructureId", "issueChallanNo", "issuedTo", "remarks"]);
      }
      appendAuditEvent(store, req, user, {
        eventType: req.method === "DELETE" ? "SOFT_DELETE" : "UPDATE",
        entityType: "issue",
        entityId: record.id,
        entityLabel: record.issueChallanNo || record.id,
        before,
        after: record,
        remarks: record.remarks,
        documentNo: record.issueChallanNo,
        linkedLedgerIds: store.ledger.filter((entry) => entry.referenceType === "issue" && entry.referenceId === record.id).map((entry) => entry.id),
        linkedIssueId: record.id
      });
      await writeStore(store);
      return sendJson(res, 200, record);
    } catch (error) {
      return sendThrown(res, error);
    }
  }

  sendError(res, 404, "API route not found.");
}

async function routeHealth(req, res) {
  if (REQUIRE_SUPABASE && !USE_SUPABASE) {
    return sendJson(res, 503, {
      ok: false,
      storage: "missing-supabase",
      message: "Supabase credentials are required."
    });
  }

  if (USE_SUPABASE) {
    const result = await supabase.from("app_state").select("id").limit(1);
    if (result.error) {
      return sendJson(res, 503, {
        ok: false,
        storage: "supabase",
        message: supabaseSetupMessage(result.error)
      });
    }
  }

  sendJson(res, 200, {
    ok: true,
    storage: USE_SUPABASE ? "supabase" : "local-json",
    uptime: process.uptime()
  });
}

async function serveStatic(req, res, pathname) {
  const rootDir = await fs.access(DIST_DIR).then(() => DIST_DIR).catch(() => PUBLIC_DIR);
  let filePath = pathname === "/" ? path.join(rootDir, "index.html") : path.join(rootDir, pathname);
  if (!filePath.startsWith(rootDir)) return sendError(res, 403, "Forbidden");
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".css": "text/css",
      ".json": "application/json",
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".ico": "image/x-icon"
    };
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    try {
      const fallback = await fs.readFile(path.join(rootDir, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(fallback);
    } catch {
      sendError(res, 503, "Frontend build not found. Run npm run build before starting the server.");
    }
  }
}

await ensureStore();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/healthz") return await routeHealth(req, res);
    if (url.pathname.startsWith("/api/")) return await routeApi(req, res, url.pathname);
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, 500, error.message || "Server error");
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use.`);
    console.error("Run `npm run stop:server` first, or set a different PORT value.");
    process.exit(1);
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  console.log(`Yarju_OAP_inventory running at http://${PUBLIC_HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
});
