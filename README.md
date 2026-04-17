# Job Hunt CRM

Full-stack local web service for search workflows, presets, cover letters, logs, and controlled bulk apply simulation.

## What's inside
- `frontend/` — static pink kawaii SPA
- `backend/` — FastAPI API with JSON persistence and background bulk-apply runner
- `docker-compose.yml` — run both services together

## Run with Docker
```bash
docker compose up --build
```

Frontend: http://localhost:5173  
Backend docs: http://localhost:8000/docs

## Run locally without Docker
### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
python -m http.server 5173
```

## Notes
The service works end-to-end out of the box in built-in demo mode.
This build includes a fully working frontend and backend with:
- profiles and resumes switching
- search with filters and query preview
- simple and advanced Boolean views
- results list with selection
- target-success bulk apply simulation
- live run progress and logs
- editable and savable cover letters

The hh-applicant-tool integration layer is not wired to real hh commands in this build. Right now the service is fully functional in demo mode and structurally ready to be connected to a real CLI adapter next.
