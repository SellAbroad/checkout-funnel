# Checkout Funnel Analytics

Tracks checkout friction for SellAbroad by capturing funnel events from the checkout frontend, storing them in PostgreSQL, and providing a visual dashboard.

## Architecture

```
zonaapp (checkout frontend)
  │  sendBeacon POST /events
  ▼
apps/api (Hono backend on Railway)
  │  writes to
  ▼
PostgreSQL (Railway)
  │  reads from
  ▼
apps/dashboard (React dashboard on Railway)
```

## Local Development

### Prerequisites
- Node.js 22+
- PostgreSQL (local or Railway)

### Backend API

```bash
cd apps/api
cp ../../.env.example .env   # edit DATABASE_URL
npm install
npm run migrate              # creates tables
npm run dev                  # http://localhost:3100
```

### Dashboard

```bash
cd apps/dashboard
npm install
npm run dev                  # http://localhost:5173
```

Set `VITE_API_URL=http://localhost:3100` in `apps/dashboard/.env`.

## Railway Deployment

### 1. Create a Railway project

1. Go to [railway.app](https://railway.app) and create a new project
2. Add a **PostgreSQL** service (click "New" > "Database" > "PostgreSQL")
3. Copy the `DATABASE_URL` from the Postgres service variables

### 2. Deploy the API

1. Click "New" > "GitHub Repo" > select `checkout-funnel`
2. In Settings:
   - **Root Directory**: `apps/api`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `node dist/index.js`
3. Add environment variables:
   - `DATABASE_URL` = (paste from step 1)
   - `PORT` = `3100`
   - `CORS_ORIGIN` = (your dashboard URL, or `*` initially)
4. After first deploy, run migration:
   - In the service, go to "Settings" > "Deploy" and add to **Start Command**: `npm run migrate && node dist/index.js`
   - Or use Railway CLI: `railway run npm run migrate`

### 3. Deploy the Dashboard

The dashboard is a static Vite build; `VITE_*` variables must exist **at build time** (they are baked into the JS).

#### Option A: Railway CLI (same project as API)

1. In the Railway project (e.g. `chk-api`), click **+ New** > **Empty service** and name it (e.g. `checkout-funnel-dashboard`).
2. Locally:
   ```bash
   cd apps/dashboard
   railway link          # same project; select the **dashboard** service (not Postgres, not API)
   railway variable set VITE_API_URL=https://stellar-determination-production-736e.up.railway.app
   railway variable set VITE_CLARITY_PROJECT_ID=your-clarity-project-id
   ```
   Optional: leave `VITE_CLARITY_PROJECT_ID` empty if you do not need Clarity replay links in the table.
3. **Dockerfile** (recommended): in the dashboard service **Settings** > **Build** > **Dockerfile path**: `Dockerfile`, **Root Directory**: `apps/dashboard` (if deploying from monorepo repo). Or run `railway up` from `apps/dashboard` after linking so the upload context is this folder.
4. Ensure variables used during Docker build are available: in Railway **Variables**, add `VITE_API_URL` (and optional `VITE_CLARITY_PROJECT_ID`). If the UI offers **"Build"** scope / "Available at build time", enable it for these keys.
5. Deploy: **Deploy** from the UI or `railway up` from `apps/dashboard`.
6. **Networking** > **Generate Domain** for the dashboard service. Open the URL in the browser.

#### Option B: GitHub (when repo is connected)

1. New service from repo `checkout-funnel`
2. **Root Directory**: `apps/dashboard`
3. Use **Dockerfile** or:
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npx --yes serve@14 dist -s -l $PORT`
4. Set `VITE_API_URL` and optional `VITE_CLARITY_PROJECT_ID` (build-time)
5. Generate public domain

#### CORS on the API

After the dashboard has a URL, set the API `CORS_ORIGIN` to that URL (or keep `*` for internal tools only).

### 4. Configure zonaapp

Add to the environment variables of the checkout (zonaapp):
```
NEXT_PUBLIC_CHECKOUT_FUNNEL_URL=https://your-api-url.railway.app
```

## API Endpoints

### Events Ingestion
- `POST /events` - Receive checkout events (used by sendBeacon)

### Analytics
- `GET /analytics/funnel?merchant_id=&from=&to=` - Funnel step counts
- `GET /analytics/sessions?merchant_id=&from=&to=&max_step=&completed=&limit=&offset=` - Session list
- `GET /analytics/sessions/:id/events` - Events for a specific session
- `GET /analytics/stats?merchant_id=&from=&to=` - Summary statistics
- `GET /analytics/merchants` - List of merchants with session counts

## Funnel Steps

| Step | Event | Description |
|------|-------|-------------|
| 1 | sa_checkout_loaded | Checkout page opened |
| 2 | sa_checkout_prices_ready | Prices calculated and displayed |
| 3 | sa_checkout_shipping_shown | Shipping options appeared |
| 4 | sa_checkout_shipping_selected | User selected shipping method |
| 5 | sa_checkout_discount_applied | Discount code applied |
| 6 | sa_checkout_payment_shown | Payment section rendered |
| 7 | sa_checkout_pay_clicked | User clicked the pay button |
| 8 | sa_checkout_completed | Thank you page shown |
