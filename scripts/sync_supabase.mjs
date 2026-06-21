import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const storePath = path.join(root, "data", "store.json");
const collections = ["users", "projects", "budgetHeads", "infrastructures", "items", "requisitions", "receipts", "issues", "ledger", "expenses", "stockEvents"];

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before syncing.");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const store = JSON.parse(await fs.readFile(storePath, "utf8"));

const defaultUsers = [
  { id: "u-admin", username: "admin", password: "admin123", name: "Administrator", role: "admin" },
  { id: "u-requester", username: "requester", password: "request123", name: "Requisition User", role: "requester" },
  { id: "u-store", username: "store", password: "store123", name: "Store / PMU Officer", role: "store" },
  { id: "u-approver", username: "approver", password: "approve123", name: "Final Approver", role: "approver" }
];

store.users ||= [];
for (const user of defaultUsers) {
  if (!store.users.some((entry) => String(entry.username || "").toLowerCase() === user.username)) {
    store.users.push(user);
  }
}

store.meta ||= {};
store.meta.name = "Yarju_OAP_inventory";
store.stockEvents ||= [];
store.counters ||= {};
store.counters.stockEvent ||= 1;
store.counters.transfer ||= 1;
store.counters.adjustment ||= 1;
store.budgetHeads ||= [];
store.infrastructures ||= [];
if (!store.budgetHeads.length && Array.isArray(store.projects)) {
  store.budgetHeads = store.projects.map((project) => ({
    id: `bh-${String(project.id).replace(/^p-/, "")}`,
    projectId: project.id,
    name: project.name,
    amount: Number(project.budget || 0),
    createdBy: "system",
    createdByName: "Imported record",
    createdAt: store.meta?.importedAt || store.meta?.createdAt || new Date().toISOString()
  }));
}

async function checked(label, query) {
  const result = await query;
  if (result.error) {
    if (result.error.message?.includes("Could not find the table 'public.app_state'")) {
      console.error("Supabase is reachable, but the required tables do not exist yet.");
      console.error("");
      console.error("Open your Supabase project > SQL Editor, then run:");
      console.error(path.join(root, "supabase", "schema.sql"));
      console.error("");
      console.error("After the SQL succeeds, run: npm run supabase:sync");
      process.exit(1);
    }
    throw new Error(`${label}: ${result.error.message}`);
  }
  return result;
}

function recordsForSync(collection) {
  const usedIds = new Set();
  const records = store[collection] || [];

  return records.map((record, index) => {
    let id = record.id === undefined || record.id === null || record.id === "" ? `${collection}-${index + 1}` : String(record.id);

    if (usedIds.has(id)) {
      let suffix = 2;
      while (usedIds.has(`${id}-${suffix}`)) suffix += 1;
      id = `${id}-${suffix}`;
    }

    usedIds.add(id);
    return { ...record, id };
  }).map((record) => ({
    collection,
    id: String(record.id),
    data: record,
    updated_at: new Date().toISOString()
  }));
}

await checked("upsert app state", supabase.from("app_state").upsert({
  id: "main",
  data: { meta: store.meta, counters: store.counters },
  updated_at: new Date().toISOString()
}));

for (const collection of collections) {
  await checked(`clear ${collection}`, supabase.from("app_records").delete().eq("collection", collection));
  const records = recordsForSync(collection);
  for (let index = 0; index < records.length; index += 500) {
    const rows = records.slice(index, index + 500);
    if (rows.length) await checked(`sync ${collection}`, supabase.from("app_records").upsert(rows, { onConflict: "collection,id" }));
  }
  console.log(`Synced ${records.length} ${collection}`);
}

console.log("Supabase sync complete.");
