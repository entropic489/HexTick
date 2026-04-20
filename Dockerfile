FROM python:3.13-slim

RUN pip install pdm

WORKDIR /app

COPY pyproject.toml pdm.lock* ./
RUN pdm install --no-self

COPY . .
