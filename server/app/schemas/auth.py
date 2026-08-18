import re

from pydantic import BaseModel, Field, field_validator

USERNAME_RE = re.compile(r"^[A-Za-z0-9_]{3,32}$")


class RegisterBody(BaseModel):
    username: str
    password: str = Field(min_length=8, max_length=128)
    invite_code: str | None = None

    @field_validator("username")
    @classmethod
    def check_username(cls, value: str) -> str:
        text = value.strip()
        if not USERNAME_RE.match(text):
            raise ValueError("用户名需为 3–32 位字母、数字或下划线")
        return text


class LoginBody(BaseModel):
    username: str
    password: str


class RefreshBody(BaseModel):
    refresh_token: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    username: str
    role: str
