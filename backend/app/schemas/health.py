from datetime import datetime, timezone
from pydantic import BaseModel

class HealthResponse(BaseModel):
    status: str
    timestamp: str

    @staticmethod
    def ok() -> "HealthResponse":
        return HealthResponse(status="ok", timestamp=datetime.now(timezone.utc).isoformat())
