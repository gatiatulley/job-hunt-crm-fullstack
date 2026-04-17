from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime
from typing import Any

from .data_store import store


RUN_THREADS: dict[str, threading.Thread] = {}


def active_profile(data: dict[str, Any]) -> dict[str, Any]:
    return next((p for p in data["profiles"] if p["is_active"]), data["profiles"][0])


def active_resume(data: dict[str, Any]) -> dict[str, Any]:
    return next((r for r in data["resumes"] if r["is_active"]), data["resumes"][0])


def default_letter(data: dict[str, Any]) -> dict[str, Any]:
    return next((l for l in data["letters"] if l["is_default"]), data["letters"][0])


def build_query(or_terms: list[str], and_terms: list[str], not_terms: list[str], query: str = "") -> tuple[str, str]:
    parts: list[str] = []
    readable: list[str] = []
    if query.strip():
        parts.append(query.strip())
        readable.append(query.strip())
    if or_terms:
        parts.append(f"({' OR '.join(or_terms)})")
        readable.append(f"подойдёт: {', '.join(or_terms)}")
    if and_terms:
        parts.append(" AND ".join(and_terms))
        readable.append(f"обязательно: {', '.join(and_terms)}")
    built = " AND ".join([p for p in parts if p])
    if not_terms:
        built += f" NOT ({' OR '.join(not_terms)})"
        readable.append(f"исключить: {', '.join(not_terms)}")
    return built.strip(), " • ".join(readable)


def filter_vacancies(data: dict[str, Any], filters: dict[str, Any], terms: list[str]) -> list[dict[str, Any]]:
    excluded = [x.strip().lower() for x in filters.get("excluded", "").split(",") if x.strip()]
    results = []
    for vacancy in data["vacancies"]:
        haystack = " ".join([
            vacancy["title"], vacancy["company"], vacancy["format"], vacancy["location"], vacancy["snippet"]
        ]).lower()
        if terms and not any(term.lower() in haystack for term in terms):
            continue
        if filters.get("location") and filters["location"].lower() not in vacancy["location"].lower() and filters["location"].lower() not in haystack:
            continue
        if filters.get("format"):
            allowed = [part.strip().lower() for part in filters["format"].replace("/", ",").split(",") if part.strip()]
            if allowed and not any(part in vacancy["format"].lower() for part in allowed):
                continue
        if excluded and any(term in haystack for term in excluded):
            continue
        results.append(vacancy)
    return results


def _run_worker(run_id: str) -> None:
    while True:
        should_stop = store.update(lambda data: _advance_run(data, run_id))
        if should_stop:
            break
        time.sleep(0.8)


def _advance_run(data: dict[str, Any], run_id: str) -> bool:
    run = next((r for r in data["runs"] if r["id"] == run_id), None)
    if not run or run["status"] != "running":
        return True

    queue = run["queue"]
    processed_ids = {e["vacancy_id"] for e in run["events"]}
    pending = [v for v in queue if v["id"] not in processed_ids]

    if run["mode"] == "target":
        if run["success"] >= run["target_success"] or run["attempts"] >= run["max_attempts"] or not pending:
            run["status"] = "completed"
            run["finished_at"] = datetime.utcnow().isoformat()
            return True
    else:
        if run["attempts"] >= run["max_attempts"] or not pending:
            run["status"] = "completed"
            run["finished_at"] = datetime.utcnow().isoformat()
            return True

    vacancy = pending[0]
    run["attempts"] += 1

    success_pattern = (run["attempts"] % 3) != 0
    event_status = "success" if success_pattern else "failed"
    if run["dry_run"]:
        event_status = "skipped"

    if event_status == "success":
        run["success"] += 1
    elif event_status == "failed":
        run["failed"] += 1
    else:
        run["skipped"] += 1

    run["current_vacancy"] = vacancy["title"]
    run["events"].append({
        "vacancy_id": vacancy["id"],
        "title": vacancy["title"],
        "company": vacancy["company"],
        "status": event_status,
        "message": "Dry run" if run["dry_run"] else ("Отклик отправлен" if event_status == "success" else "Отклик не принят"),
        "created_at": datetime.utcnow().isoformat(),
    })

    if run["mode"] == "target":
        if run["success"] >= run["target_success"] or run["attempts"] >= run["max_attempts"]:
            run["status"] = "completed"
            run["finished_at"] = datetime.utcnow().isoformat()
            return True
    else:
        if run["attempts"] >= run["max_attempts"]:
            run["status"] = "completed"
            run["finished_at"] = datetime.utcnow().isoformat()
            return True

    return False


def start_run(mode: str, target_success: int, max_attempts: int, selected_vacancy_ids: list[str], dry_run: bool, preset_name: str) -> dict[str, Any]:
    def updater(data: dict[str, Any]):
        vacancies = data["vacancies"]
        queue = [v for v in vacancies if not selected_vacancy_ids or v["id"] in selected_vacancy_ids]
        run = {
            "id": str(uuid.uuid4()),
            "mode": mode,
            "status": "running",
            "target_success": target_success,
            "max_attempts": max_attempts,
            "attempts": 0,
            "success": 0,
            "failed": 0,
            "skipped": 0,
            "dry_run": dry_run,
            "preset_name": preset_name,
            "current_vacancy": None,
            "queue": queue,
            "events": [],
            "started_at": datetime.utcnow().isoformat(),
            "finished_at": None,
        }
        data["runs"].insert(0, run)
        return run

    run = store.update(updater)
    thread = threading.Thread(target=_run_worker, args=(run["id"],), daemon=True)
    RUN_THREADS[run["id"]] = thread
    thread.start()
    return run
