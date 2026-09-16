FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app

# Seed database and start FastAPI server respecting dynamic platform PORT
CMD sh -c "python -m app.seed ; python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --no-server-header"

