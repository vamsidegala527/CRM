# Basic Customer Management Web Application (PostgreSQL Dedicated)

A simple, production-ready Customer Management web application built from scratch. This application serves as the foundation for managing customer data and will later be extended with AI capabilities.

## Architecture Overview

```
Frontend (Next.js / React / TypeScript)
       │
       ▼ REST API (HTTP / JSON / JWT Auth)
Backend (Python FastAPI / Pydantic / Passlib / SQLAlchemy)
       │
       ▼ Database Driver (psycopg2-binary)
PostgreSQL Database (users & customers relational tables)
```

---

## Tech Stack

- **Frontend**: Next.js (React), TypeScript, Custom CSS Design System (Dark mode & Glassmorphism)
- **Backend**: Python (FastAPI), Pydantic validation, Passlib bcrypt hashing, PyJWT authentication
- **Database**: PostgreSQL (Docker container / local PostgreSQL instance)
- **API**: RESTful API with Swagger / OpenAPI UI at `/docs`
- **Version Control**: Git

---

## Features

1. **User Authentication**:
   - Register new user accounts.
   - Secure login with JWT Access Tokens.
   - Demo account preset (`admin@example.com` / `admin123`).

2. **Customer CRUD Operations**:
   - **View Customers**: High-performance interactive data table with status badges and details inspector.
   - **Add Customer**: Modal dialog to create new customer records with validation.
   - **Edit Customer**: Update existing customer details (Name, Email, Phone, Company, Address, Status, Notes).
   - **Delete Customer**: Modal confirmation prompt before permanent deletion.
   - **Search & Filter**: Real-time full-text search (Name, Email, Company, Phone) and Status filtering.
   - **Pagination**: Server-side pagination support.

3. **Customer Data Fields**:
   - Name, Email, Phone, Company, Address, Status (`Active`, `Lead`, `Prospect`, `Inactive`), Notes, Created At, Updated At.

---

## Getting Started: Step-by-Step Guide

### Step 1: Start PostgreSQL Database

Run PostgreSQL via Docker Compose:
```bash
docker compose up -d
```
*Or ensure your local PostgreSQL server is running on port 5432 with database name `customer_db`.*

---

### Step 2: Set Up & Run Python Backend

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create and activate a Python virtual environment:
```bash
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
```

3. Install requirements:
```bash
pip install -r requirements.txt
```

4. Seed initial database records (Admin user & sample customers):
```bash
python app/seed.py
```

5. Launch FastAPI server:
```bash
python -m uvicorn app.main:app --reload --port 8000
```
*Backend API docs will be available at: `http://localhost:8000/docs`*

---

### Step 3: Set Up & Run Next.js Frontend

1. Open a new terminal and navigate to the frontend directory:
```bash
cd frontend
```

2. Install Node dependencies:
```bash
npm install
```

3. Start the Next.js development server:
```bash
npm run dev
```
*Frontend application will be accessible at: `http://localhost:3000`*

---

## Backend REST API Reference

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user | No |
| `POST` | `/api/auth/login` | Login and acquire JWT token | No |
| `GET` | `/api/auth/me` | Fetch logged-in user details | Yes |
| `GET` | `/api/customers` | List customers (with search & filter) | Yes |
| `GET` | `/api/customers/{id}` | Get customer by ID | Yes |
| `POST` | `/api/customers` | Create a new customer | Yes |
| `PUT` | `/api/customers/{id}` | Update existing customer | Yes |
| `DELETE` | `/api/customers/{id}` | Delete customer by ID | Yes |

---

## Git Version Control Setup

Initialize your Git repository:
```bash
git init
git add .
git commit -m "Initial commit: Basic Customer Management Web Application with FastAPI & PostgreSQL"
```
