import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID


class UUIDEncoder(json.JSONEncoder):
    """JSON encoder that handles UUID, Decimal, date, datetime"""
    def default(self, obj):
        if isinstance(obj, UUID):
            return str(obj)
        if isinstance(obj, Decimal):
            return float(obj)
        if isinstance(obj, (date, datetime)):
            return obj.isoformat()
        return super().default(obj)


def to_json(data: Any) -> str:
    """Convert data to JSON string"""
    return json.dumps(data, cls=UUIDEncoder, ensure_ascii=False)


def from_json(json_str: str) -> Any:
    """Parse JSON string to data"""
    if not json_str:
        return None
    return json.loads(json_str)


def safe_decimal(value: Any) -> Optional[Decimal]:
    """Safely convert value to Decimal"""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except:
        return None


def safe_int(value: Any) -> Optional[int]:
    """Safely convert value to int"""
    if value is None:
        return None
    try:
        return int(value)
    except:
        return None
