# HR & Employee Management Portal

A modern, production-grade HR & Employee Management Portal built with FastAPI, Next.js, PostgreSQL, and Nexus AI. Designed for enterprise workforce administration with role-based access control (RBAC), employee self-service, secure onboarding invitations, and natural language workforce analytics.

---

## Architecture Overview

```
Frontend (Next.js 14 / React 18 / TypeScript / Tailwind-free Glassmorphic Design System)
       │
       ▼ REST API (HTTP / JSON / JWT Auth / HttpOnly Cookies)
Backend (Python FastAPI / SQLAlchemy / Pydantic / Passlib Bcrypt / PyJWT)
       │
       ├──► Nexus AI Assistant (Vercel AI SDK / Google Gemini / Groq)
       │
       ▼ Database Driver (psycopg2-binary)
PostgreSQL Database (Users & Employee Profiles with strict RBAC)
```

---

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Vanilla CSS Design System (Sleek Dark Mode, Glassmorphism, Micro-animations)
- **Backend**: Python 3.11, FastAPI, Pydantic, SQLAlchemy, Passlib (Bcrypt), PyJWT
- **AI Copilot**: Nexus AI workforce assistant with tool execution for HR directory search, profile updates, and real-time metrics
- **Database**: PostgreSQL 16 (relational schema with automated database synchronization)
- **Security**: Strict Role-Based Access Control (Admin / Employee), cryptographic onboarding tokens, CSRF protection, OWASP security headers

---

## Key Features

### 1. Role-Based Access Control (RBAC)

- **HR / Admin**:
  - Full employee lifecycle management: onboard, inspect, edit, deactivate, reactivate, and permanently delete staff.
  - Granular directory search, multi-field filtering (department, job title, role, status), and server-side pagination.
  - Onboarding setup invitation links sent via SMTP with cryptographically secure single-use tokens.
  - Interactive workforce metrics dashboard (total headcount, active staff, onboarding pending, departments count).
- **Employee**:
  - Secure self-service profile inspection and updates (phone, address, emergency contact notes).
  - Restricted view preventing unauthorized modifications to roles, departments, or administrative records.
  - Guided first-time account setup flow with credential configuration and onboarding wizard.

### 2. Employee Directory & Profile Management

- High-performance interactive workforce directory with live search and status badges.
- Detailed employee profile drawer with contact information, department classification, and onboarding status.
- Modal dialogues for onboarding new staff, modifying employment details, and confirming lifecycle state transitions.

### 3. Nexus AI Workforce Assistant

- Embedded AI copilot accessible from any dashboard page.
- Direct tool integration for querying employee metrics, searching workforce records, and managing staff profiles using natural language.
- Real-time action cards and confirmation dialogues for sensitive actions.

---

## Quick Start (Docker Compose)

### 1. Launch All Services

```bash
docker compose up -d --build
```

### 2. Access the Applications

- **Frontend Portal**: [http://localhost:3000](http://localhost:3000)
- **Backend REST API**: [http://localhost:8000](http://localhost:8000)
- **Interactive API Documentation (Docs)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Environment Configuration

Key configuration parameters can be set in `backend/.env` or passed via environment variables:

| Variable                      | Description                                                                               | Default                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`                | PostgreSQL connection string                                                              | `postgresql://postgres:postgrespassword@localhost:5432/hr_db` |
| `SECRET_KEY`                  | JWT encryption secret                                                                     | Production-grade secret key                                   |
| `ALGORITHM`                   | JWT signing algorithm                                                                     | `HS256`                                                       |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session validity in minutes                                                               | `1440` (24 hours)                                             |
| `BREVO_API_KEY`               | Brevo REST API Key (`xkeysib-...`)                                                        | None                                                          |
| `BREVO_SENDER_EMAIL`          | Verified sender email address in Brevo                                                    | None                                                          |
| `BREVO_SENDER_NAME`           | Display name on outbound emails                                                           | `HR & Employee Management Portal`                             |
| `FRONTEND_URL`                | Frontend origin for onboarding links                                                      | `http://localhost:3000`                                       |

For production deployments on Render, configure `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, and `BREVO_SENDER_NAME` in the Render dashboard environment variables. Outbound emails are dispatched via the Brevo HTTPS REST API on port 443, ensuring 100% reliable delivery on cloud hosts.

---

## Verification & Testing

Run the backend test suite:

```bash
docker compose exec backend pytest
```

Run frontend security regression suite:

```bash
docker compose exec frontend npm test
```
