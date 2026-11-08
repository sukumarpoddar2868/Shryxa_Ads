"""Record what the legacy Python pipeline produces, for the TS parity test.

    cd <repo root> && uv run python web/scripts/campaign-parity/gen_fixtures.py

Writes web/src/features/campaigns/engine/__fixtures__/python-parity.json:
  • yaml cases   — each payload_pipeline/inputs/*.yaml → operations + mock run
  • render cases — yaml_render.build_meta_yaml(...) → spec → operations + mock run
  • invalid cases — specs Pydantic must reject
Name stamps (YYMMDD-HHMMSS) are replaced by "STAMP" so runs are reproducible.
"""
import copy
import io
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "payload_pipeline"))

import yaml  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from adapters import MockAdapter  # noqa: E402
from builders import build_all  # noqa: E402
from schemas import MetaCampaignYaml  # noqa: E402
from yaml_render import build_meta_yaml  # noqa: E402

OUT = ROOT / "web/src/features/campaigns/engine/__fixtures__/python-parity.json"
STAMP = re.compile(r"\d{6}-\d{6}")


def destamp(obj):
    if isinstance(obj, str):
        return STAMP.sub("STAMP", obj)
    if isinstance(obj, dict):
        return {k: destamp(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [destamp(v) for v in obj]
    return obj


def mock_run(spec: MetaCampaignYaml) -> dict:
    """Run the real MockAdapter and parse its printed steps back into data."""
    buf = io.StringIO()
    MockAdapter(spec.ad_account_id).run(build_all(spec), stream=buf, spec=spec)
    text = buf.getvalue()
    form = re.search(r"-> fake form_id: (\S+)", text)
    steps = []
    for m in re.finditer(r"--- Step (\d+): POST /(\S+) ---\n(.*?)\n  -> assigned id: (\d+)", text, re.S):
        steps.append({"step": int(m[1]), "endpoint": m[2], "payload": json.loads(m[3]), "id": m[4]})
    return {"form_id": form[1] if form else None, "steps": steps}


def case(name: str, raw: dict) -> dict:
    raw = destamp(raw)
    spec = MetaCampaignYaml.model_validate(raw)
    ops = [
        {"resourceType": o["resource_type"], "refKey": o["ref_key"], "endpoint": o["endpoint"],
         "payload": json.loads(json.dumps(o["payload"], default=str))}
        for o in build_all(spec)
    ]
    return {"name": name, "input": raw, "operations": ops, "mock": mock_run(spec)}


CLIENT = {
    "business_name": "Kapoor & Associates — Chartered Accountants",
    "ad_account_id": "998848709363610",
    "page_id": "1033691806503292",
    "instagram_actor_id": "17841400000000000",
}
COPY = {
    "primary_text": "File your ITR before 31 July — avoid the ₹5,000 late fee. Expert CA review.",
    "headline": "ITR filing by licensed CAs — from ₹999, personalised review",
    "description": "Salaried & business filings. Tax planning, 80C/80D, HRA, home loan deductions handled for you.",
    "call_to_action": "GET_QUOTE",
    "age_min": 24,
    "age_max": 55,
    "gender": "any",
    "interest_targeting": [
        {"id": "6003020834693", "name": "Income tax"},
        "raw name dropped",
        {"id": "0", "name": "zero id dropped"},
        {"id": "6003107902433", "name": "Personal finance"},
    ],
}

RENDER_CASES = {
    "render_website_inr_epicenters": dict(
        client=CLIENT, currency="INR", ad_copy=COPY, daily_budget=500.0,
        epicenters=[{"lat": 12.934285, "lng": 77.669365, "radius_km": 3},
                    {"lat": 12.969266, "lng": 77.60253, "radius_km": 1.5}],
        destination="Website", landing_page_url="https://kapoorca.in/itr",
        image_hash="d362e57df24b77e1d05b5dd8f07198c2", language="Hindi",
    ),
    "render_leadform_inr_variants": dict(
        client=CLIENT, currency="INR", ad_copy={**COPY, "gender": "female", "call_to_action": None},
        daily_budget=600.0, epicenters=[], destination="Lead Form",
        lead_form_config={"name": "ITR enquiry 250101-120000", "privacy_url": "https://kapoorca.in/privacy",
                          "custom_questions": ["Salaried or business?", "  "],
                          "prefilled_questions": ["FULL_NAME", "PHONE_NUMBER", "CITY"]},
        image_hash="feedhash", image_hash_story="storyhash", image_hash_portrait="portraithash",
        start_date="2026-12-01", end_date="2026-12-31", launch_status="ACTIVE",
    ),
    "render_website_usd_country": dict(
        client={**CLIENT, "business_name": "Brooklyn Reads", "instagram_actor_id": ""},
        currency="USD", ad_copy={"primary_text": "Spring fiction is here.", "headline": "Spring 2026 fiction",
                                 "gender": "male"},
        daily_budget=20.0, epicenters=[], destination="Website", landing_page_url="https://brooklynreads.com",
        image_hash="abc", image_hash_portrait="portraitonly", bid_strategy="COST_CAP",
    ),
}

VALID = {
    "ad_account_id": "1",
    "campaign": {"name": "c"},
    "ad_set": {"name": "s", "daily_budget": 100, "targeting": {"geo_locations": {"countries": ["IN"]}}},
    "ad": {"name": "a", "creative": {"object_story_spec": {"page_id": "p", "link_data": {
        "image_hash": "h", "message": "m", "name": "n", "link": "https://x.y",
        "call_to_action": {"type": "LEARN_MORE"}}}}},
}


def mutate(path: str, value):
    d = copy.deepcopy(VALID)
    *parents, last = path.split(".")
    node = d
    for p in parents:
        node = node[p]
    if value is DELETE:
        del node[last]
    else:
        node[last] = value
    return d


DELETE = object()
INVALID_CASES = {
    "no_budget": mutate("ad_set.daily_budget", DELETE),
    "both_budgets": mutate("ad_set.lifetime_budget", 5),
    "age_inverted": mutate("ad_set.targeting", {"geo_locations": {}, "age_min": 40, "age_max": 30}),
    "age_too_low": mutate("ad_set.targeting", {"geo_locations": {}, "age_min": 12}),
    "bad_objective": mutate("campaign.objective", "OUTCOME_FOO"),
    "category_without_country": mutate("campaign.special_ad_categories", ["HOUSING"]),
    "end_before_start": {**VALID, "ad_set": {**VALID["ad_set"], "start_time": "2026-05-15T09:00:00+05:30",
                                             "end_time": "2026-05-15T03:00:00+00:00"}},
    "bad_cta": mutate("ad.creative.object_story_spec.link_data.call_to_action", {"type": "CLICK_HERE"}),
    "negative_spend_cap": mutate("campaign.spend_cap", -1),
    "radius_zero": mutate("ad_set.targeting", {"geo_locations": {"custom_locations": [
        {"latitude": 1, "longitude": 2, "radius": 0}]}}),
}


def main():
    cases = []
    for path in sorted((ROOT / "payload_pipeline/inputs").glob("*.yaml")):
        cases.append(case(f"yaml_{path.stem}", yaml.safe_load(path.read_text())))
    # Datetime normalisation (+0000, Z, no seconds) through the builder.
    cases.append(case("datetimes", {**VALID, "ad_set": {**VALID["ad_set"],
                                                         "start_time": "2026-05-15T09:00Z",
                                                         "end_time": "2026-06-30T23:59:00+0530"}}))
    for name, kwargs in RENDER_CASES.items():
        rendered = build_meta_yaml(**kwargs)
        c = case(name, rendered)
        c["render_kwargs"] = kwargs
        cases.append(c)

    invalid = []
    for name, data in INVALID_CASES.items():
        try:
            MetaCampaignYaml.model_validate(data)
            raise SystemExit(f"invalid case {name} unexpectedly passed in Python")
        except ValidationError as e:
            invalid.append({"name": name, "input": data, "errors": [".".join(map(str, x["loc"])) for x in e.errors()]})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"valid": cases, "invalid": invalid}, indent=2, ensure_ascii=False) + "\n")
    print(f"wrote {len(cases)} valid + {len(invalid)} invalid cases → {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
