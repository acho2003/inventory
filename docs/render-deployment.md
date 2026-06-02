# Render Deployment

This app is ready to deploy as a Render Node web service.

## 1. Prepare Supabase

Render has an ephemeral filesystem, so production must use Supabase.

1. Create a Supabase project.
2. Open the Supabase SQL editor.
3. Run `supabase/schema.sql`.
4. Copy your Supabase project URL.
5. Copy your Supabase service role key.

## 2. Push Imported Data

Run this locally after setting `.env`:

```powershell
npm run import:resources
npm run supabase:sync
```

## 3. Deploy on Render

Use `render.yaml` as a Blueprint, or create a Web Service manually with:

```text
Runtime: Node
Build Command: npm ci && npm run build
Start Command: npm start
Health Check Path: /healthz
```

Add these Render environment variables:

```text
NODE_ENV=production
HOST=0.0.0.0
REQUIRE_SUPABASE=true
SUPABASE_URL=<your Supabase project URL>
SUPABASE_SERVICE_ROLE_KEY=<your Supabase service role key>
```

Do not expose `SUPABASE_SERVICE_ROLE_KEY` in browser code. It is used only by the Node API.

## 4. Verify

After Render deploys, open:

```text
https://<your-service>.onrender.com/healthz
```

Expected response:

```json
{
  "ok": true,
  "storage": "supabase"
}
```
