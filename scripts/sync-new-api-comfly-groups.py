#!/usr/bin/env python3
"""Synchronize Comfly routes and pricing into the production New API database.

The script is intended to run on the New API host. It is dry-run by default;
pass --apply to commit the generated configuration in one transaction.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import urllib.request
from collections import Counter
from decimal import Decimal


PRICING_URL = "https://ai.comfly.org/api/pricing"
POSTGRES_CONTAINER = "new-api-postgres"
CHANNEL_NAME = "Comfly-Default"
ROUTE_CHANNEL_PREFIX = "Comfly-Route-"

# This order must match the Doodleverse.fun token order in Comfly. A model is
# assigned to the first enabled group in this list.
GROUP_PRIORITY = [
    "default",
    "claude官",
    "ssvip",
    "openai官-优质",
    "claude正价",
    "origin",
    "svip",
    "AZ-优质",
    "vip",
    "vvip",
    "gemini优质",
    "国产特价",
    "cc优质",
    "cc",
    "aws-claude",
    "国产特价2",
    "veo&grok-备用1",
    "gemini-t3",
    "sd-global",
    "veo&grok-备用2",
    "image2-4k",
    "fal.ai-all",
    "gpt-image-2-official-mix",
    "azure特价组",
]

# These are the upstream multipliers shown for the Doodleverse.fun Comfly
# token. The sync aborts if Comfly's pricing endpoint disagrees with them.
EXPECTED_GROUP_RATIOS = {
    "default": Decimal("1.00"),
    "claude官": Decimal("5.00"),
    "ssvip": Decimal("3.00"),
    "openai官-优质": Decimal("4.00"),
    "claude正价": Decimal("8.00"),
    "origin": Decimal("7.30"),
    "svip": Decimal("1.00"),
    "AZ-优质": Decimal("1.50"),
    "vip": Decimal("0.80"),
    "vvip": Decimal("1.00"),
    "gemini优质": Decimal("2.00"),
    "国产特价": Decimal("0.70"),
    "cc优质": Decimal("2.00"),
    "cc": Decimal("0.80"),
    "aws-claude": Decimal("3.00"),
    "国产特价2": Decimal("0.80"),
    "veo&grok-备用1": Decimal("1.00"),
    "gemini-t3": Decimal("4.00"),
    "sd-global": Decimal("1.00"),
    "veo&grok-备用2": Decimal("1.00"),
    "image2-4k": Decimal("2.00"),
    "fal.ai-all": Decimal("3.40"),
    "gpt-image-2-official-mix": Decimal("1.00"),
    "azure特价组": Decimal("7.50"),
}

PRICING_OPTION_FIELDS = {
    "ModelRatio": "model_ratio",
    "CompletionRatio": "completion_ratio",
    "CacheRatio": "cache_ratio",
    "CreateCacheRatio": "create_cache_ratio",
    "AudioRatio": "audio_ratio",
    "AudioCompletionRatio": "audio_completion_ratio",
    "ImageRatio": "image_ratio",
    "ModelPrice": "model_price",
}

GROUP_OPTION_KEYS = {
    "GroupRatio",
    "GroupGroupRatio",
    "UserUsableGroups",
    "AutoGroups",
    "MaxTokenAutoGroups",
    "DefaultUseAutoGroup",
}


def docker_output(*args: str) -> str:
    result = subprocess.run(
        ["sudo", "docker", "exec", POSTGRES_CONTAINER, *args],
        check=True,
        text=True,
        capture_output=True,
    )
    return result.stdout.strip()


def psql_command() -> list[str]:
    user = docker_output("printenv", "POSTGRES_USER")
    database = docker_output("printenv", "POSTGRES_DB")
    return [
        "sudo",
        "docker",
        "exec",
        "-i",
        POSTGRES_CONTAINER,
        "psql",
        "-U",
        user,
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-F",
        "\t",
    ]


def query(sql: str) -> str:
    result = subprocess.run(
        psql_command(),
        input=sql,
        check=True,
        text=True,
        capture_output=True,
    )
    return result.stdout.rstrip("\n")


def execute(sql: str) -> None:
    subprocess.run(psql_command(), input=sql, check=True, text=True)


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def json_number(value: object) -> int | float:
    number = Decimal(str(value))
    return int(number) if number == number.to_integral() else float(number)


def json_object(raw: str, key: str) -> dict:
    if not raw:
        return {}
    value = json.loads(raw)
    if not isinstance(value, dict):
        raise RuntimeError(f"Option {key} is not a JSON object")
    return value


def encoded_json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)


def load_pricing() -> dict:
    with urllib.request.urlopen(PRICING_URL, timeout=30) as response:
        payload = json.load(response)
    if not payload.get("success") or not isinstance(payload.get("data"), list):
        raise RuntimeError("Comfly pricing endpoint returned an invalid payload")
    return payload


def load_current_options() -> dict[str, str]:
    keys = sorted(set(PRICING_OPTION_FIELDS) | GROUP_OPTION_KEYS)
    sql_keys = ",".join(sql_literal(key) for key in keys)
    rows = query(f"SELECT key, value FROM options WHERE key IN ({sql_keys});")
    current = {key: "" for key in keys}
    for row in rows.splitlines():
        if not row:
            continue
        key, value = row.split("\t", 1)
        current[key] = value
    return current


def route_channel_name(group: str) -> str:
    return CHANNEL_NAME if group == "default" else ROUTE_CHANNEL_PREFIX + group


def load_channels() -> tuple[dict, dict[str, dict], set[str]]:
    rows = query(
        "SELECT id, COALESCE(models, ''), \"group\", status, priority, weight, "
        "COALESCE(tag, ''), COALESCE(name, '') FROM channels "
        f"WHERE name = {sql_literal(CHANNEL_NAME)} "
        f"OR name LIKE {sql_literal(ROUTE_CHANNEL_PREFIX + '%')} ORDER BY id;"
    )
    if not rows:
        raise RuntimeError(f"Channel {CHANNEL_NAME!r} was not found")
    base_channel = None
    route_channels: dict[str, dict] = {}
    managed_models: set[str] = set()
    for row in rows.splitlines():
        channel_id, models, groups, status, priority, weight, tag, name = row.split("\t", 7)
        if name == CHANNEL_NAME:
            group = "default"
        elif name.startswith(ROUTE_CHANNEL_PREFIX):
            group = name[len(ROUTE_CHANNEL_PREFIX) :]
        else:
            continue
        if group in route_channels:
            raise RuntimeError(f"Duplicate managed route channel for group {group!r}")
        model_set = {model for model in models.split(",") if model}
        channel = {
            "id": int(channel_id),
            "name": name,
            "groups": [item for item in groups.split(",") if item],
            "models": model_set,
            "enabled": status == "1",
            "priority": int(priority),
            "weight": int(weight),
            "tag": tag,
        }
        route_channels[group] = channel
        managed_models.update(model_set)
        if name == CHANNEL_NAME:
            base_channel = channel
    if base_channel is None:
        raise RuntimeError(f"Base channel {CHANNEL_NAME!r} was not found")
    return base_channel, route_channels, managed_models


def load_abilities(channel_ids: set[int]) -> list[tuple[str, str]]:
    if not channel_ids:
        return []
    id_list = ",".join(str(channel_id) for channel_id in sorted(channel_ids))
    rows = query(
        "SELECT \"group\", model FROM abilities "
        f"WHERE channel_id IN ({id_list}) ORDER BY \"group\", model;"
    )
    abilities = []
    for row in rows.splitlines():
        if row:
            group, model = row.split("\t", 1)
            abilities.append((group, model))
    return abilities


def load_token_groups() -> Counter:
    rows = query(
        "SELECT COALESCE(\"group\", ''), COUNT(*) FROM tokens "
        "WHERE deleted_at IS NULL GROUP BY \"group\" ORDER BY \"group\";"
    )
    result: Counter = Counter()
    for row in rows.splitlines():
        if row:
            group, count = row.split("\t", 1)
            result[group] = int(count)
    return result


def validate_upstream_group_ratios(payload: dict) -> dict[str, int | float]:
    group_ratios = payload.get("group_ratio")
    if not isinstance(group_ratios, dict):
        raise RuntimeError("Comfly pricing data has no group_ratio object")

    missing = [group for group in GROUP_PRIORITY if group not in group_ratios]
    mismatches = {
        group: {
            "expected": json_number(expected),
            "upstream": json_number(group_ratios[group]),
        }
        for group, expected in EXPECTED_GROUP_RATIOS.items()
        if group in group_ratios and Decimal(str(group_ratios[group])) != expected
    }
    if missing or mismatches:
        raise RuntimeError(
            "Comfly group ratios do not match the approved configuration: "
            + encoded_json({"missing": missing, "mismatches": mismatches})
        )
    return {group: json_number(EXPECTED_GROUP_RATIOS[group]) for group in GROUP_PRIORITY}


def parse_auto_groups(raw: str) -> list[str]:
    if not raw:
        return []
    value = json.loads(raw)
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise RuntimeError("Option AutoGroups is not a JSON string list")
    return value


def encode_auto_groups(groups: list[str]) -> str:
    return json.dumps(groups, ensure_ascii=False, separators=(",", ":"))


def build_configuration(
    payload: dict, current_raw: dict[str, str], previously_managed_models: set[str]
) -> tuple[dict[str, str], dict]:
    approved_group_ratios = validate_upstream_group_ratios(payload)
    current_pricing = {
        key: json_object(current_raw[key], key) for key in PRICING_OPTION_FIELDS
    }

    records: dict[str, dict] = {}
    routes: dict[str, str] = {}
    excluded_parameterized: set[str] = set()
    for record in payload["data"]:
        enabled = set(record.get("enable_groups", []))
        route = next((group for group in GROUP_PRIORITY if group in enabled), None)
        if route is None:
            continue
        name = record["model_name"]
        # New API cannot generically represent Comfly's arbitrary parameter
        # matrices (resolution, duration, input count, etc.).
        if int(record["quota_type"]) == 1 and record.get("other_info", {}).get("ratios"):
            excluded_parameterized.add(name)
            continue
        if name in records:
            raise RuntimeError(f"Duplicate Comfly pricing record for {name}")
        records[name] = record
        routes[name] = route

    model_names = set(records)
    managed_models = model_names | previously_managed_models
    updated_pricing = {key: dict(value) for key, value in current_pricing.items()}
    for mapping in updated_pricing.values():
        for name in managed_models:
            mapping.pop(name, None)

    token_count = 0
    fixed_count = 0
    for name, record in records.items():
        if int(record["quota_type"]) == 0:
            token_count += 1
            updated_pricing["ModelRatio"][name] = json_number(record["model_ratio"])
            updated_pricing["CompletionRatio"][name] = json_number(
                record.get("completion_ratio", 1)
            )
            for option_key, field in (
                ("CacheRatio", "cache_ratio"),
                ("CreateCacheRatio", "create_cache_ratio"),
                ("AudioRatio", "audio_ratio"),
                ("AudioCompletionRatio", "audio_completion_ratio"),
                ("ImageRatio", "image_ratio"),
            ):
                if field in record:
                    updated_pricing[option_key][name] = json_number(record[field])
        elif int(record["quota_type"]) == 1:
            fixed_count += 1
            updated_pricing["ModelPrice"][name] = json_number(record["model_price"])
        else:
            raise RuntimeError(f"Unknown quota_type for {name}: {record['quota_type']}")

    overlap = set(updated_pricing["ModelRatio"]) & set(updated_pricing["ModelPrice"])
    affected_overlap = overlap & model_names
    if affected_overlap:
        raise RuntimeError(f"Models have both token and fixed pricing: {sorted(affected_overlap)[:5]}")

    updated_raw = dict(current_raw)
    for key, mapping in updated_pricing.items():
        updated_raw[key] = encoded_json(mapping)

    group_ratio = json_object(current_raw["GroupRatio"], "GroupRatio")
    group_ratio.update(approved_group_ratios)
    updated_raw["GroupRatio"] = encoded_json(group_ratio)

    usable_groups = json_object(current_raw["UserUsableGroups"], "UserUsableGroups")
    for group in GROUP_PRIORITY:
        usable_groups[group] = group
    # The token group itself must pass auth before New API resolves the actual
    # route. It has no GroupRatio because charging uses the resolved group.
    usable_groups["auto"] = "自动分组"
    updated_raw["UserUsableGroups"] = encoded_json(usable_groups)
    updated_raw["AutoGroups"] = encode_auto_groups(GROUP_PRIORITY)
    updated_raw["MaxTokenAutoGroups"] = str(max(24, int(current_raw["MaxTokenAutoGroups"] or 0)))
    updated_raw["DefaultUseAutoGroup"] = "true"

    pricing_drift = {
        key: sum(
            current_pricing[key].get(name) != updated_pricing[key].get(name)
            for name in managed_models
        )
        for key in PRICING_OPTION_FIELDS
    }
    option_drift = {
        key: current_raw.get(key, "") != updated_raw[key]
        for key in (
            "GroupRatio",
            "UserUsableGroups",
            "AutoGroups",
            "MaxTokenAutoGroups",
            "DefaultUseAutoGroup",
        )
    }
    route_counts = Counter(routes.values())
    report = {
        "selected_groups": len(GROUP_PRIORITY),
        "group_order": GROUP_PRIORITY,
        "group_ratios": approved_group_ratios,
        "models": len(records),
        "token_models": token_count,
        "fixed_models": fixed_count,
        "excluded_parameterized_models": len(excluded_parameterized),
        "route_counts": {group: route_counts[group] for group in GROUP_PRIORITY},
        "groups_without_models": [group for group in GROUP_PRIORITY if not route_counts[group]],
        "excluded_public_groups": sorted(set(payload["group_ratio"]) - set(GROUP_PRIORITY)),
        "pricing_drift": pricing_drift,
        "pricing_drift_total": sum(pricing_drift.values()),
        "option_drift": option_drift,
        "option_drift_total": sum(option_drift.values()),
    }
    return updated_raw, {"report": report, "records": records, "routes": routes}


def build_sql(
    base_channel: dict,
    route_channels: dict[str, dict],
    models: set[str],
    routes: dict[str, str],
    options: dict[str, str],
    commit: bool = True,
) -> str:
    statements = ["BEGIN;"]
    for key, value in options.items():
        if key == "GroupGroupRatio":
            continue
        statements.append(
            "INSERT INTO options (key, value) VALUES "
            f"({sql_literal(key)}, {sql_literal(value)}) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;"
        )

    models_by_group: dict[str, set[str]] = {
        group: {model for model in models if routes[model] == group}
        for group in GROUP_PRIORITY
    }
    active_groups = [group for group in GROUP_PRIORITY if models_by_group[group]]
    active_names = [route_channel_name(group) for group in active_groups]

    default_models = ",".join(sorted(models_by_group["default"]))
    statements.append(
        "UPDATE channels SET "
        f"models = {sql_literal(default_models)}, \"group\" = 'default' "
        f"WHERE id = {base_channel['id']};"
    )

    clone_columns = (
        "type, key, open_ai_organization, test_model, status, weight, created_time, "
        "test_time, response_time, base_url, other, balance, balance_updated_time, "
        "used_quota, model_mapping, status_code_mapping, priority, auto_ban, "
        "other_info, tag, setting, param_override, header_override, remark, "
        "channel_info, settings"
    )
    synced_columns = (
        "type = source.type, key = source.key, "
        "open_ai_organization = source.open_ai_organization, test_model = source.test_model, "
        "status = source.status, weight = source.weight, base_url = source.base_url, "
        "other = source.other, balance = source.balance, "
        "balance_updated_time = source.balance_updated_time, "
        "model_mapping = source.model_mapping, "
        "status_code_mapping = source.status_code_mapping, priority = source.priority, "
        "auto_ban = source.auto_ban, other_info = source.other_info, tag = source.tag, "
        "setting = source.setting, param_override = source.param_override, "
        "header_override = source.header_override, remark = source.remark, "
        "channel_info = source.channel_info, settings = source.settings"
    )
    for group in active_groups:
        if group == "default":
            continue
        name = route_channel_name(group)
        model_list = ",".join(sorted(models_by_group[group]))
        if group not in route_channels:
            statements.append(
                "INSERT INTO channels (name, models, \"group\", "
                + clone_columns
                + ") SELECT "
                f"{sql_literal(name)}, {sql_literal(model_list)}, {sql_literal(group)}, "
                + clone_columns
                + " FROM channels "
                f"WHERE id = {base_channel['id']} AND NOT EXISTS ("
                f"SELECT 1 FROM channels WHERE name = {sql_literal(name)});"
            )
        statements.append(
            "UPDATE channels AS target SET "
            + synced_columns
            + f", models = {sql_literal(model_list)}, \"group\" = {sql_literal(group)} "
            "FROM channels AS source "
            f"WHERE target.name = {sql_literal(name)} AND source.id = {base_channel['id']};"
        )

    active_name_list = ",".join(sql_literal(name) for name in active_names)
    statements.append(
        "UPDATE channels SET status = 2, models = '' "
        f"WHERE name LIKE {sql_literal(ROUTE_CHANNEL_PREFIX + '%')} "
        f"AND name NOT IN ({active_name_list});"
    )
    statements.append(
        "DELETE FROM abilities WHERE channel_id IN ("
        "SELECT id FROM channels "
        f"WHERE name = {sql_literal(CHANNEL_NAME)} "
        f"OR name LIKE {sql_literal(ROUTE_CHANNEL_PREFIX + '%')});"
    )
    statements.append(
        "INSERT INTO abilities (\"group\", model, channel_id, enabled, priority, weight, tag) "
        "SELECT channel.\"group\", route_model.model, channel.id, channel.status = 1, "
        "channel.priority, channel.weight, NULLIF(channel.tag, '') "
        "FROM channels AS channel "
        "CROSS JOIN LATERAL unnest(string_to_array(channel.models, ',')) "
        "AS route_model(model) "
        f"WHERE channel.name IN ({active_name_list}) "
        "AND COALESCE(channel.models, '') <> '';"
    )
    statements.append(
        "UPDATE tokens SET \"group\" = 'auto', auto_groups = '' "
        "WHERE deleted_at IS NULL AND COALESCE(\"group\", '') IN ('', 'default');"
    )
    statements.append("COMMIT;" if commit else "ROLLBACK;")
    return "\n".join(statements) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="commit changes to New API")
    parser.add_argument(
        "--validate-transaction",
        action="store_true",
        help="execute the complete SQL transaction and roll it back",
    )
    args = parser.parse_args()
    if args.apply and args.validate_transaction:
        parser.error("--apply and --validate-transaction are mutually exclusive")

    payload = load_pricing()
    current_raw = load_current_options()
    base_channel, route_channels, old_models = load_channels()
    managed_channel_ids = {channel["id"] for channel in route_channels.values()}
    current_abilities = load_abilities(managed_channel_ids)
    token_groups = load_token_groups()
    updated_raw, details = build_configuration(payload, current_raw, old_models)
    models = set(details["records"])
    routes = details["routes"]
    expected_abilities = {(routes[model], model) for model in models}
    current_ability_set = set(current_abilities)
    expected_models_by_group = {
        group: {model for model in models if routes[model] == group}
        for group in GROUP_PRIORITY
    }
    active_groups = [group for group in GROUP_PRIORITY if expected_models_by_group[group]]
    channel_drifts = []
    for group in active_groups:
        current_channel = route_channels.get(group)
        if current_channel is None:
            channel_drifts.append(group)
            continue
        if (
            current_channel["groups"] != [group]
            or current_channel["models"] != expected_models_by_group[group]
            or not current_channel["enabled"]
        ):
            channel_drifts.append(group)
    stale_route_groups = sorted(
        group
        for group, channel in route_channels.items()
        if group not in active_groups and group != "default" and channel["models"]
    )

    report = details["report"]
    report.update(
        {
            "base_channel_id": base_channel["id"],
            "previous_channel_models": len(old_models),
            "added_channel_models": len(models - old_models),
            "removed_channel_models": len(old_models - models),
            "expected_route_channels": active_groups,
            "current_route_channels": {
                group: len(channel["models"])
                for group, channel in sorted(route_channels.items())
            },
            "channel_drifts": channel_drifts,
            "stale_route_groups": stale_route_groups,
            "channel_drift_total": len(channel_drifts) + len(stale_route_groups),
            "current_ability_rows": len(current_abilities),
            "current_unique_abilities": len(current_ability_set),
            "missing_abilities": len(expected_abilities - current_ability_set),
            "unexpected_abilities": len(current_ability_set - expected_abilities),
            "duplicate_abilities": len(current_abilities) - len(current_ability_set),
            "current_token_groups": dict(token_groups),
            "token_group_drift": sum(
                count for group, count in token_groups.items() if group != "auto"
            ),
            "mode": (
                "apply"
                if args.apply
                else "validate-transaction"
                if args.validate_transaction
                else "dry-run"
            ),
        }
    )

    if args.apply or args.validate_transaction:
        execute(
            build_sql(
                base_channel,
                route_channels,
                models,
                routes,
                updated_raw,
                commit=args.apply,
            )
        )

    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=False))


if __name__ == "__main__":
    main()
