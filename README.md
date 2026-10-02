# RESCOM — Real-time Evacuation Status Coordination and Monitoring

Full-stack implementation matching the Activity 4 relational schema, use case
diagram, activity diagram, sequence diagrams and class diagram.

- **Backend:** Node.js, Express 5, PostgreSQL (`pg`), Socket.io, JWT auth, bcrypt
- **Frontend:** React 18 (Vite), Tailwind CSS, glassmorphism UI, socket.io-client

Two roles, matching the use case diagram: **Admin Staff** and **Field Personnel**.

```
rescom/
├── backend/     Express API + PostgreSQL + Socket.io
└── frontend/    React (Vite) glassmorphism client
```

## 1. Database setup

Create the database and load the schema:

```bash
createdb mdrrmo_db
psql -d mdrrmo_db -f backend/schema.sql
```

(Adjust the database name to whatever you set in `backend/.env` — it defaults
to `mdrrmo_db` from your original `_env` file.)

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # then edit DB_PASSWORD / JWT_SECRET
npm run seed                # creates demo accounts + sample data (optional but recommended)
npm run dev                 # http://localhost:5000
```

Demo accounts created by `npm run seed`:

| Role            | Username     | Password    |
|-----------------|--------------|-------------|
| Admin Staff     | `admin`      | `password123` |
| Field Personnel | `responder1` | `password123` |

### API overview

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/api/auth/register` | — | role is user-selected: `ADMIN_STAFF` or `FIELD_PERSONNEL` |
| POST | `/api/auth/login` | — | returns `{ user, token }` |
| GET  | `/api/auth/me` | ✓ | resolves current token |
| POST | `/api/auth/forgot-password/request` | — | `{ identifier, channel: 'email'\|'sms' }` — sends a 6-digit PIN |
| POST | `/api/auth/forgot-password/verify` | — | `{ identifier, pin }` |
| POST | `/api/auth/forgot-password/reset` | — | `{ identifier, pin, new_password }` |
| GET/POST/PUT/DELETE | `/api/users` | ✓ (write = Admin Staff) | |
| GET/POST/PUT/DELETE | `/api/centers` | ✓ | POST/PUT accept multipart `image` file |
| GET | `/api/evacuees` | ✓ | joined roster with family, center, priority tags |
| POST | `/api/evacuees/register` | ✓ | creates family (if new) + evacuee + record, updates occupancy |
| PUT | `/api/evacuees/:id` | ✓ | edit name/age/gender |
| PATCH | `/api/evacuees/:id/checkout` | ✓ | |
| DELETE | `/api/evacuees/:id` | ✓ | rolls back center occupancy if still "Present" |
| GET/POST | `/api/incidents` | ✓ | |
| PATCH | `/api/incidents/:id/status` | ✓ | |
| GET/POST/PATCH/DELETE | `/api/priority-cases` | ✓ | |
| GET/POST | `/api/dromic` | ✓ | `GET /:id/summary` compiles live figures |
| GET | `/api/dromic/:id/pdf` | ✓ | A4 PDF download of the report |
| GET/PATCH/DELETE | `/api/notifications*` | ✓ | list, mark read/unread, delete, mark-all-read |

All writes broadcast a matching Socket.io event (`center_updated`,
`evacuee_registered`, `new_incident_dispatched`, `incident_status_changed`,
`priority_case_flagged`, `user_updated`, `dromic_report_generated`) plus a
generic `notification` event the Topbar bell listens for — this is the
"Transmits data via Starlink" / real-time layer from the activity diagram,
implemented as WebSocket push instead of a literal satellite link.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

If your API isn't on `http://localhost:5000`, create `frontend/.env`:

```
VITE_API_URL=http://your-api-host:5000
```

## Design notes

- The whole UI sits on a fixed, blurred gradient backdrop (`.rescom-bg` in
  `index.css`) with `backdrop-filter: blur()` glass panels on top — that's
  what makes the glassmorphism actually read as glass instead of flat gray.
- Tailwind tokens for the glass system live in `frontend/tailwind.config.js`
  (`shadow-glass`, `rounded-glass`, accent/danger/warn/success/pink colors).
- `GlassPanel.jsx` and the `glass` / `glass-strong` / `glass-dark` CSS classes
  are the three panel intensities used throughout — sidebar/topbar use
  `glass-dark`, cards use `glass`, modals use `glass-strong`.

## Update: UI refresh
- Flat, solid surfaces (glassmorphism and backdrop blur removed).
- New Login/Register screens; assets in `frontend/src/assets/`.
- Free API: Open-Meteo weather card on the Dashboard (no key needed).

## Update: full-functionality pass

- **Demo login shortcuts removed** from the Login screen.
- **Success modal** — a real modal (not a toast) with an animated green
  checkmark, used for center/report actions. Auto-dismisses after ~1.8s, or
  tap **Cancel** to close it immediately. See `UiContext.openSuccess()`.
- **Evacuees — full CRUD**: edit (name/age/gender) and delete (with
  confirmation) alongside check-out. Deleting an evacuee who's still
  "Present" correctly rolls back that center's occupancy count.
- **DROMIC reports → A4 PDF**: `GET /api/dromic/:id/pdf` renders an
  official-looking A4 PDF (via `pdfkit`) with incident details, summary
  figures, priority-case breakdown and center occupancy. "Download PDF"
  buttons are on the reports table and inside the summary modal.
- **Notifications, fully wired**: notifications now persist per-user in
  Postgres (`NOTIFICATIONS` + `USER_NOTIFICATIONS`). The bell dropdown
  supports opening/reading a notification, a **`…`** menu per item
  (mark read/unread, delete, view), **Mark all read**, and a **View all**
  full-list modal. New endpoints: `GET/PATCH/DELETE /api/notifications*`.
- **Forgot password — real PIN flow**: `POST /api/auth/forgot-password/request`
  (`{ identifier, channel: 'email'|'sms' }`) emails or texts a 6-digit PIN,
  `/verify` checks it, `/reset` sets the new password. Configure SMTP (Gmail
  App Password) and/or an SMS gateway in `backend/.env` — see
  `backend/.env.example`. Without config, the PIN is logged to the server
  console so the flow still works in local dev.
- **Terms of Service & Privacy Policy** now pop up as a single reviewable
  modal from Register (tap the link, or it auto-checks the box on "I Agree").
- **Sign-up roles (hardened for deployment)**: the first account ever created
  becomes Admin Staff; everyone after that self-registers as Field Personnel and
  only an Admin can create/promote admins from the Users page. Set
  `ALLOW_PUBLIC_REGISTRATION=false` to close self-registration entirely.
- **Evacuation Centers — photos**: add/edit a center now includes an image
  upload (multipart via `multer`), shown as a card header photo. Files land
  in `backend/uploads/centers/` and are served from `/uploads/centers/...`.
- **Dashboard charts** (via `recharts`): center occupancy vs. capacity
  (stacked bars), incidents by severity (donut), priority cases by type
  (horizontal bars) — all computed live from the same API data.

### Upgrading an existing database

If you already ran `schema.sql` once, don't re-run it (it drops tables).
Instead apply the additive migration:

```bash
psql -d mdrrmo_db -f backend/migrations/001_upgrade.sql
```

This adds `USERS.phone`, `EVACUATION_CENTERS.image_url`, and the
`NOTIFICATIONS` / `USER_NOTIFICATIONS` / `PASSWORD_RESETS` tables without
touching existing rows. Fresh installs can just load `schema.sql` — it
already includes everything.

### New backend dependencies

```bash
cd backend
npm install     # now also pulls in multer, pdfkit, nodemailer
```


## Deploying

See **[DEPLOY.md](DEPLOY.md)** for the step-by-step guide (Netlify frontend +
Render backend + Neon database for a free demo, or one VPS for real use).
Deployment-ready changes: `DATABASE_URL` support with SSL, `helmet`, rate
limiting on login/sign-up/password reset, multi-origin CORS, the reset PIN is
never returned to the browser when `NODE_ENV=production`, Brevo HTTPS email
(for hosts that block SMTP), `UPLOAD_DIR` for photo storage, and `multer` v2.

```bash
cd backend && npm install   # pulls in helmet, express-rate-limit, multer 2
```
