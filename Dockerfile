FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend ./
RUN npm run build

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN pip install --no-cache-dir uv

COPY backend/pyproject.toml ./backend/pyproject.toml
RUN uv pip install --system --no-cache-dir "fastapi==0.115.0" "uvicorn[standard]==0.30.6"

COPY backend ./backend
COPY --from=frontend-builder /app/frontend/out ./frontend/out

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
