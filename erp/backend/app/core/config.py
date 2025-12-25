import os
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(env_file=("backend.env", ".env"), case_sensitive=True)
    
    # Application
    APP_NAME: str = "Flash ERP"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str = ""
    
    # Security
    SECRET_KEY: str = "your-super-secret-key-change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    
    # CORS
    ALLOWED_ORIGINS: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
    
    @property
    def allowed_origins_list(self) -> List[str]:
        """Convert comma-separated string to list."""
        return [origin.strip() for origin in self.ALLOWED_ORIGINS.split(",")]
    
settings = Settings()

if not settings.DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required. Set it in backend/.env or environment variables (e.g. postgresql://user:pass@host:5432/dbname).")
