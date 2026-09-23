FROM node:24-alpine AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend ./
RUN npm run build

FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.12.18 /uv /usr/local/bin/uv

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    PATH="/app/backend/.venv/bin:$PATH"

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN uv sync --project backend --frozen --no-dev

COPY backend ./backend
COPY --from=frontend-builder /app/frontend/out ./frontend/out

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
