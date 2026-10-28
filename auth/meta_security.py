"""Encryption helpers for client-specific Meta access tokens."""

from __future__ import annotations

import os

from cryptography.fernet import Fernet, InvalidToken


class MetaSecurityError(RuntimeError):
    """Raised when Meta token encryption or decryption fails."""


def _fernet() -> Fernet:
    """Build the encryption interface from the configured secret key."""
    key = os.environ.get("META_TOKEN_ENCRYPTION_KEY", "").strip()

    if not key:
        raise MetaSecurityError(
            "META_TOKEN_ENCRYPTION_KEY is not configured."
        )

    try:
        return Fernet(key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise MetaSecurityError(
            "META_TOKEN_ENCRYPTION_KEY is invalid."
        ) from exc


def encrypt_access_token(access_token: str) -> str:
    """Encrypt an access token before it is stored in the database."""
    if not isinstance(access_token, str) or not access_token.strip():
        raise ValueError("Access token cannot be empty.")

    try:
        encrypted = _fernet().encrypt(access_token.encode("utf-8"))
        return encrypted.decode("utf-8")
    except MetaSecurityError:
        raise
    except Exception as exc:
        raise MetaSecurityError("Could not encrypt the Meta token.") from exc


def decrypt_access_token(encrypted_token: str) -> str:
    """Decrypt a token retrieved from the database."""
    if not isinstance(encrypted_token, str) or not encrypted_token:
        raise ValueError("Encrypted token cannot be empty.")

    try:
        decrypted = _fernet().decrypt(encrypted_token.encode("utf-8"))
        return decrypted.decode("utf-8")
    except InvalidToken as exc:
        raise MetaSecurityError(
            "Token decryption failed. Check the encryption key."
        ) from exc
    except MetaSecurityError:
        raise
    except Exception as exc:
        raise MetaSecurityError("Could not decrypt the Meta token.") from exc
