FROM python:3.13-slim

RUN pip install pdm

WORKDIR /app

COPY pyproject.toml pdm.lock* ./
RUN pdm lock && pdm export -o requirements.txt && pip install -r requirements.txt

COPY . .

RUN chmod +x backend-entrypoint.sh frontend-entrypoint.sh
