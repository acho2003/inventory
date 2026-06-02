import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const storePath = path.join(root, "data", "store.json");
const collections = ["users", "projects", "items", "requisitions", "receipts", "issues", "ledger", "expenses"];

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env before syncing.");
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const store = JSON.parse(await fs.readFile(storePath, "utf8"));

async function checked(label, query) {
  const result = await query;
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result;
}

await checked("upsert app state", supabase.from("app_state").upsert({
  id: "main",
  data: { meta: store.meta, counters: store.counters },
  updated_at: new Date().toISOString()
}));

for (const collection of collections) {
  await checked(`clear ${collection}`, supabase.from("app_records").delete().eq("collection", collection));
  const records = store[collection] || [];
  for (let index = 0; index < records.length; index += 500) {
    const rows = records.slice(index, index + 500).map((record) => ({
      collection,
      id: String(record.id),
      data: record,
      updated_at: new Date().toISOString()
    }));
    if (rows.length) await checked(`sync ${collection}`, supabase.from("app_records").upsert(rows, { onConflict: "collection,id" }));
  }
  console.log(`Synced ${records.length} ${collection}`);
}

console.log("Supabase sync complete.");
