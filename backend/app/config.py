import os
from pathlib import Path

from cryptography.fernet import Fernet

BASE_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env support (KEY=VALUE lines); real environment variables take precedence."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip().strip("'\""))


_load_dotenv(BASE_DIR / ".env")

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{BASE_DIR / 'oneprofile.db'}")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me")
JWT_TTL_HOURS = int(os.getenv("JWT_TTL_HOURS", "24"))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_URL = os.getenv("GEMINI_URL", "https://generativelanguage.googleapis.com/v1beta")
# gemma-4-26b-a4b-it (MoE, ~4B active) is much faster; gemma-4-31b-it is the larger dense model.
LLM_MODEL = os.getenv("LLM_MODEL", "gemma-4-26b-a4b-it")

CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*").split(",")


def _load_field_key() -> bytes:
    """Key for encrypting profile data at rest. In dev it is generated once and kept in a local file."""
    key = os.getenv("FIELD_ENCRYPTION_KEY")
    if key:
        return key.encode()
    key_file = BASE_DIR / ".dev_field_key"
    if not key_file.exists():
        key_file.write_bytes(Fernet.generate_key())
        key_file.chmod(0o600)
    return key_file.read_bytes().strip()


FIELD_ENCRYPTION_KEY = _load_field_key()
