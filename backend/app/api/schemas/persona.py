from pydantic import BaseModel, Field
from typing import Any, Dict, Optional


class PersonaUpsert(BaseModel):
    # 생성된 이미지의 공개 URL (/media/xxx.png)
    persona_img: str = Field(..., min_length=1, max_length=1024)
    # 프론트에서 보낸 생성 파라미터 전체(JSON)
    persona_parameters: Dict[str, Any] = Field(default_factory=dict)


class PersonaUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    persona_img: Optional[str] = Field(default=None, min_length=1, max_length=1024)
    persona_parameters: Optional[Dict[str, Any]] = None
