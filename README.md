# Inventory System

An inventory and requisition system built from the manual Excel/Word records.

## Run

For local development, start the Node API and React dev server in two terminals:

```powershell
npm start
npm run dev
```

Open `http://localhost:5173`.

For a production-style local run:

```powershell
npm run build
npm start
```

Open `http://localhost:3000`.

## Supabase Setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Copy `.env.example` to `.env`.
4. Fill in `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
5. Import the manual records locally, then sync to Supabase:

```powershell
npm run import:resources
npm run supabase:sync
```

When Supabase env values are present, the Node API reads and writes Supabase. Without them, it uses `data/store.json` for local testing.

## Render Deployment

The repo includes [render.yaml](C:/Users/a/Documents/gimms/render.yaml) for a Render Blueprint deployment.

Read [docs/render-deployment.md](C:/Users/a/Documents/gimms/docs/render-deployment.md) before deploying. Production Render deployments should set `REQUIRE_SUPABASE=true` and provide Supabase credentials because Render's local filesystem is ephemeral.

For access from other devices on the network, open `http://192.168.8.8:3000`.

## Demo Users

| Username | Password | Role |
| --- | --- | --- |
| `requester` | `request123` | Creates and tracks requisitions |
| `store` | `store123` | First approval, order placement, stock receipt, stock issue |
| `approver` | `approve123` | Final approval |

## Workflow

1. Requisition user creates an order request.
2. Store/PMU user verifies it.
3. Approver gives final approval.
4. Store/PMU marks the order placed.
5. Only after stock reaches the store, the store user records Challan No, DV No, Bill No, and receipt quantities.
6. Stock ledger updates automatically for every receipt and issue.

## Data

Supabase is the primary database when `.env` contains Supabase credentials. `data/store.json` remains the local fallback and import staging file. The importer reads the manual Excel records from `resources/` and migrates historical projects, stock receipts, issues, expenses, and requisition follow-up records.

```powershell
npm run import:resources
npm run supabase:sync
```
