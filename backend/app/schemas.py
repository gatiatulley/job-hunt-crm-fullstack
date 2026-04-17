from __future__ import annotations

from typing import Literal, Optional
from pydantic import BaseModel, Field


class QueryPreviewRequest(BaseModel):
    query: str = ""
    or_terms: list[str] = Field(default_factory=list)
    and_terms: list[str] = Field(default_factory=list)
    not_terms: list[str] = Field(default_factory=list)


class SearchFilters(BaseModel):
    location: str = ""
    format: str = ""
    experience: str = ""
    employment: str = ""
    salary_from: Optional[int] = None
    salary_only: bool = False
    excluded: str = ""


class SearchRequest(QueryPreviewRequest):
    filters: SearchFilters = Field(default_factory=SearchFilters)


class LetterUpdateRequest(BaseModel):
    name: str
    content: str
    is_default: bool = False


class ProfileActivateRequest(BaseModel):
    profile_id: str


class ResumeActivateRequest(BaseModel):
    resume_id: str


class StartRunRequest(BaseModel):
    mode: Literal["count", "target"] = "target"
    target_success: int = 30
    max_attempts: int = 100
    selected_vacancy_ids: list[str] = Field(default_factory=list)
    dry_run: bool = True
    preset_name: str = "Junior PM"

