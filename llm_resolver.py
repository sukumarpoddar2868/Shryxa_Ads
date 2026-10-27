"""Silent LLM resolver — city geocoding + ad copy generation.

The dashboard keeps provider details hidden; location resolution and ad copy
generation run through Groq in the backend.
"""

from __future__ import annotations

import json
import os
import re
from pathlib import Path
from types import SimpleNamespace

from pydantic import BaseModel, Field


# ============================================================================
# Location schema
# ============================================================================


class CityPick(BaseModel):
    name: str = Field(
        description=(
            "For wide scopes: 'Bangalore, Karnataka'. "
            "For hyper-local scope: '<Neighborhood> — <City>', "
            "e.g. 'Indiranagar — Bangalore'."
        ),
    )
    lat: float = Field(description="Latitude in decimal degrees.")
    lng: float = Field(description="Longitude in decimal degrees.")
    radius_km: float = Field(
        ge=1,
        le=80,
        description="Targeting radius in KILOMETRES. Meta minimum is 1 km.",
    )
    why: str = Field(description="One-sentence rationale.")


class LocationGuess(BaseModel):
    # Up to 30: 3 clusters × up to 10 input cities.
    cities: list[CityPick] = Field(min_length=1, max_length=30)
    negative_areas: list[str] = Field(default_factory=list)


# ============================================================================
# Ad copy schema
# ============================================================================


class AdCopy(BaseModel):
    primary_text: str = Field(
        max_length=500,
        description="Body of the ad — 2 to 3 short sentences, conversational.",
    )
    headline: str = Field(
        max_length=40,
        description="Headline shown under the image — maximum 40 characters.",
    )
    description: str | None = Field(
        default=None,
        max_length=125,
        description="Optional description shown below the headline.",
    )
    interest_targeting: list[str] = Field(
        default_factory=list,
        max_length=8,
        description=(
            "Interest categories Meta supports, e.g. "
            "'Personal finance', 'Books'."
        ),
    )
    age_min: int = Field(ge=13, le=65, description="Minimum age.")
    age_max: int = Field(ge=13, le=65, description="Maximum age.")
    gender: str = Field(
        description="One of: 'any', 'male', 'female'. Use 'any' by default.",
    )


# ============================================================================
# Groq client and environment configuration
# ============================================================================



def _load_env_once():
    """Load environment variables from the project's root .env file."""
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    # Project root: shryxa_ads/.env
    root_env_path = Path(__file__).resolve().parent / ".env"

    if root_env_path.exists():
        load_dotenv(root_env_path)



def _get_client():
    """Create a Groq client using GROQ_API_KEY."""
    _load_env_once()

    api_key = os.environ.get("GROQ_API_KEY")

    if not api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. Add it to payload_pipeline/.env "
            "or configure it in your deployment environment."
        )

    try:
        # pyrefly: ignore[missing-import]
        from groq import Groq
    except ImportError as exc:
        raise RuntimeError(
            "The Groq SDK is not installed. Run `uv add groq`."
        ) from exc

    return Groq(api_key=api_key)


def _model() -> str:
    """Return the configured Groq model."""
    return os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b")


def _generate_json(
    prompt: str,
    *,
    max_completion_tokens: int = 2048,
    temperature: float = 0.2,
) -> str:
    """Generate JSON through Groq and return the response text."""
    client = _get_client()

    response = client.chat.completions.create(
        model=_model(),
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a precise assistant for Meta advertising workflows. "
                    "Follow the instructions carefully. Return only a valid JSON "
                    "object, without Markdown code fences or additional commentary."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
        response_format={"type": "json_object"},
        max_completion_tokens=max_completion_tokens,
        temperature=temperature,
    )

    content = response.choices[0].message.content

    if not content:
        raise RuntimeError("Groq returned an empty response.")

    return content


# ============================================================================
# Public API: location resolution
# ============================================================================


_RESOLVE_PROMPT = """You are resolving target locations for a Meta
(Facebook + Instagram) ad campaign.

The user has entered these cities to target:
{cities}

Business context:
  Business name: {business_name}
  Description:   {business_description}
  Country:       {country}
  Reach scope:   {reach_scope}

------------------------------------------------------------------
SCOPE RULES — follow EXACTLY. Wider scopes burn money on irrelevant
audience; narrower scopes deliver tightly relevant impressions.
------------------------------------------------------------------

If reach scope is "hyper-local":
  → For EACH input city, return EXACTLY 3 distinct sub-clusters
    centered on specific neighborhoods, localities, or business
    districts most likely to contain this business's customers.
  → Each cluster: 1.0–2.0 km radius. Pick the smallest radius that
    plausibly covers that locality. Default to 1.5 km if unsure.
  → The `name` field MUST follow this format:
        "<Neighborhood> — <City>"
    Use the em dash. Examples:
        "Indiranagar — Bangalore"
        "Koramangala — Bangalore"
        "HSR Layout — Bangalore"
  → Choose neighborhoods based on business context. Examples:
      • CA / tax / legal firm → high-income residential + business districts
      • Restaurant / cafe     → dense residential + nearby office cluster
      • Dental / clinic       → affluent residential within driving distance
      • Coworking / B2B SaaS  → tech hubs, IT parks, business districts
  → The `why` field must NAME the neighborhood and explain in one
    sentence why it fits this business.

If reach scope is "local":
  → ONE pick per input city. Radius 3–10 km. Single-location service.

If reach scope is "city-wide":
  → ONE pick per input city. Radius 10–25 km. Mid-size service / retail.

If reach scope is "metro":
  → ONE pick per input city. Radius 25–60 km. Regional brand.

------------------------------------------------------------------
For every pick, return:
  • Accurate latitude and longitude of the cluster centre.
    For hyper-local targeting, use the neighborhood centroid,
    NOT the city centre.
  • The radius in KILOMETRES from the rules above.
  • The `name` field formatted according to the scope rules.
  • One short reason in `why`.

Handle ambiguous city names by picking the largest metro and
noting it in the reason.

Return one JSON object with this structure:
{{
  "cities": [
    {{
      "name": "Neighborhood — City",
      "lat": 12.9716,
      "lng": 77.5946,
      "radius_km": 1.5,
      "why": "This neighborhood fits the business because ..."
    }}
  ],
  "negative_areas": []
}}
"""


def resolve_cities(
    city_names: list[str],
    *,
    business_name: str = "",
    business_description: str = "",
    country: str = "India",
    reach_scope: str = "hyper-local",
) -> LocationGuess:
    """Resolve city names into lat/lng/radius_km for Meta targeting."""
    if not city_names:
        raise ValueError("At least one target city must be provided.")

    cities_block = "\n".join(f"  • {city}" for city in city_names)

    prompt = _RESOLVE_PROMPT.format(
        cities=cities_block,
        business_name=business_name or "(not provided)",
        business_description=business_description or "(not provided)",
        country=country,
        reach_scope=reach_scope,
    )

    raw = _generate_json(
        prompt,
        max_completion_tokens=4096,
        temperature=0.1,
    )

    try:
        result = LocationGuess.model_validate(json.loads(raw))
    except Exception as exc:
        raise RuntimeError(
            "Groq location resolver returned invalid JSON or schema: "
            f"{exc}\nResponse: {raw}"
        ) from exc

    # Validate the expected number of clusters for each scope.
    if reach_scope == "hyper-local":
        expected = len(city_names) * 3

        if len(result.cities) != expected:
            raise RuntimeError(
                f"Location resolver returned {len(result.cities)} clusters; "
                f"expected {expected} for {len(city_names)} input cities "
                "under hyper-local scope."
            )

    elif len(result.cities) != len(city_names):
        raise RuntimeError(
            f"Location resolver returned {len(result.cities)} locations; "
            f"expected {len(city_names)} for the selected reach scope."
        )

    return result


# ============================================================================
# Ad copy generation
# ============================================================================


_AD_COPY_PROMPT = """You are writing Meta (Facebook + Instagram) ad copy.

Business:
  Name: {business_name}
  About: {business_description}

Product / offer for this campaign:
  {product_description}

Currency: {currency}
Destination: {destination}
(Lead Form ads run inside Meta; Website ads send users out.)

Default call-to-action: {default_cta}

STRICT LENGTH LIMITS:
  • primary_text: 2–3 short sentences. MAXIMUM 400 characters total.
    Do not include line breaks inside it.
  • headline: MAXIMUM 35 characters.
  • description: MAXIMUM 110 characters. Optional.
  • interest_targeting: exactly 3–5 relevant Meta interest tags.
  • age_min / age_max: integers representing likely buyers, typically 25–55.
  • gender: exactly one of "any", "male", "female".

OUTPUT RULES:
  • Return one compact JSON object.
  • No Markdown code fences or commentary outside the JSON.
  • No emojis.
  • Avoid line breaks inside JSON string values.
  • Make the copy specific to the offer. No generic filler or repetition.
  • Keep every field within its specified length limit.
  • Use realistic targeting suggestions. Do not claim that an interest
    is supported by Meta unless reasonably confident.

The JSON object must contain these fields:
{{
  "primary_text": "Two or three short sentences.",
  "headline": "A short headline",
  "description": "An optional short description",
  "interest_targeting": [
    "Interest one",
    "Interest two",
    "Interest three"
  ],
  "age_min": 25,
  "age_max": 55,
  "gender": "any"
}}
"""


_RUN_OF_WHITESPACE = re.compile(r"\s+")


def _sanitize_string(s: str, max_chars: int) -> str:
    """Collapse whitespace and truncate a string to the specified length."""
    if not s:
        return ""

    cleaned = _RUN_OF_WHITESPACE.sub(" ", str(s)).strip()

    if len(cleaned) > max_chars:
        cleaned = cleaned[: max_chars - 1].rstrip() + "…"

    return cleaned


def _sanitize_ad_copy_dict(raw: dict) -> dict:
    """Clean and normalize an ad-copy response before Pydantic validation."""
    out = dict(raw)

    if "primary_text" in out:
        out["primary_text"] = _sanitize_string(out["primary_text"], 500)

    if "headline" in out:
        out["headline"] = _sanitize_string(out["headline"], 40)

    if out.get("description"):
        out["description"] = _sanitize_string(out["description"], 125)
    elif out.get("description") == "":
        out["description"] = None

    # Deduplicate interests and cap the list at eight items.
    if isinstance(out.get("interest_targeting"), list):
        seen = set()
        cleaned_interests = []

        for item in out["interest_targeting"]:
            interest = _sanitize_string(str(item), 60)

            if interest and interest.lower() not in seen:
                seen.add(interest.lower())
                cleaned_interests.append(interest)

        out["interest_targeting"] = cleaned_interests[:8]

    # Clamp age values and ensure max age is not below min age.
    try:
        age_min = max(13, min(65, int(out.get("age_min", 25))))
        age_max = max(13, min(65, int(out.get("age_max", 55))))

        if age_max < age_min:
            age_max = age_min

        out["age_min"] = age_min
        out["age_max"] = age_max

    except (TypeError, ValueError):
        out["age_min"] = 25
        out["age_max"] = 55

    # Normalize gender to the supported values.
    gender = str(out.get("gender", "any")).lower().strip()

    if gender not in ("any", "male", "female"):
        gender = "any"

    out["gender"] = gender

    return out


def _call_groq_for_copy(prompt: str):
    """Call Groq once; return raw text and a parsed AdCopy when valid."""
    raw = _generate_json(
        prompt,
        max_completion_tokens=2048,
        temperature=0.7,
    )

    parsed = None

    try:
        parsed = AdCopy.model_validate(json.loads(raw))
    except Exception:
        # The caller attempts sanitization and retries if necessary.
        pass

    return SimpleNamespace(text=raw, parsed=parsed)


def _fallback_ad_copy(
    business_name: str,
    business_description: str,
    product_description: str,
) -> AdCopy:
    """Build safe, deterministic ad copy if Groq fails."""
    primary_seed = (
        product_description
        or business_description
        or business_name
        or ""
    ).strip()

    primary = _sanitize_string(primary_seed, 400)

    if not primary:
        primary = f"Learn more about {business_name or 'us'}."

    first_sentence = (
        product_description
        or business_description
        or business_name
        or ""
    ).split(".")[0]

    headline = (
        _sanitize_string(first_sentence, 35)
        or _sanitize_string(business_name, 35)
        or "Find out more"
    )

    description = (
        _sanitize_string(business_description or business_name, 110)
        or None
    )

    return AdCopy(
        primary_text=primary,
        headline=headline,
        description=description,
        interest_targeting=[],
        age_min=25,
        age_max=55,
        gender="any",
    )


def generate_ad_copy(
    *,
    business_name: str,
    business_description: str,
    product_description: str,
    currency: str,
    destination: str,
    default_cta: str,
) -> AdCopy:
    """Generate Meta ad copy with validation, retry, sanitization and fallback.

    Lifecycle:
      1. Call Groq for JSON output.
      2. Validate the result with Pydantic.
      3. Sanitize and validate again if needed.
      4. Retry once after a failed generation or invalid response.
      5. Return deterministic fallback copy if both attempts fail.
    """
    prompt = _AD_COPY_PROMPT.format(
        business_name=business_name or "(not provided)",
        business_description=business_description or "(not provided)",
        product_description=product_description or "(not provided)",
        currency=currency,
        destination=destination,
        default_cta=default_cta,
    )

    for _attempt in range(2):
        try:
            response = _call_groq_for_copy(prompt)
        except Exception:
            continue

        raw_text = getattr(response, "text", "") or ""

        # Path 1: response parsed successfully.
        if getattr(response, "parsed", None) is not None:
            cleaned = _sanitize_ad_copy_dict(
                response.parsed.model_dump()
            )

            try:
                return AdCopy.model_validate(cleaned)
            except Exception:
                pass

        # Path 2: valid JSON after sanitization.
        try:
            raw_dict = json.loads(raw_text)
            cleaned = _sanitize_ad_copy_dict(raw_dict)
            return AdCopy.model_validate(cleaned)
        except Exception:
            continue

    # Never leave the user stuck during campaign creation.
    return _fallback_ad_copy(
        business_name,
        business_description,
        product_description,
    )


# ============================================================================
# Utility
# ============================================================================


def to_epicenters(guess: LocationGuess) -> list[dict]:
    """Convert location results into the dictionaries expected by the dashboard."""
    return [
        {
            "lat": city.lat,
            "lng": city.lng,
            "radius_km": city.radius_km,
            "name": city.name,
            "why": city.why,
        }
        for city in guess.cities
    ]
