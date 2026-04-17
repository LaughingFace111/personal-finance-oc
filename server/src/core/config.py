import os
from pathlib import Path
from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # App
    APP_NAME: str = "Personal Finance API"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "sqlite:///data/app.db"

    # JWT
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 300  # 300 minutes (5 hours)

    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://192.168.22.221:5173",
        "https://personal-finance-web.loca.lt",
        "https://fast-monkey-60.loca.lt",
        "https://409b61ca.r11.vip.cpolar.cn",
        "https://fuzzy-pumas-work.loca.lt",
        "https://1a4d25f4.r38.cpolar.top",
        "http://1a4d25f4.r38.cpolar.top",
        "https://47dba8db.r38.cpolar.top",
        "http://47dba8db.r38.cpolar.top",
        "https://7cecff6.r11.vip.cpolar.cn",
        "http://7cecff6.r11.vip.cpolar.cn",
        "https://43bc1c65.r38.cpolar.top",
        "http://43bc1c65.r38.cpolar.top",
        "https://3bcb25cc.r38.cpolar.top",
        "http://3bcb25cc.r38.cpolar.top",
        "https://6da580c3.r38.cpolar.top",
        "http://6da580c3.r38.cpolar.top",
    ]

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()

# 确保数据目录存在
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)
