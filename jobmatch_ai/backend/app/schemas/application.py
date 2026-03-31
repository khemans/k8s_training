from pydantic import BaseModel
from datetime import date
from typing import Optional


class ApplicationCreate(BaseModel):
    company: str
    title: str
    url: Optional[str] = None
    applied_date: date
    notes: Optional[str] = None


class ApplicationUpdate(BaseModel):
    applied_date: Optional[date] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class ApplicationResponse(BaseModel):
    id: int
    company: str
    title: str
    url: Optional[str]
    status: str
    applied_date: date
    notes: Optional[str]

    class Config:
        from_attributes = True