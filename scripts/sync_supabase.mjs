import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const storePath = path.join(root, "data", "store.json");
const collections = ["users", "projects", "budgetHeads", "infrastructures", "items", "requisitions", "receipts", "issues", "ledger", "expenses", "stockEvents", "auditEvents"];

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before syncing.");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const store = JSON.parse(await fs.readFile(storePath, "utf8"));

const defaultUsers = [
  { id: "u-piu-yarju", username: "piuyarju@gmail.com", passwordHash: "scrypt$37f8fbed50c1e4e256067dc951493a71$3f71e8e5d3d8d1046dd8d500d7711683107e5f19d014ad8993c67951aed93e8b0bd6e6432541afe5d2d19abcb36a4c6e5e7f03aa73aa69188ee057ad6e8650b2", name: "PIU Yarju", role: "requester" },
  { id: "u-pmu-yarju", username: "pmuyarju@gmail.com", passwordHash: "scrypt$a456e45208f73e7fc528669c1092f9cb$51d132c78c3ab96b7caa99d52bff89362919fbfcd5241e3abfd4c2d6e17bad660e739dff9cbc436d8cd82271f067c6401e6a4f0e44234c45108ba9cf3f22eff2", name: "PMU Yarju", role: "approver" },
  { id: "u-store-yarju", username: "storeyarju@gmail.com", passwordHash: "scrypt$f89645ba5cf4c5215400852b41d92558$4ffbb4be97e40aaeacdb96451da491abe7cfadba55554e11517044f42513da0a1f16c4767eac208f657338a135cfa5acd5c11eda83ae1304773945333b41b56b", name: "Yarju Store", role: "store" },
  { id: "u-oc-yarju", username: "ocyarju@gmail.com", passwordHash: "scrypt$f7cb53f84b2f21ed643a645bfa684f91$80c43bd8ec1d62d400b4819b911ade8b47be8477b5b96f7920f278ead5db1310dd30471b4088142a4a9b4ab49536782bc50404350b75476c928456bc3dd65ef1", name: "OC Yarju", role: "admin" },
  { id: "u-acc-yarju", username: "accyarju@gmail.com", passwordHash: "scrypt$3b7f3c071b43b7924348e05f645de00f$8b298270fcd7c695f08e2b62834f1d31de73d220ba27011b3aade1a67354759c8c124dbe894211ef2515752659b3791bd2a02cc3d7b215f02ef536d74b2860e9", name: "ACC Yarju", role: "store" }
];

store.users ||= [];
for (const user of defaultUsers) {
  if (!store.users.some((entry) => String(entry.username || "").toLowerCase() === user.username)) {
    store.users.push(user);
  }
}

store.meta ||= {};
store.meta.name = "Yarju OAP Inventory";
store.stockEvents ||= [];
store.auditEvents ||= [];
store.counters ||= {};
store.counters.stockEvent ||= 1;
store.counters.transfer ||= 1;
store.counters.adjustment ||= 1;
store.counters.auditEvent ||= 1;
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
  })).reduce((rows, row) => {
    rows.set(`${row.collection}:${row.id}`, row);
    return rows;
  }, new Map()).values();
}

await checked("upsert app state", supabase.from("app_state").upsert({
  id: "main",
  data: { meta: store.meta, counters: store.counters },
  updated_at: new Date().toISOString()
}));

for (const collection of collections) {
  await checked(`clear ${collection}`, supabase.from("app_records").delete().eq("collection", collection));
  const records = [...recordsForSync(collection)];
  for (let index = 0; index < records.length; index += 500) {
    const rows = records.slice(index, index + 500);
    if (rows.length) await checked(`sync ${collection}`, supabase.from("app_records").upsert(rows, { onConflict: "collection,id" }));
  }
  console.log(`Synced ${records.length} ${collection}`);
}

console.log("Supabase sync complete.");
