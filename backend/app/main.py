from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base
from app.routers import auth, customers

# Create PostgreSQL tables on startup if connected
try:
    Base.metadata.create_all(bind=engine)
except Exception as e:
    print(f"PostgreSQL Table Creation Warning (Database connection pending startup): {e}")

app = FastAPI(
    title="Customer Management REST API",
    description="Backend Python REST API for Customer Management using PostgreSQL",
    version="1.0.0"
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth.router)
app.include_router(customers.router)

@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Customer Management REST API is running",
        "database": "PostgreSQL",
        "docs_url": "/docs"
    }

@app.get("/api/health")
def health_check():
    return {"status": "ok"}
