# Options Flow Forecast (MVP)

End-to-end MVP that ingests options flow (CSV or screenshot), parses/structures it, engineers features, and returns a probabilistic forecast with key levels.

## Stack
- Backend: FastAPI + SQLModel (Postgres via `DATABASE_URL`)
- ML: scikit-learn (baseline)
- Storage: local (MVP) with S3 interface stub
- Frontend: Next.js (upload + results)

## Quick start (backend)
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
```

## Endpoints
- `POST /ingest/flow` (multipart): CSV or screenshot
- `POST /ingest/chart` (multipart): premarket chart screenshot
- `POST /analyze` (JSON): `{symbol, date, flow_upload_id, chart_upload_id}`
- `POST /feedback` (JSON): `{analysis_id, correct, notes}`

## JSON contract
See `contracts/analysis_response.json`.

## Tests
```bash
cd backend
pytest
```

## Notes
- The system is **educational**. It does not provide financial advice.
- If data is missing, the API returns `status = "needs_more_data"`.
- For image extraction, set `OPENAI_API_KEY` in `.env`.

## Frontend (MVP)
See `frontend/` for a minimal Next.js UI.
