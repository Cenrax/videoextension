from pydantic_settings import BaseSettings
from functools import lru_cache
from pydantic import field_validator
import logging
from typing import Optional
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Settings(BaseSettings):
    # Base
    ENV: Optional[str] = "development"    
    DEBUG: Optional[bool] = True
    API_V1_STR: Optional[str] = "/api/v1"
    PROJECT_NAME: Optional[str] = "Video verifier"
    SCREENSHOT_STORAGE_DIR: Optional[str] = "temp/screenshots"
    
    
    @field_validator("ENV")
    def validate_env(cls, v):
        if v not in ["development", "production"]:
            raise ValueError("ENV must be either 'development' or 'production'")
        return v
    
    def model_post_init(self, __context) -> None:
        pass

    class Config:
        case_sensitive = True
        env_file = ".env"
        env_nested_delimiter = "__"
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    """
    Get cached settings instance.
    """
    try:
        return Settings()
    except Exception as e:
        logger.error(f"Error loading settings: {str(e)}")
        raise

# Create settings instance
settings = get_settings() 