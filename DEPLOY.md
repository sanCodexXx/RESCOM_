# RESCOM deployment guide

Two paths. **Path A is free and good for a demo/defense. Path B is for real MDRRMO use.**

| | Path A: free demo | Path B: real use |
|---|---|---|
| Frontend | Netlify | Netlify (or the same VM) |
| Backend | Render (free web service) | Azure student VM / any VPS |
| Database | Neon (free Postgres) | Postgres on the same VM |
| Email | Brevo API (SMTP is blocked on Render free) | Gmail SMTP or Brevo |
| Center photos | **Lost on every redeploy/restart** | Kept on the VM disk |
| Sleeps when idle | Yes (about 15 min, ~1 min to wake) | No |

> Your SRS says RESCOM is an academic prototype tested in a simulated
> environment. Path A matches that. Before putting real evacuee data in
> any system, get the MDRRMO's written approval and review the Data Privacy
> Act (RA 10173) obligations with their data protection officer.

---

## Before you start (once)

1. Put the project on GitHub. The repo root is the `rescom` folder (it contains `backend/` and `frontend/`). The included `.gitignore` already keeps `.env` and `node_modules` out.
   ```powershell
   cd C:\Users\esang\Downloads\rescom-fullstack\rescom
   git init
   git add .
   git commit -m "RESCOM deploy-ready"
   ```
   Create an empty repo on github.com, then follow its "push an existing repository" commands.
2. Generate a production JWT secret and keep it somewhere safe:
   ```powershell
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

---

# Path A: Netlify + Render + Neon (free)

## A1. Database (Neon)

1. Create an account at neon.com and a new project. Region: pick the one closest to Singapore if offered.
2. Copy the **connection string** (looks like `postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`).
3. Load the schema into it. In PowerShell from the `rescom` folder (change `18` if your Postgres folder differs; check with `dir "C:\Program Files\PostgreSQL"`):
   ```powershell
   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" "PASTE_CONNECTION_STRING_HERE" -f backend/schema.sql
   ```
   You should see a list of `CREATE TABLE` lines. (`schema.sql` drops tables first, which is fine on a new empty database. Never run it again on a database that has real data.)
4. Do **not** run `npm run seed` here. The seed script refuses to run in production anyway.

## A2. Email (Brevo), needed for forgot-password

Render's free tier blocks outbound SMTP ports 25/465/587, so Gmail SMTP will time out there. Use Brevo's HTTPS API instead.

1. Create a free account at brevo.com.
2. **Senders & IP** -> add a sender (the email address the PINs will come from, such as your Gmail) and confirm it with the code Brevo sends.
3. **SMTP & API -> API keys** -> create an API key and copy it.
4. You will paste two values into Render below: `BREVO_API_KEY` and `MAIL_FROM_EMAIL` (the verified sender).

## A3. Backend (Render)

1. render.com -> **New -> Web Service** -> connect your GitHub repo.
2. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance type:** Free
3. **Environment variables** (Add one by one):

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | your Neon connection string |
| `JWT_SECRET` | the long random string from "Before you start" |
| `JWT_EXPIRES_IN` | `8h` |
| `CLIENT_ORIGIN` | your Netlify URL, e.g. `https://rescom-sannicolas.netlify.app` (no trailing slash; you can set a temporary value now and fix it after step A4) |
| `ALLOW_PUBLIC_REGISTRATION` | `true` for now (you will switch it to `false` in A5) |
| `BREVO_API_KEY` | from A2 |
| `MAIL_FROM_EMAIL` | verified sender from A2 |
| `MAIL_FROM_NAME` | `RESCOM` |

4. Deploy. When it is live, open `https://YOUR-SERVICE.onrender.com/api/health`. You should see `{"status":"ok","service":"RESCOM API"}`. The first load after idle can take about a minute.

## A4. Frontend (Netlify)

1. app.netlify.com -> **Add new site -> Import an existing project** -> pick the same GitHub repo.
2. Netlify reads `netlify.toml` (base `frontend`, build `npm run build`, publish `dist`). Leave the defaults.
3. **Site configuration -> Environment variables** -> add:
   - `VITE_API_URL` = `https://YOUR-SERVICE.onrender.com` (no trailing slash)
4. Deploy. Then copy your Netlify URL.
5. Go back to Render and set `CLIENT_ORIGIN` to that exact Netlify URL (no trailing slash). Render redeploys by itself.

> `VITE_API_URL` is baked in when the site is **built**. If you change it, trigger a new Netlify deploy.

## A5. First admin and locking sign-up

1. Open your Netlify site and **Register right away**. The first account ever created automatically becomes **Admin Staff**.
2. In Render, set `ALLOW_PUBLIC_REGISTRATION` to `false`. From then on only admins can create accounts (Users page -> add user, choose the role).
3. Test: log in, add an evacuation center, register an evacuee, and use **Forgot password** with Email. The PIN must arrive in the inbox (check Spam). The PIN is never shown on screen in production.

## Known limits of Path A

- **Center photos disappear** when Render restarts or redeploys (free web services have no persistent disk). Re-upload them before a demo, or use Path B.
- **Cold starts:** open the site a couple of minutes before presenting so the backend is awake.
- Free-tier limits change. Check Render's and Neon's current free plans before relying on them.

---

# Path B: one VPS for real use (outline)

Use this when the MDRRMO will actually rely on it. Everything runs on one Ubuntu server: Postgres, the Node API and photo storage on disk.

1. **Server:** Azure for Students VM (Ubuntu 24.04, 2 GB RAM or more) or any VPS in Singapore. Open ports 22, 80, 443.
2. **Install:** Node 20+, PostgreSQL, nginx, certbot, pm2.
3. **Database:** `createdb`, load `backend/schema.sql`, create a dedicated DB user with a strong password. Keep Postgres listening on localhost only.
4. **Backend:** clone the repo, `cd backend && npm ci --omit=dev`, create `.env` from `.env.example` (`NODE_ENV=production`, strong `JWT_SECRET`, DB values, `CLIENT_ORIGIN`, `ALLOW_PUBLIC_REGISTRATION=false` after the first admin exists), then `pm2 start server.js --name rescom-api` and `pm2 save`.
5. **HTTPS:** point a domain to the server, set nginx to proxy `https://api.yourdomain` to `localhost:5000` (include the WebSocket upgrade headers), then run `certbot --nginx`.
6. **Frontend:** Netlify as in A4 with `VITE_API_URL=https://api.yourdomain`.
7. **Email:** Gmail App Password over SMTP works on a VM (Azure normally allows 465/587). Or keep Brevo.
8. **Backups (do not skip):** a daily `pg_dump` kept off the server, plus a restore test:
   ```bash
   pg_dump -U rescom -d mdrrmo_db -Fc -f /backups/rescom-$(date +%F).dump
   ```
9. **Handover:** write down who owns the server, domain and credentials, and who pays for hosting after the student credit ends.

Ask for the full step-by-step version of Path B when you are ready to do it.

---

## Environment variable reference

| Variable | Where | Purpose |
|---|---|---|
| `NODE_ENV=production` | backend | hides the on-screen reset PIN, enforces a real `JWT_SECRET` |
| `DATABASE_URL` | backend | hosted Postgres connection string (SSL on). Overrides `DB_*` |
| `JWT_SECRET` | backend | signs login tokens. Server refuses to start in production with the placeholder |
| `CLIENT_ORIGIN` | backend | allowed frontend URL(s), comma-separated, no trailing slash |
| `ALLOW_PUBLIC_REGISTRATION` | backend | `false` = only admins create accounts (first-ever account is still allowed) |
| `BREVO_API_KEY`, `MAIL_FROM_EMAIL`, `MAIL_FROM_NAME` | backend | email over HTTPS |
| `SMTP_*` | backend | email over SMTP (VM or local only) |
| `UPLOAD_DIR` | backend | folder for center photos (use a persistent disk) |
| `VITE_API_URL` | frontend (build time) | backend URL |

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Login/Register shows a network or CORS error in the browser console | `CLIENT_ORIGIN` on the backend does not exactly match the Netlify URL, or `VITE_API_URL` is wrong/has a trailing slash |
| First request hangs about a minute | Render free service waking up |
| `client password must be a string` / DB errors in Render logs | `DATABASE_URL` missing or wrong |
| Forgot password says "a PIN was sent" but nothing arrives | Brevo sender not verified, wrong API key, or check Spam; Render logs show `sendPinEmail (Brevo) failed: ...` |
| `FATAL: set a strong JWT_SECRET` in logs | `JWT_SECRET` missing or still the placeholder |
| "Too many ... attempts" | rate limiter; wait 15 minutes |
| Center photos gone after a deploy | expected on Render free; use Path B |
| Page refresh gives 404 on Netlify | check `frontend/public/_redirects` and `netlify.toml` are in the repo |
