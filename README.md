# Ulivya Store Frontend

Static storefront built with HTML + Tailwind (CDN) and Node/Express server.

## Local development

1. Install dependencies:
   - `npm install`
2. Install and start MongoDB locally (or use cloud MongoDB Atlas).
3. Create `.env` in project root with:
   - `STRIPE_SECRET_KEY=sk_test_YOUR_SECRET_KEY_HERE`
   - `STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE`
   - `SENDGRID_API_KEY=SG.YOUR_SENDGRID_KEY_HERE`
   - `SENDGRID_FROM_EMAIL=hello@ulivya.com`
   - `MONGODB_URI=mongodb://localhost:27017/ulivya-store` (or your Atlas URI)
4. Start dev server:
   - `npm run dev` (requires nodemon)
5. Open browser:
   - `http://localhost:3000` (store)
   - `http://localhost:3000/admin/orders` (admin dashboard)

## SendGrid Email confirmation

1. Create SendGrid account and API key.
2. Add `SENDGRID_API_KEY` and `SENDGRID_FROM_EMAIL` in `.env`.
3. Verify sender identity in SendGrid (required for live sends).
4. After checkout success, webhook sends order confirmation email with:
   - Order ID
   - Total amount
   - Shipping details
   - Tracking information

## Stripe webhook setup (unchanged)

1. Create Stripe Checkout session in `server.js` and set domain URLs.
2. In Stripe dashboard, add a webhook endpoint:
   - URL: `https://<your-host>/webhook`
   - Events: `checkout.session.completed`
3. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Test with `stripe listen --forward-to localhost:3000/webhook`.

## Stripe webhook setup

1. Create Stripe Checkout session in `server.js` and set domain URLs.
2. In Stripe dashboard, add a webhook endpoint:
   - URL: `https://<your-host>/webhook`
   - Events: `checkout.session.completed`
3. Copy webhook signing secret to `STRIPE_WEBHOOK_SECRET`.
4. Test with `stripe listen --forward-to localhost:3000/webhook`.

## Admin Dashboard

- Visit `/admin/orders` to view all orders in a table format.
- Includes order ID, customer email, total, status, tracking, and creation date.
- Requires authentication in production (add middleware for security).

## Production

### Docker

1. Build image:
   - `docker build -t ulivya-store-frontend .`
2. Run container:
   - `docker run -p 3000:3000 ulivya-store-frontend`

### Heroku

1. `heroku create`
2. `git push heroku main`

### Render

1. Create new Web Service pointing to this repo.
2. Set Build command: `npm install`
3. Set Start command: `npm start`
4. (Optional) Add `render.yaml` at repo root for config-as-code.

### GitHub Actions + Render (optional)

To auto-deploy on push, create a Render service with an API key and add these secrets in GitHub:
- `RENDER_API_KEY`
- `RENDER_SERVICE_ID`

Then use the Render GitHub Action (could be added here later) to trigger deploys.

## Notes

- Uses `express` server in `server.js` for static assets.
- `index.html` contains landing page and interactive `Add to Bag` demo.
- `Dockerfile` and `Procfile` provided for container and PaaS deployment.
