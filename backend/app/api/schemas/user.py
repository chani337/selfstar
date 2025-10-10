from pydantic import BaseModel
from typing import Optional

class UserBase(BaseModel):
    user_platform: str
    user_inherent: str
    user_nick: Optional[str] = None
    user_img: Optional[str] = None
    user_credit: Optional[int] = 100

class UserCreate(UserBase):
    password: Optional[str] = None

class UserOut(UserBase):
    user_id: int
    password: Optional[str] = None

    class Config:
        from_attributes = True
