# Payment Test Store

Two independent apps in this repo:

- `frontend/` is the Vite storefront. Deploy it on Render as a static site.
- `backend/` is the Node API. It creates Duco checkout sessions and receives webhooks. Deploy it on Render as a web service.

Card numbers are entered on Duco’s hosted page. An order is marked paid when a signed `PaymentIntentSucceeded` webhook arrives.

## Local

```bash
cd backend
cp .env.example .env
npm start
```

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The API listens on port 3001. Leave `VITE_API_URL` empty locally so Vite proxies `/api` to that port.

## Render

Create two services from this repository, or apply `render.yaml` as a Blueprint.

**Backend web service**

- Root directory: `backend`
- Build command: `npm install`
- Start command: `npm start`
- Health check path: `/`

| Variable | Purpose |
| --- | --- |
| `DUCO_MERCHANT_KEY` | Secret key (`duco_test_…` or `duco_live_…`). `DOCU_PAY_API` is also accepted. |
| `DUCO_WEBHOOK_SECRET` | Signing secret (`whsec_…`) from the webhook endpoint. |
| `DUCO_API_BASE` | Defaults to `https://api-staging.ducopay.com`. |
| `APP_ORIGIN` | Storefront origin, such as `https://payment-test-store.onrender.com`. Used for the checkout return URL and browser CORS. |

**Frontend static site**

- Root directory: `frontend`
- Build command: `npm install && npm run build`
- Publish directory: `dist`
- Rewrite `/*` to `/index.html` so `/checkout` and `/orders/:reference` work on refresh.

Set `VITE_API_URL` to the backend origin, with no trailing slash, for example `https://payment-test-store-api.onrender.com`. Vite reads it at build time, so change it and redeploy the static site together.

## Webhook and status

Register `https://<backend-host>/webhooks/duco` for `PaymentIntentSucceeded`, `PaymentIntentFailed`, and `PaymentIntentCanceled`. The webhook is what records the payment.

The return page also asks the API to read the payment. Duco can leave the checkout session `active` after a successful card payment and set the payment intent to `succeeded`. The waiting page polls every 3 seconds for up to 2 minutes and stops when the intent has succeeded, the session is `consumed`, or the payment has failed, expired, or been canceled.

Orders are stored in `backend/data/orders.json`. Render’s disk is replaced on each deploy, so those orders do not survive a restart.
