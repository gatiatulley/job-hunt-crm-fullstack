from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .data_store import store
from .schemas import (
    LetterUpdateRequest,
    ProfileActivateRequest,
    QueryPreviewRequest,
    ResumeActivateRequest,
    SearchRequest,
    StartRunRequest,
)
from .services import active_profile, active_resume, build_query, default_letter, filter_vacancies, start_run

app = FastAPI(title="Job Hunt CRM API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/context")
def context():
    data = store.get()
    return {
        "profile": active_profile(data),
        "resume": active_resume(data),
        "letter": default_letter(data),
        "session": "active",
    }


@app.get("/api/profiles")
def get_profiles():
    return store.get()["profiles"]


@app.post("/api/profiles/activate")
def activate_profile(payload: ProfileActivateRequest):
    def updater(data):
        found = False
        for profile in data["profiles"]:
            profile["is_active"] = profile["id"] == payload.profile_id
            if profile["is_active"]:
                found = True
        if not found:
            raise HTTPException(status_code=404, detail="Profile not found")
        return active_profile(data)
    return store.update(updater)


@app.get("/api/resumes")
def get_resumes():
    return store.get()["resumes"]


@app.post("/api/resumes/activate")
def activate_resume(payload: ResumeActivateRequest):
    def updater(data):
        found = False
        for resume in data["resumes"]:
            resume["is_active"] = resume["id"] == payload.resume_id
            if resume["is_active"]:
                found = True
        if not found:
            raise HTTPException(status_code=404, detail="Resume not found")
        return active_resume(data)
    return store.update(updater)


@app.get("/api/letters")
def get_letters():
    return store.get()["letters"]


@app.put("/api/letters/{letter_id}")
def update_letter(letter_id: str, payload: LetterUpdateRequest):
    def updater(data):
        target = None
        for letter in data["letters"]:
            if payload.is_default:
                letter["is_default"] = False
            if letter["id"] == letter_id:
                target = letter
        if target is None:
            raise HTTPException(status_code=404, detail="Letter not found")
        target["name"] = payload.name
        target["content"] = payload.content
        target["is_default"] = payload.is_default
        return target
    return store.update(updater)


@app.get("/api/search/presets")
def get_presets():
    return store.get()["presets"]


@app.post("/api/search/query-preview")
def query_preview(payload: QueryPreviewRequest):
    built, readable = build_query(payload.or_terms, payload.and_terms, payload.not_terms, payload.query)
    return {"built_query": built, "human_readable": readable}


@app.post("/api/search/vacancies")
def search_vacancies(payload: SearchRequest):
    data = store.get()
    built, readable = build_query(payload.or_terms, payload.and_terms, payload.not_terms, payload.query)
    terms = list(dict.fromkeys(payload.or_terms + payload.and_terms + [payload.query] if payload.query else payload.or_terms + payload.and_terms))
    results = filter_vacancies(data, payload.filters.model_dump(), terms)
    return {
        "built_query": built,
        "human_readable": readable,
        "vacancies": results,
    }


@app.post("/api/apply/start")
def apply_start(payload: StartRunRequest):
    return start_run(
        mode=payload.mode,
        target_success=payload.target_success,
        max_attempts=payload.max_attempts,
        selected_vacancy_ids=payload.selected_vacancy_ids,
        dry_run=payload.dry_run,
        preset_name=payload.preset_name,
    )


@app.get("/api/apply/runs")
def get_runs():
    return store.get()["runs"]


@app.get("/api/apply/runs/{run_id}")
def get_run(run_id: str):
    data = store.get()
    run = next((r for r in data["runs"] if r["id"] == run_id), None)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found")
    return run
