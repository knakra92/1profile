"""Render stored (naive UTC) datetimes in the viewer's timezone before they reach the model,
so it never has to do timezone math (which it gets wrong)."""

from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Header


def client_zone(x_timezone: str | None = Header(default=None)) -> ZoneInfo:
    """FastAPI dependency: the IANA zone the client sends in X-Timezone, else UTC."""
    try:
        return ZoneInfo(x_timezone) if x_timezone else ZoneInfo("UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def local_dt(d: datetime, z: ZoneInfo) -> str:
    return d.replace(tzinfo=UTC).astimezone(z).strftime("%a %b %-d %Y, %-I:%M %p %Z")


def local_date(d: datetime, z: ZoneInfo) -> str:
    return d.replace(tzinfo=UTC).astimezone(z).date().isoformat()


def today(z: ZoneInfo) -> str:
    return datetime.now(z).strftime("%A %B %-d, %Y")
