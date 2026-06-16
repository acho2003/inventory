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
const collections = ["users", "projects", "budgetHeads", "infrastructures", "items", "requisitions", "receipts", "issues", "ledger", "expenses"];

const sessions = new Map();

if (REQUIRE_SUPABASE && !USE_SUPABASE) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required when REQUIRE_SUPABASE=true.");
}

const rolePermissions = {
  requester: ["requisition:create", "requisition:read"],
  store: [
    "requisition:read",
    "requisition:first_approve",
    "requisition:order",
    "receipt:create",
    "issue:create",
    "inventory:read",
    "report:read"
  ],
  approver: [
    "requisition:read",
    "requisition:final_approve",
    "inventory:read",
    "report:read",
    "project:create",
    "budget:create",
    "infrastructure:create"
  ]
};

const defaultStore = () => ({
  meta: {
    name: "Inventory System",
    createdAt: new Date().toISOString(),
    source: "Manual Yarju OAP records"
  },
  users: [
    { id: "u-requester", username: "requester", password: "request123", name: "Requisition User", role: "requester" },
    { id: "u-store", username: "store", password: "store123", name: "Store / PMU Officer", role: "store" },
    { id: "u-approver", username: "approver", password: "approve123", name: "Final Approver", role: "approver" }
  ],
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
  counters: { requisition: 1, receipt: 1, issue: 1, movement: 1, project: 1, budgetHead: 1, infrastructure: 1 }
});

function normalizeStore(store) {
  store.projects ||= [];
  store.budgetHeads ||= [];
  store.infrastructures ||= [];
  store.items ||= [];
  store.requisitions ||= [];
  store.receipts ||= [];
  store.issues ||= [];
  store.ledger ||= [];
  store.expenses ||= [];
  store.counters ||= {};
  for (const key of ["requisition", "receipt", "issue", "movement", "project", "budgetHead", "infrastructure"]) {
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
  const records = await supabase.from("app_records").select("collection,id,data");
  if (records.error) throw records.error;

  for (const collection of collections) store[collection] = [];
  for (const row of records.data || []) {
    if (collections.includes(row.collection)) store[row.collection].push(row.data);
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

function findOrCreateItem(store, line) {
  const name = normalizeText(line.itemName || line.name);
  if (!name) throw new Error("Item name is required.");
  const unit = normalizeText(line.unit);
  const category = normalizeText(line.category || "General");
  const key = name.toLowerCase();
  let item = store.items.find((entry) => entry.name.toLowerCase() === key && (!unit || entry.unit === unit));
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
  for (const movement of store.ledger) {
    const key = movement.itemId;
    const current = stock.get(key) || {
      itemId: movement.itemId,
      itemName: movement.itemName,
      category: movement.category || "General",
      unit: movement.unit || "",
      received: 0,
      issued: 0,
      balance: 0,
      lastMovementAt: movement.date
    };
    if (movement.type === "RECEIPT") current.received += Number(movement.quantity || 0);
    if (movement.type === "ISSUE") current.issued += Number(movement.quantity || 0);
    if (movement.type === "ADJUSTMENT") current.received += Number(movement.quantity || 0);
    current.balance = current.received - current.issued;
    if (!current.lastMovementAt || movement.date > current.lastMovementAt) current.lastMovementAt = movement.date;
    stock.set(key, current);
  }
  return [...stock.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

function availableQty(store, itemId) {
  return inventorySummary(store).find((entry) => entry.itemId === itemId)?.balance || 0;
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

function addLedgerMovement(store, movement) {
    store.ledger.push({
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
    referenceType: movement.referenceType,
    referenceId: movement.referenceId,
    documentNo: movement.documentNo || "",
    remarks: movement.remarks || ""
  });
}

async function routeApi(req, res, pathname) {
  const store = await readStore();

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const user = store.users.find((entry) => entry.username === body.username && entry.password === body.password);
    if (!user) return sendError(res, 401, "Invalid username or password.");
    const token = crypto.randomBytes(24).toString("hex");
    sessions.set(token, { userId: user.id, createdAt: Date.now() });
    return sendJson(res, 200, { token, user: cleanUser(user) });
  }

  const user = await requireUser(req, res, store);
  if (!user) return;

  if (req.method === "GET" && pathname === "/api/me") return sendJson(res, 200, cleanUser(user));
  if (req.method === "GET" && pathname === "/api/dashboard") return sendJson(res, 200, dashboard(store));
  if (req.method === "GET" && pathname === "/api/projects") return sendJson(res, 200, store.projects);
  if (req.method === "GET" && pathname === "/api/budget-heads") return sendJson(res, 200, store.budgetHeads);
  if (req.method === "GET" && pathname === "/api/infrastructures") return sendJson(res, 200, store.infrastructures);
  if (req.method === "GET" && pathname === "/api/items") return sendJson(res, 200, store.items.sort((a, b) => a.name.localeCompare(b.name)));
  if (req.method === "GET" && pathname === "/api/requisitions") return sendJson(res, 200, store.requisitions.slice().reverse());
  if (req.method === "GET" && pathname === "/api/receipts") return sendJson(res, 200, store.receipts.slice().reverse());
  if (req.method === "GET" && pathname === "/api/issues") return sendJson(res, 200, store.issues.slice().reverse());
  if (req.method === "GET" && pathname === "/api/inventory") return sendJson(res, 200, inventorySummary(store));
  if (req.method === "GET" && pathname === "/api/ledger") return sendJson(res, 200, store.ledger.slice().reverse());
  if (req.method === "GET" && pathname === "/api/reports") {
    return sendJson(res, 200, {
      dashboard: dashboard(store),
      projects: store.projects,
      expenses: store.expenses.slice(0, 500),
      recentLedger: store.ledger.slice(-200).reverse()
    });
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
    await writeStore(store);
    return sendJson(res, 201, infrastructure);
  }

  if (req.method === "POST" && pathname === "/api/requisitions") {
    if (!hasPermission(user, "requisition:create")) return sendError(res, 403, "Only the requisition user can create requests.");
    const body = await readBody(req);
    const lines = (body.lines || []).filter((line) => normalizeText(line.itemName || line.name));
    if (!lines.length) return sendError(res, 400, "Add at least one item.");
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
    await writeStore(store);
    return sendJson(res, 201, requisition);
  }

  const statusMatch = pathname.match(/^\/api\/requisitions\/([^/]+)\/status$/);
  if (req.method === "PATCH" && statusMatch) {
    const requisition = store.requisitions.find((entry) => entry.id === statusMatch[1]);
    if (!requisition) return sendError(res, 404, "Requisition not found.");
    const body = await readBody(req);
    const action = body.action;
    const now = new Date().toISOString();
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
      requisition.status = "REJECTED";
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
    await writeStore(store);
    return sendJson(res, 200, requisition);
  }

  if (req.method === "POST" && pathname === "/api/receipts") {
    if (!hasPermission(user, "receipt:create")) return sendError(res, 403, "Only store/PMU can receive stock.");
    const body = await readBody(req);
    const lines = (body.lines || []).filter((line) => normalizeText(line.itemName || line.name));
    if (!lines.length) return sendError(res, 400, "Add at least one received item.");
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
      addLedgerMovement(store, {
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
      });
    }
    store.receipts.push(receipt);
    if (requisition) {
      requisition.status = "PARTIALLY_RECEIVED";
      requisition.receipts = [...(requisition.receipts || []), receipt.id];
    }
    await writeStore(store);
    return sendJson(res, 201, receipt);
  }

  if (req.method === "POST" && pathname === "/api/issues") {
    if (!hasPermission(user, "issue:create")) return sendError(res, 403, "Only store/PMU can issue stock.");
    const body = await readBody(req);
    const lines = (body.lines || []).filter((line) => normalizeText(line.itemName || line.name));
    if (!lines.length) return sendError(res, 400, "Add at least one issued item.");
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
    for (const line of lines) {
      const item = findOrCreateItem(store, line);
      const quantity = qtyNumber(line.quantity);
      if (availableQty(store, item.id) < quantity) {
        return sendError(res, 400, `Insufficient stock for ${item.name}. Available: ${availableQty(store, item.id)} ${item.unit}`);
      }
      const unit = normalizeText(line.unit || item.unit);
      issue.lines.push({
        itemId: item.id,
        itemName: item.name,
        category: normalizeText(line.category || line.specification),
        specification: normalizeText(line.category || line.specification),
        quantity,
        unit,
        remarks: normalizeText(line.remarks)
      });
      addLedgerMovement(store, {
        type: "ISSUE",
        date: issue.date,
        item,
        quantity,
        unit,
        projectId: issue.projectId,
        budgetHeadId: issue.budgetHeadId,
        infrastructureId: issue.infrastructureId,
        referenceType: "issue",
        referenceId: issue.id,
        documentNo: issue.issueChallanNo,
        remarks: issue.remarks
      });
    }
    store.issues.push(issue);
    await writeStore(store);
    return sendJson(res, 201, issue);
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
        message: result.error.message
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

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/healthz") return await routeHealth(req, res);
    if (url.pathname.startsWith("/api/")) return await routeApi(req, res, url.pathname);
    return await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, 500, error.message || "Server error");
  }
}).listen(PORT, HOST, () => {
  console.log(`Inventory System running at http://${PUBLIC_HOST}:${PORT}`);
  console.log(`Local access: http://localhost:${PORT}`);
});
