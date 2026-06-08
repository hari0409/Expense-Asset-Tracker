# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

From repo root:

```bash
npm run dev          # run backend + frontend concurrently
npm run dev:backend  # backend only (tsx watch, port 3001)
npm run dev:frontend # frontend only (vite, port 5173)
npm run install:all  # install deps in both workspaces
```

From `backend/`:
```bash
npm run build  # tsc compile to dist/
npm start      # run compiled dist/index.js
```

From `frontend/`:
```bash
npm run build  # tsc + vite build
npm run lint   # eslint
```

No test suite currently.

---

## Architecture

Monorepo: `backend/` (Express + TypeScript) and `frontend/` (React + Vite + TypeScript). SQLite at `data/expense-tracker.db` via `@libsql/client`.

### Backend (`backend/src/`)

| File | Role |
|---|---|
| `index.ts` | Express app, mounts all routers under `/api/*`, calls `initDb()` before listen |
| `db.ts` | libsql client, `CREATE TABLE IF NOT EXISTS` migrations, inline `ALTER TABLE` migrations (try/catch for idempotency), one-time `backfillInstrumentAssetMapping()` |
| `middleware/auth.ts` | JWT (`jsonwebtoken`) via httpOnly cookie `session`; `requireAuth` middleware; JWT secret auto-generated and stored in `app_meta` table |
| `routes/auth.ts` | Password auth + WebAuthn (passkey) via `@simplewebauthn/server` |
| `routes/categories.ts` | Budget categories, drag-reorder |
| `routes/expenses.ts` | Planned expenses, daily/timeline aggregates |
| `routes/unplannedExpenses.ts` | Ad-hoc/sudden expenses (separate from planned) |
| `routes/rentOuts.ts` | Persons, lent entries, settlements |
| `routes/savings.ts` | Instruments + monthly entries |
| `routes/assets.ts` | Asset tracking, snapshots, manual entries |
| `routes/loans.ts` | Loans, EMI rates, EMI payments |
| `routes/income.ts` | Monthly income records |

All routes except `/api/auth/*` require `requireAuth` middleware (applied in `index.ts` before the router).

### Frontend (`frontend/src/`)

| File/Dir | Role |
|---|---|
| `api.ts` | **Single source of truth** — all API calls + all TypeScript types. Vite proxies `/api` → `localhost:3001` |
| `App.tsx` | React Router v7 layout; `RequireAuth` + `RedirectIfAuthed` guards |
| `contexts/AuthContext.tsx` | Global auth state; status: `loading | authenticated | unauthenticated` |
| `pages/` | One page per domain (see Routes below) |
| `components/Layout.tsx` | Nav shell wrapping all authenticated pages |
| `components/Modal.tsx` | Generic modal wrapper |
| `components/ConfirmModal.tsx` | Confirmation dialog |
| `components/MonthPicker.tsx` | Month/year selector used across pages |
| `components/DateRangePicker.tsx` | Date range selector (used in Reports) |
| `components/ui/` | Shared primitives: `Badge`, `Button`, `Card`, `EmptyState`, `IconButton`, `PageHeader`, `StatTile` |
| `lib/reportMath.ts` | Pure helpers for Reports: date math, linear regression, forecast builder |

### Routes

```
/login                → Login (unauthenticated only)
/                     → Dashboard
/expenses             → Planned expenses + categories
/rent-outs            → Money lent to persons
/savings              → Savings instruments + monthly entries
/assets               → Asset tracker
/loans                → Loans + EMI
/reports              → Multi-chart analytics
/config               → Income, WebAuthn devices, change password
/savings/mapping      → Instrument → Asset mapping (outside Layout shell)
```

---

## Data Model

### Core tables

| Table | Key columns | Notes |
|---|---|---|
| `expense_categories` | `name, month, year, budget, sort_order, color` | Scoped per `(month, year)`; unique `(name, month, year)` |
| `expenses` | `category_id, amount, formula, description, date` | `formula` stores expression string; `category_id` cascade-deletes |
| `unplanned_expenses` | `amount, description, date, month, year` | Separate from planned; no category |
| `rent_out_persons` | `name, color, notes` | + computed `outstanding`, `total_lent`, `entry_count` |
| `rent_out_entries` | `person_id, amount, date_given, status, amount_returned` | `status`: `pending | partial | paid` |
| `rent_out_settlements` | `person_id, amount, date` | Lump-sum settlements (separate from per-entry returns) |
| `savings_instruments` | `name, type, color, monthly_target, asset_id, include_in_assets, asset_name` | `asset_id` FK → assets for contribution tracking |
| `savings_entries` | `instrument_id, amount, month, year` | Unique `(instrument_id, month, year)` |
| `assets` | `name, type, current_value, base_value, color, include_in_total` | `current_value` = `base_value + SUM(mapped instrument entries)` |
| `asset_snapshots` | `asset_id, month, year, value` | Point-in-time snapshot; unique `(asset_id, month, year)` |
| `asset_manual_entries` | `asset_id, amount, note, date, linked_unplanned_expense_id` | Manual value adjustments; optional link to unplanned expense |
| `loans` | `name, lender, principal, has_emi, status, start/end month+year` | `has_emi`: 0 = no EMI tracking |
| `emi_rates` | `loan_id, amount, from_month, from_year` | History of EMI amount changes per loan |
| `emi_payments` | `loan_id, amount, month, year` | Unique `(loan_id, month, year)` |
| `monthly_income` | `month, year, amount` | Unique `(month, year)` |
| `users` | `username, password_hash, webauthn_enabled` | Single-user app |
| `webauthn_credentials` | `user_id, credential_id, public_key, counter, device_name, transports` | Passkey credentials |
| `app_meta` | `key, value` | KV store: `jwt_secret`, `mapping_backfill_done` |

### Schema migration pattern

`db.ts` runs all migrations on startup:
1. `CREATE TABLE IF NOT EXISTS` for new tables (idempotent)
2. `ALTER TABLE ... ADD COLUMN` wrapped in `try/catch` for additive column additions
3. One-time data migrations gated by `app_meta` flags (e.g. `mapping_backfill_done`)

---

## Key Conventions

- **Month/year filtering**: passed as query params `?month=N&year=N`; backend extracts via `req.query`
- **Category reorder**: POST `/categories/reorder` with `{ ids: number[] }` — backend updates `sort_order` in provided order
- **Copy categories**: POST `/categories/copy` with `{ fromMonth, fromYear, toMonth, toYear }` — copies names/budgets/colors, resets sort_order
- **Rent-out settlement**: `log-settlement` records lump payments in `rent_out_settlements`; separate from per-entry `amount_returned`
- **Asset value**: `current_value` is derived = `base_value` + `SUM` of all savings entries from instruments mapped to this asset via `asset_id`; `base_value` holds the non-savings portion
- **Expense formula**: `expenses.formula` stores the raw expression string; `amount` stores the evaluated result
- **Auth**: JWT stored as httpOnly cookie `session`; 30-day expiry; WebAuthn (passkeys) supported as second login method; `webauthn_enabled` flag per user
- **Currency**: All amounts in INR (₹); formatted with `en-IN` locale

## Frontend Libraries

- **React 19** + **React Router v7**
- **Tailwind CSS v4** (via `@tailwindcss/vite`)
- **Recharts** — all charts (AreaChart, BarChart, LineChart)
- **@xyflow/react** — money flow diagram on Dashboard
- **lucide-react** — icons
- **@simplewebauthn/browser** — passkey registration/login on client

## Environment Variables (backend)

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | HTTP listen port |
| `ORIGIN` | `http://localhost:5173` | CORS allowed origin + WebAuthn expected origin |
| `RP_ID` | `localhost` | WebAuthn relying party ID (domain without protocol/port) |
| `NODE_ENV` | — | `production` sets `secure` flag on session cookie |

---

## Notes for AI Agents

- No test suite. Do not generate test files unless asked.
- No git history. This is a local-only app with no CI.
- Once a task is done, inform the user. **Do not run the dev server or browser to verify** — user validates UI.
- `frontend/src/api.ts` is the canonical place for both API calls and TypeScript types. Add new types/calls here, not in page files.
- When adding a new domain: create `backend/src/routes/<domain>.ts`, add table(s) in `db.ts`, mount in `index.ts` (apply `requireAuth` before the router), add API functions + types to `frontend/src/api.ts`, create `frontend/src/pages/<Domain>.tsx`, add route in `App.tsx`, add nav link in `Layout.tsx`.
- Schema changes: always use the try/catch `ALTER TABLE` pattern for additive changes; never drop or rename columns.
