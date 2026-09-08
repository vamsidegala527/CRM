FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONPATH=/app

# Seed database and start FastAPI server on 0.0.0.0:8000
CMD python -m app.seed && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
