# EAQ — Evaluator Assignment Queue (Fair Distribution)

A production-ready system for fairly distributing answer sheet evaluations to evaluators using a 3-rule engine: **Round-Robin cycling**, **Capacity limits**, and **Due-date priority**. 

---

## Team & Roles

| Member  | Role                       | Responsibilities                                         |
| ------- | -------------------------- | -------------------------------------------------------- |
| Aditya  | Scrum Master / Lead        | Architecture, sprint planning, code reviews              |
| Praket  | Backend Developer          | Express.js API, assignment engine, database queries       |
| Namami  | Frontend Developer         | Next.js UI, CSS design system, Chart.js dashboard         |
| Ajar    | Database Engineer          | Prisma schema, migrations, seed scripts, query optimization |
| Vineet  | QA + Product Coordinator   | Jest tests, Postman collection, acceptance criteria        |

---

## Tech Stack

| Layer     | Technology                                                        |
| --------- | ----------------------------------------------------------------- |
| Frontend  | Next.js 14 (App Router), Vanilla CSS (BEM), Chart.js, TanStack Query v5, Sonner |
| Backend   | Node.js 20, Express.js, Zod, Multer, JWT, bcrypt                  |
| Database  | MySQL 8.x, Prisma ORM                                             |
| Testing   | Jest, Postman                                                      |
| CI/CD     | GitHub Actions                                                     |
| Deploy    | Vercel (frontend), Railway (backend + DB)                          |

---

## Architecture

```mermaid
graph LR
    subgraph Frontend ["Frontend (Vercel)"]
        A["Next.js 14<br/>App Router"] --> B["TanStack Query v5"]
        A --> C["Vanilla CSS<br/>BEM Design System"]
        A --> D["Chart.js"]
    end

    subgraph Backend ["Backend (Railway)"]
        E["Express.js<br/>Node 20 LTS"] --> F["JWT + bcrypt<br/>Auth"]
        E --> G["Zod<br/>Validation"]
        E --> H["Assignment<br/>Engine"]
        E --> I["Multer<br/>PDF Upload"]
    end

    subgraph Database ["Database (Railway)"]
        J["MySQL 8.x"] --> K["Prisma ORM"]
    end

    A -- "REST API<br/>Bearer JWT" --> E
    E -- "Prisma Client" --> J

    style Frontend fill:#eef2ff,stroke:#6366f1,stroke-width:2px
    style Backend fill:#f0fdf4,stroke:#22c55e,stroke-width:2px
    style Database fill:#fef3c7,stroke:#f59e0b,stroke-width:2px
```

---

## Frontend Design System

The frontend uses a **custom vanilla CSS design system** built from scratch — no Tailwind, no shadcn/ui, no CSS frameworks.

### Design Tokens
- **Typography**: Fraunces (display/headings) + DM Sans (body) via Google Fonts
- **Color palette**: Warm stone base + deep ink dark + electric amber accent
- **Spacing**: 4px grid system (4, 8, 12, 16, 24, 32, 48, 64)
- **Radii**: sm (6px), md (8px), lg (12px), xl (16px), full (9999px)

### Themes
- **Light mode**: Warm parchment background (#F5F3EF), cream cards, amber accent (#C97D0A)
- **Dark mode**: Deep ink background (#100F0D), charcoal cards, golden amber accent (#E8A832)
- Toggle persists via `localStorage`, flash-prevented with inline `<script>`

### CSS Architecture
```
frontend/styles/
├── tokens.css              ← CSS custom properties (design tokens)
├── reset.css               ← Modern CSS reset + reduced motion + focus-visible
├── themes.css              ← Light/dark theme color definitions
├── base.css                ← Typography, scrollbar, selection, sr-only
├── layout.css              ← Page shell, grid system, containers
├── animations.css          ← Keyframes: fade, slide, spin, shimmer, shake
├── morphisms.css           ← Glassmorphism, neumorphism, skeuomorphism
├── print.css               ← Print stylesheet
└── components/
    ├── buttons.css          ├── inputs.css
    ├── badges.css           ├── navigation.css
    ├── cards.css            ├── tables.css
    ├── skeletons.css        ├── toasts.css
    ├── login.css            ├── charts.css
    └── scroll.css
```

### Accessibility (WCAG AA)
- All text meets **4.5:1 contrast ratio** (AA minimum)
- Custom **focus-visible** rings on all interactive elements (amber outline, not browser default)
- **ARIA attributes**: `aria-invalid`, `aria-describedby`, `aria-live`, `aria-modal`, `role="dialog"`, `role="progressbar"`, `role="alert"`
- **Keyboard navigation**: Tab order logical, modal focus trap (Tab cycle, Escape close, focus restore), upload zone keyboard-accessible
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` disables all animations
- **Semantic HTML**: `<nav>`, `<main>`, `<header>`, `<footer>`, `<section>`, `<article>`, `<aside>`, `<time>`

### Performance
- **CSS containment**: `contain: layout style` on heavy components
- **Skeleton loading**: Shimmer skeletons for all async sections (no blank space, no spinners for content)
- **rAF-throttled** scroll handlers (~16ms)
- **Font loading**: `font-display: swap`
- **No layout shifts**: Charts use `aspect-ratio` with `min-height`
- **Back-to-top button** + scroll progress bar

---

## Database Schema (MySQL 8.x)

```
Table users {
  id varchar [pk]
  email varchar [unique, not null]
  password_hash varchar [not null]
  role Role [not null]              // 'coordinator' | 'evaluator'
  created_at timestamp [default: now()]
}

Table evaluators {
  id varchar [pk]
  user_id varchar [unique, not null, ref: - users.id]
  name varchar [not null]
  is_active boolean [default: true]
}

Table answer_sheets {
  id varchar [pk]
  filename varchar [not null]
  pdf_url varchar [not null]
  due_date timestamp [not null]
  status SheetStatus [not null, default: 'unassigned']
  uploaded_at timestamp [default: now()]
}

Table assignments {
  id varchar [pk]
  sheet_id varchar [unique, not null, ref: - answer_sheets.id]
  evaluator_id varchar [not null, ref: > evaluators.id]
  assigned_at timestamp [default: now()]
  started_at timestamp
  submitted_at timestamp
}

Table evaluator_capacities {
  id varchar [pk]
  evaluator_id varchar [unique, not null, ref: - evaluators.id]
  max_sheets int [not null]
  current_count int [not null, default: 0]
}
```

---

## Quick Start

### Prerequisites

- Node.js ≥ 20.x
- MySQL 8.x running locally (or a connection string to a remote instance)
- Git

### 1. Clone the Repository

```bash
git clone https://github.com/adishri2005/eval-assignment-queue-.git
cd eval-assignment-queue-
```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Copy environment file and fill in your values
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET at minimum

# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate deploy

# Seed the database (idempotent — safe to run multiple times)
npx prisma db seed

# Start the development server
npm run dev
```

The backend will be running at `http://localhost:3001`.

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```

The frontend will be running at `http://localhost:3000`.

### 4. Login

| Role        | Email                    | Password  |
| ----------- | ------------------------ | --------- |
| Coordinator | coordinator@example.com    | Coord@123 |
| Evaluator 1 | evaluator1@example.com     | Eval@123  |
| Evaluator 2 | evaluator2@example.com     | Eval@123  |
| Evaluator 3 | evaluator3@example.com     | Eval@123  |

---

## Pages

### Login Page
- Split-layout with warm parchment background and floating orb decorations
- Zod validation with inline error messages
- Auto-redirect if already authenticated
- Demo credentials displayed in hint box

### Coordinator Dashboard
- **Trigger Assignment** — one-click fair distribution of unassigned sheets
- **Upload Answer Sheet** — drag-and-drop PDF upload with optional due date
- **Metric Cards** — Total Sheets, Assigned, In Progress, Submitted (4-column responsive grid)
- **Completion Rate Chart** — Chart.js bar chart (theme-aware, updates colors on toggle)
- **Evaluator Breakdown Table** — per-evaluator stats with progress bars
- Auto-refetches every 30 seconds via TanStack Query

### Evaluator Queue
- Personal assignment queue as a responsive data table
- **Start** button to begin evaluation (status → `in_progress`)
- **Submit** button with confirmation dialog (accessible modal with focus trap)
- Optimistic updates for instant feedback
- Empty state with illustration when no sheets assigned

---

## API Reference

| Method  | Endpoint                   | Auth             | Description                                          |
| ------- | -------------------------- | ---------------- | ---------------------------------------------------- |
| `POST`  | `/api/auth/login`          | Public           | Authenticate user, returns JWT token + role           |
| `POST`  | `/api/assign`              | Coordinator only | Trigger the fair distribution assignment engine       |
| `GET`   | `/api/queue/:evaluatorId`  | Evaluator (own)  | Get the evaluator's personal assignment queue         |
| `PATCH` | `/api/sheet/:id/status`    | Evaluator (own)  | Update sheet status to `in_progress` or `submitted`   |
| `GET`   | `/api/dashboard/stats`     | Coordinator only | Get per-evaluator completion statistics               |
| `POST`  | `/api/upload`              | Coordinator only | Upload a PDF answer sheet (multipart/form-data)       |
| `GET`   | `/health`                  | Public           | Health check endpoint                                 |

---

## Assignment Engine Logic

The engine distributes unassigned answer sheets to evaluators fairly:

1. **Fetch unassigned sheets** — `SELECT * FROM answer_sheets WHERE status = 'unassigned' ORDER BY due_date ASC, uploaded_at ASC`
2. **Fetch evaluators with capacity** — Load all active evaluators with their `max_sheets` and `current_count`
3. **Filter full evaluators** — Remove any evaluator where `current_count >= max_sheets`
4. **Round-robin assignment** — Iterate through sorted sheets, assigning each to the next available evaluator in rotation. Skip evaluators who reach capacity during the batch.
5. **Atomic write** — Use a Prisma `$transaction` to atomically:
   - Create `Assignment` records
   - Update `AnswerSheet.status` to `assigned`
   - Increment `EvaluatorCapacity.current_count`

This guarantees no partial assignments if the transaction fails.

---

## Running Tests

### Unit Tests (Jest)

```bash
cd backend
npm test
```

### With Coverage Report

```bash
npm test -- --coverage
```

### Test Scenarios Covered

- ✅ Round-robin distributes sheets equally
- ✅ Remainder is distributed fairly (max diff ≤ 1)
- ✅ Capacity-full evaluators are skipped
- ✅ All-at-capacity throws descriptive error
- ✅ Current count is incremented correctly
- ✅ Most urgent sheets (earliest due date) assigned first
- ✅ FIFO ordering for same due date
- ✅ Empty sheets returns error
- ✅ Single evaluator works correctly
- ✅ Transaction rollback prevents partial state

### API Tests (Postman)

Import `docs/postman_collection.json` into Postman:

1. Set `{{baseUrl}}` to `http://localhost:3001`
2. Run "Login as Coordinator" — auto-sets `{{coordinatorToken}}`
3. Run "Login as Evaluator" — auto-sets `{{evaluatorToken}}` and `{{evaluatorId}}`
4. Run all requests in sequence

---

## Project Structure

```
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma        ← Database schema (MySQL)
│   │   ├── migrations/          ← Prisma migration files
│   │   └── seed.js              ← Database seed script
│   ├── src/
│   │   ├── server.js            ← Express entry point
│   │   ├── routes/              ← API route handlers
│   │   ├── middleware/          ← Auth middleware (JWT)
│   │   └── services/           ← Assignment engine logic
│   ├── tests/                   ← Jest unit tests
│   ├── uploads/                 ← PDF upload directory
│   ├── .env.example             ← Environment template
│   └── package.json
│
├── frontend/
│   ├── app/
│   │   ├── globals.css          ← CSS import manifest
│   │   ├── layout.tsx           ← Root layout + theme script
│   │   ├── page.tsx             ← Login page
│   │   ├── providers.tsx        ← TanStack Query provider
│   │   ├── coordinator/
│   │   │   └── page.tsx         ← Coordinator dashboard
│   │   └── evaluator/
│   │       └── [id]/
│   │           └── page.tsx     ← Evaluator queue
│   ├── components/
│   │   ├── CompletionChart.tsx   ← Chart.js bar chart (theme-aware)
│   │   ├── ScrollExperience.tsx  ← Scroll progress + back-to-top
│   │   └── ProtectedRoute.tsx    ← Auth guard component
│   ├── contexts/
│   │   └── AuthContext.tsx       ← JWT auth state management
│   ├── lib/
│   │   ├── api.ts               ← Typed API client
│   │   └── theme.ts             ← Theme toggle + persistence
│   ├── styles/                   ← Complete CSS design system (see above)
│   ├── next.config.js
│   └── package.json
│
├── docs/
│   └── postman_collection.json   ← Postman API test collection
│
└── README.md
```

---

## Deployment

### Frontend → Vercel

1. Connect your GitHub repo to [Vercel](https://vercel.com)
2. Set the root directory to `frontend`
3. Add environment variable: `NEXT_PUBLIC_API_URL` = your Railway backend URL
4. Deploy — Vercel auto-detects Next.js 14

### Backend + Database → Railway

1. Create a new project on [Railway](https://railway.app)
2. Add a **MySQL** plugin — copy the connection string
3. Add a **Node.js** service pointing to your GitHub repo
4. Set environment variables:
   - `DATABASE_URL` = MySQL connection string from step 2
   - `JWT_SECRET` = a long random string
   - `PORT` = 3001
   - `CORS_ORIGIN` = your Vercel frontend URL
5. Railway will use `railway.toml` for build and deploy configuration

---

## Sprint 1 Deliverables

- [x] Database schema (5 tables, Prisma ORM, MySQL)
- [x] Initial migration + seed script
- [x] JWT authentication (login endpoint)
- [x] Assignment engine (round-robin + capacity + due-date)
- [x] Evaluator queue API (GET with ownership check)
- [x] Sheet status updates (PATCH with state machine)
- [x] Coordinator dashboard API (aggregated stats)
- [x] PDF upload (Multer)
- [x] Frontend — Login page (accessible, Zod validation)
- [x] Frontend — Coordinator dashboard (Chart.js + upload + assign + skeletons)
- [x] Frontend — Evaluator queue (table + modal + optimistic updates)
- [x] Custom CSS design system (BEM, light/dark themes, morphisms)
- [x] WCAG AA accessibility (ARIA, keyboard, focus, contrast)
- [x] Chart.js integration (theme-aware bar chart)
- [x] Scroll experience (progress bar + back-to-top)
- [x] Print stylesheet
- [x] Jest unit tests (12 scenarios)
- [x] Postman collection (all endpoints)
- [x] CI/CD pipeline (GitHub Actions)
- [x] Deployment configs (Vercel + Railway)

---

## Environment Variables

### Backend (`backend/.env`)

```env
DATABASE_URL="mysql://root:password@localhost:3306/eaq_db"
JWT_SECRET="your-secret-key-here"
PORT=3001
CORS_ORIGIN="http://localhost:3000"
```

### Frontend (`frontend/.env.local`)

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

## License

Internal project — Xebia Summer Internship 2026.
