"""OAuth and Graph API helpers for client-specific Meta connections."""

from __future__ import annotations

import os
from typing import Any
from urllib.parse import urlencode

import requests
import streamlit as st
from dotenv import load_dotenv

load_dotenv()

GRAPH_BASE_URL = "https://graph.facebook.com"
FACEBOOK_OAUTH_URL = "https://www.facebook.com"


class MetaOAuthError(RuntimeError):
    """Raised when Meta OAuth or Graph API operations fail."""


def _get_setting(name: str, default: str | None = None) -> str | None:
    """
    Read configuration from environment variables or Streamlit Secrets.

    Environment variables take precedence over Streamlit Secrets.
    Never log or expose secret values.
    """
    value = os.environ.get(name)

    if value and value.strip():
        return value.strip()

    try:
        value = st.secrets.get(name)
        if value is not None:
            value = str(value).strip()
            if value:
                return value
    except Exception:
        # Streamlit Secrets may be unavailable during local execution.
        pass

    return default


def _config() -> tuple[str, str, str, str]:
    """Load and validate the required Meta OAuth configuration."""
    app_id = _get_setting("META_APP_ID", "") or ""
    app_secret = _get_setting("META_APP_SECRET", "") or ""
    api_version = _get_setting("META_API_VERSION", "") or ""
    redirect_uri = _get_setting("META_OAUTH_REDIRECT_URI", "") or ""

    missing = [
        name
        for name, value in (
            ("META_APP_ID", app_id),
            ("META_APP_SECRET", app_secret),
            ("META_API_VERSION", api_version),
            ("META_OAUTH_REDIRECT_URI", redirect_uri),
        )
        if not value
    ]

    if missing:
        raise MetaOAuthError(
            "Missing required Meta configuration: " + ", ".join(missing)
        )

    if not api_version.startswith("v"):
        raise MetaOAuthError(
            "META_API_VERSION must look like vXX.X."
        )

    if not redirect_uri.startswith("https://"):
        raise MetaOAuthError(
            "META_OAUTH_REDIRECT_URI must use HTTPS."
        )

    return app_id, app_secret, api_version, redirect_uri


def _graph_url(path: str) -> str:
    """Build a versioned Meta Graph API URL."""
    _, _, version, _ = _config()
    return f"{GRAPH_BASE_URL}/{version}/{path.lstrip('/')}"


def _request(
    method: str,
    path: str,
    *,
    access_token: str | None = None,
    params: dict[str, Any] | None = None,
    timeout: int = 20,
) -> dict[str, Any]:
    """Send a request to the Meta Graph API."""
    request_params = dict(params or {})

    if access_token:
        request_params["access_token"] = access_token

    try:
        response = requests.request(
            method,
            _graph_url(path),
            params=request_params,
            timeout=timeout,
        )
        response.raise_for_status()
        payload = response.json()

    except requests.RequestException as exc:
        raise MetaOAuthError(
            "Could not communicate with Meta. Check your connection "
            "and try again."
        ) from exc

    except ValueError as exc:
        raise MetaOAuthError(
            "Meta returned an invalid response."
        ) from exc

    if not isinstance(payload, dict):
        raise MetaOAuthError(
            "Meta returned an unexpected response."
        )

    if payload.get("error"):
        error = payload["error"]

        message = (
            error.get("message", "Meta API request failed.")
            if isinstance(error, dict)
            else "Meta API request failed."
        )

        raise MetaOAuthError(message)

    return payload


def build_authorization_url(state: str) -> str:
    """Build the Facebook Login for Business authorization URL."""
    if not isinstance(state, str) or not state or len(state) > 512:
        raise ValueError("A valid OAuth state is required.")

    app_id, _, api_version, redirect_uri = _config()

    config_id = _get_setting("META_LOGIN_CONFIG_ID", "") or ""

    if not config_id:
        raise MetaOAuthError(
            "META_LOGIN_CONFIG_ID is missing. Configure it in your "
            "Streamlit Secrets or environment variables."
        )

    params = {
        "client_id": app_id,
        "redirect_uri": redirect_uri,
        "config_id": config_id,
        "response_type": "code",
        "state": state,
    }

    return (
        f"{FACEBOOK_OAUTH_URL}/{api_version}/dialog/oauth?"
        f"{urlencode(params)}"
    )


def exchange_code_for_token(code: str) -> dict[str, Any]:
    """Exchange the callback authorization code for an access token."""
    if not isinstance(code, str) or not code.strip():
        raise ValueError("Authorization code is missing.")

    app_id, app_secret, _, redirect_uri = _config()

    result = _request(
        "GET",
        "oauth/access_token",
        params={
            "client_id": app_id,
            "client_secret": app_secret,
            "redirect_uri": redirect_uri,
            "code": code.strip(),
        },
    )

    token = result.get("access_token")

    if not isinstance(token, str) or not token:
        raise MetaOAuthError(
            "Meta did not return an access token."
        )

    return {
        "access_token": token,
        "expires_in": result.get("expires_in"),
        "token_type": result.get("token_type"),
    }


def get_meta_profile(access_token: str) -> dict[str, Any]:
    """Return the authorized Meta user's basic profile."""
    result = _request(
        "GET",
        "me",
        access_token=access_token,
        params={"fields": "id,name"},
    )

    if not result.get("id"):
        raise MetaOAuthError(
            "Could not identify the authorized Meta user."
        )

    return result


def get_ad_accounts(access_token: str) -> list[dict[str, Any]]:
    """Fetch the ad accounts available to the authorized Meta user."""
    accounts: list[dict[str, Any]] = []
    next_url: str | None = None

    params: dict[str, Any] = {
        "fields": "id,account_id,name,account_status,currency",
        "limit": 100,
    }

    for _ in range(20):
        try:
            if next_url:
                response = requests.get(
                    next_url,
                    timeout=20,
                )
                response.raise_for_status()
                payload = response.json()

            else:
                payload = _request(
                    "GET",
                    "me/adaccounts",
                    access_token=access_token,
                    params=params,
                )

        except requests.RequestException as exc:
            raise MetaOAuthError(
                "Could not retrieve Meta ad accounts."
            ) from exc

        except ValueError as exc:
            raise MetaOAuthError(
                "Meta returned an invalid ad-account response."
            ) from exc

        if not isinstance(payload, dict):
            raise MetaOAuthError(
                "Meta returned an unexpected ad-account response."
            )

        if payload.get("error"):
            raise MetaOAuthError(
                "Meta denied access to the requested ad accounts."
            )

        data = payload.get("data", [])

        if not isinstance(data, list):
            raise MetaOAuthError(
                "Meta returned an invalid ad-account list."
            )

        accounts.extend(
            account
            for account in data
            if isinstance(account, dict) and account.get("id")
        )

        paging = payload.get("paging", {})

        next_url = (
            paging.get("next")
            if isinstance(paging, dict)
            else None
        )

        if not next_url:
            return accounts

    raise MetaOAuthError(
        "Too many ad-account pages were returned. Narrow the account "
        "selection and try again."
    )
