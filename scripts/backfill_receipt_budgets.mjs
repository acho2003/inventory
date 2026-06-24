import crypto from "node:crypto";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const apply = process.argv.includes("--apply");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before running the backfill.");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

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

function lineSignature(lines = []) {
  return lines
    .map((line) => `${line.itemId || String(line.itemName || "").trim().toLowerCase()}:${Number(line.quantity || 0)}`)
    .sort()
    .join("|");
}

function isActive(record) {
  return !record.isDeleted && !record.deletedAt && record.status !== "Deleted";
}

async function fetchCollection(collection) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from("app_records")
      .select("id,data")
      .eq("collection", collection)
      .order("id")
      .range(from, from + pageSize - 1);
    if (result.error) throw result.error;
    rows.push(...(result.data || []).map((row) => row.data));
    if (!result.data || result.data.length < pageSize) break;
  }
  return rows;
}

const [receipts, issues, auditEvents, stateResult] = await Promise.all([
  fetchCollection("receipts"),
  fetchCollection("issues"),
  fetchCollection("auditEvents"),
  supabase.from("app_state").select("id,data").eq("id", "main").maybeSingle()
]);

if (stateResult.error) throw stateResult.error;

const unassignedReceipts = receipts.filter((receipt) => isActive(receipt) && !receipt.budgetHeadId);
const activeIssues = issues.filter((issue) => isActive(issue) && issue.budgetHeadId);
const candidatesByReceipt = new Map();

for (const receipt of unassignedReceipts) {
  const signature = lineSignature(receipt.lines);
  const candidates = activeIssues.filter((issue) =>
    String(issue.date || "") >= String(receipt.date || "") &&
    lineSignature(issue.lines) === signature
  );
  candidatesByReceipt.set(receipt.id, candidates);
}

const issueUseCount = new Map();
for (const candidates of candidatesByReceipt.values()) {
  for (const issue of candidates) issueUseCount.set(issue.id, (issueUseCount.get(issue.id) || 0) + 1);
}

const matches = [];
const unresolved = [];
for (const receipt of unassignedReceipts) {
  const candidates = candidatesByReceipt.get(receipt.id) || [];
  if (candidates.length === 1 && issueUseCount.get(candidates[0].id) === 1) {
    matches.push({ receipt, issue: candidates[0] });
  } else {
    unresolved.push({
      receiptId: receipt.id,
      challanNo: receipt.challanNo || "",
      reason: candidates.length === 0 ? "No exact later issue match" : "Ambiguous issue match",
      candidateIssueIds: candidates.map((issue) => issue.id)
    });
  }
}

console.log(`${apply ? "APPLY" : "DRY RUN"}: ${matches.length} receipt budget match(es), ${unresolved.length} unresolved.`);
for (const { receipt, issue } of matches) {
  console.log(`  ${receipt.id} -> ${issue.budgetHeadId} via ${issue.id}`);
}
for (const row of unresolved) {
  console.log(`  unresolved ${row.receiptId}: ${row.reason}${row.candidateIssueIds.length ? ` (${row.candidateIssueIds.join(", ")})` : ""}`);
}

if (!apply || !matches.length) {
  if (!apply) console.log("No data changed. Run npm run backfill:receipt-budgets -- --apply to apply unambiguous matches.");
  process.exit(0);
}

const state = stateResult.data?.data || {};
state.counters ||= {};
let auditCounter = Number(state.counters.auditEvent || 1);
const orderedAudit = [...auditEvents].sort((a, b) => String(a.id).localeCompare(String(b.id)));
let previousHash = orderedAudit[orderedAudit.length - 1]?.hash || "";
const now = new Date().toISOString();

for (const { receipt, issue } of matches) {
  const before = JSON.parse(JSON.stringify(receipt));
  receipt.budgetHeadId = issue.budgetHeadId;
  receipt.budgetBackfilledAt = now;
  receipt.budgetBackfillIssueIds = [issue.id];
  receipt.updatedAt = now;

  const receiptResult = await supabase.from("app_records").upsert({
    collection: "receipts",
    id: String(receipt.id),
    data: receipt,
    updated_at: now
  }, { onConflict: "collection,id" });
  if (receiptResult.error) throw receiptResult.error;

  const event = {
    id: `AUD-${String(auditCounter).padStart(5, "0")}`,
    at: new Date().toISOString(),
    actorId: "system",
    actorName: "Receipt budget backfill",
    actorRole: "system",
    eventType: "UPDATE",
    entityType: "receipt",
    entityId: receipt.id,
    entityLabel: receipt.challanNo || receipt.id,
    before,
    after: receipt,
    changes: {
      budgetHeadId: { before: before.budgetHeadId || null, after: receipt.budgetHeadId },
      budgetBackfillIssueIds: { before: null, after: [issue.id] }
    },
    reason: "Inferred from one unambiguous later issue with the same complete item and quantity signature.",
    remarks: `Historical receipt budget assigned from issue ${issue.id}.`,
    documentNo: receipt.challanNo || "",
    linkedLedgerIds: [],
    linkedRequisitionId: receipt.requisitionId || "",
    linkedReceiptId: receipt.id,
    linkedIssueId: issue.id,
    ip: "",
    userAgent: "scripts/backfill_receipt_budgets.mjs",
    previousHash
  };
  event.hash = auditHash(event);
  previousHash = event.hash;
  auditCounter += 1;

  const auditResult = await supabase.from("app_records").upsert({
    collection: "auditEvents",
    id: event.id,
    data: event,
    updated_at: event.at
  }, { onConflict: "collection,id" });
  if (auditResult.error) throw auditResult.error;
}

state.counters.auditEvent = auditCounter;
const stateWrite = await supabase.from("app_state").upsert({
  id: "main",
  data: state,
  updated_at: new Date().toISOString()
});
if (stateWrite.error) throw stateWrite.error;

console.log(`Applied ${matches.length} receipt budget backfill(s).`);
