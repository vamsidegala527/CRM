from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import auth, customers, users

try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"PostgreSQL Table Creation Warning: {e}")

app = FastAPI(
    title="Customer Management REST API (RBAC Enabled)",
    description="Backend Python REST API with Role-Based Access Control (Admin vs Normal User) and PostgreSQL Database",
    version="1.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router)
app.include_router(customers.router)
app.include_router(users.router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Customer Management REST API (RBAC Enabled) is running",
        "database": "PostgreSQL",
        "rbac": "Admin & User roles enforced",
        "docs_url": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
