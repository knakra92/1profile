import hashlib
import hmac
import json
import secrets

from cryptography.fernet import Fernet

from .config import FIELD_ENCRYPTION_KEY

_fernet = Fernet(FIELD_ENCRYPTION_KEY)


def encrypt_json(value) -> bytes:
    return _fernet.encrypt(json.dumps(value).encode())


def decrypt_json(token: bytes):
    return json.loads(_fernet.decrypt(token))


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
    except ValueError:
        return False
    digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=2**14, r=8, p=1)
    return hmac.compare_digest(digest.hex(), digest_hex)


_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def new_share_code() -> str:
    raw = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
    return f"{raw[:4]}-{raw[4:]}"
