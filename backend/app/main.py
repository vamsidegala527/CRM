import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, sync_db_schema
from app.routers import auth, customers

try:
    Base.metadata.create_all(bind=engine)
    sync_db_schema()
except Exception as e:
    print(f"PostgreSQL Table Creation Warning: {e}")

app = FastAPI(
    title="Customer Management REST API",
    description="Backend Python REST API for Customer Management with Admin Authentication and PostgreSQL",
    version="1.2.0"
)

# 1. Security Headers Middleware (OWASP defensive controls)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    return response

# 2. Strict CORS Configuration
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "")
if allowed_origins_env:
    allowed_origins = [origin.strip() for origin in allowed_origins_env.split(",") if origin.strip()]
else:
    allowed_origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost",
        "http://frontend:3000",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router)
app.include_router(customers.router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Customer Management REST API is running",
        "database": "PostgreSQL",
        "auth": "Admin Authentication Required",
        "docs_url": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
