from __future__ import annotations

import json
import os
from pathlib import Path
from threading import Lock
from typing import Any

DEFAULT_DATA = {
    "profiles": [
        {"id": "profilegatiat", "name": "profilegatiat", "is_active": True, "auth_status": "active"},
        {"id": "backup_profile", "name": "backup_profile", "is_active": False, "auth_status": "inactive"},
    ],
    "resumes": [
        {"id": "resume_pm", "title": "Junior PM / Project Coordinator", "is_active": True},
        {"id": "resume_ba", "title": "Business Analyst", "is_active": False},
        {"id": "resume_admin", "title": "Admin / Assistant", "is_active": False},
    ],
    "letters": [
        {
            "id": "letter_pm",
            "name": "PM intro",
            "is_default": True,
            "content": "Здравствуйте! Меня заинтересовала ваша вакансия. Развиваюсь в направлении project management, умею координировать задачи, структурировать процессы и держать коммуникацию с командой.",
        },
        {
            "id": "letter_ba",
            "name": "Analyst angle",
            "is_default": False,
            "content": "Здравствуйте! Ваша вакансия показалась мне интересной. У меня есть опыт описания процессов, сбора требований и работы с документацией и задачами команды.",
        },
    ],
    "presets": [
        {
            "id": "preset_pm",
            "name": "Junior PM",
            "query": "project manager",
            "or_terms": ["project manager", "project coordinator", "business analyst"],
            "and_terms": ["IT"],
            "not_terms": ["senior"],
            "filters": {
                "location": "Moscow",
                "format": "Remote / Hybrid",
                "experience": "No experience / 1-3 years",
                "employment": "Full-time / Internship",
                "salary_from": 70000,
                "salary_only": True,
                "excluded": "sales, lead"
            }
        }
    ],
    "vacancies": [
        {
            "id": "vac_1",
            "title": "Junior Project Manager",
            "company": "Fintech Lab",
            "salary": "90 000 – 120 000 ₽",
            "format": "Remote",
            "location": "Moscow",
            "snippet": "Координация задач, документация, работа с командой продукта.",
        },
        {
            "id": "vac_2",
            "title": "Project Coordinator",
            "company": "Digital Orbit",
            "salary": "80 000 – 100 000 ₽",
            "format": "Hybrid",
            "location": "Moscow",
            "snippet": "Контроль сроков, работа с Jira, ведение статусов и коммуникаций.",
        },
        {
            "id": "vac_3",
            "title": "Business Analyst Intern",
            "company": "Nova Systems",
            "salary": "70 000 ₽",
            "format": "Office",
            "location": "Moscow",
            "snippet": "Сбор требований, описание процессов, поддержка команды аналитики.",
        },
        {
            "id": "vac_4",
            "title": "Junior Product Operations",
            "company": "Cloud Core",
            "salary": "95 000 ₽",
            "format": "Remote",
            "location": "Saint Petersburg",
            "snippet": "Операционная поддержка продуктовой команды и аналитика метрик.",
        },
        {
            "id": "vac_5",
            "title": "Product Assistant",
            "company": "Metro Flow",
            "salary": "75 000 – 90 000 ₽",
            "format": "Hybrid",
            "location": "Moscow",
            "snippet": "Помощь менеджеру продукта, статусы, таблицы, созвоны, контроль задач.",
        },
        {
            "id": "vac_6",
            "title": "IT Project Assistant",
            "company": "Pulse Stack",
            "salary": "85 000 ₽",
            "format": "Remote",
            "location": "Moscow",
            "snippet": "Поддержка проектной команды, митинги, отчётность, контроль дедлайнов.",
        }
    ],
    "runs": [],
}


class JsonStore:
    def __init__(self) -> None:
        data_dir = Path(os.getenv("APP_DATA_DIR", Path(__file__).resolve().parent.parent / "data"))
        data_dir.mkdir(parents=True, exist_ok=True)
        self.path = data_dir / "state.json"
        self.lock = Lock()
        if not self.path.exists():
            self._write(DEFAULT_DATA)

    def _read(self) -> dict[str, Any]:
        with self.path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def _write(self, data: dict[str, Any]) -> None:
        with self.path.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def get(self) -> dict[str, Any]:
        with self.lock:
            return self._read()

    def update(self, updater):
        with self.lock:
            data = self._read()
            result = updater(data)
            self._write(data)
            return result


store = JsonStore()
