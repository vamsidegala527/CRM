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

IS_PROD = (
    os.getenv("ENVIRONMENT", "").lower() in ("production", "prod") or
    os.getenv("RENDER", "").lower() == "true" or
    os.getenv("DISABLE_DOCS", "false").lower() == "true"
)

app = FastAPI(
    title="Customer Management REST API",
    description="Backend Python REST API for Customer Management with Admin Authentication and PostgreSQL",
    version="1.2.0",
    docs_url=None if IS_PROD else "/docs",
    redoc_url=None if IS_PROD else "/redoc",
    openapi_url=None if IS_PROD else "/openapi.json"
)

# 1. Security Headers Middleware (OWASP defensive controls: HSTS, CSP, XSS, framing, and fingerprint stripping)
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    response = await call_next(request)
    
    # Defensive security headers
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none';"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=(), payment=()"

    # Strip technology and framework fingerprinting headers
    for h in ["server", "Server", "x-powered-by", "X-Powered-By"]:
        if h in response.headers:
            del response.headers[h]

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
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https?://.*\.onrender\.com$|^https?://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router)
app.include_router(customers.router)

@app.get("/")
def read_root():
    data = {
        "status": "online",
        "message": "Customer Management REST API is running",
        "database": "PostgreSQL",
        "auth": "Authentication Required"
    }
    if not IS_PROD:
        data["docs_url"] = "/docs"
    return data

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
