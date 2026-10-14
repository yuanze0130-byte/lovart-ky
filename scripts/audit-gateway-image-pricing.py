#!/usr/bin/env python3
"""Compare the canvas's fixed image costs with NewAPI group prices.

Run on the Doodleverse host alongside the nightly Comfly catalog sync.
This script only reads the gateway database and writes an audit report.
"""

from datetime import datetime, timezone
from pathlib import Path
import json
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
GROUPS = {
    "default": "default",
    "gemini-premium": "gemini优质",
    "domestic-special": "国产特价",
}
PHYSICAL_IMAGE_VARIANTS = {
    "gpt-image-2.5-flare-2k": "gpt-image-2.5-flare",
    "gpt-image-2.5-flare-4k": "gpt-image-2.5-flare",
    "gpt-image-2.5-sunburst-2k": "gpt-image-2.5-sunburst",
    "gpt-image-2.5-sunburst-4k": "gpt-image-2.5-sunburst",
}


def gateway_options():
    sql = "SELECT key, value FROM options WHERE key IN ('GroupModelPrice', 'GroupRatio');"
    command = [
        "sudo", "docker", "exec", "-i", "new-api-postgres", "psql",
        "-U", "newapi", "-d", "newapi", "-At", "-F", "\t",
    ]
    result = subprocess.run(command, input=sql, text=True, capture_output=True, check=True)
    options = {}
    for line in result.stdout.splitlines():
        if "\t" in line:
            name, raw = line.split("\t", 1)
            options[name] = json.loads(raw)
    if not isinstance(options.get("GroupModelPrice"), dict) or not isinstance(options.get("GroupRatio"), dict):
        raise ValueError("gateway group pricing is unavailable")
    return options


def canvas_fixed_costs():
    source = (ROOT / "src/lib/image-pricing.ts").read_text(encoding="utf-8")
    match = re.search(r"const FIXED_COSTS.*?= \{(.*?)\n\};", source, re.S)
    if not match:
        raise ValueError("canvas fixed image pricing table is missing")
    entries = re.findall(
        r"'([^']+)': \{ costUnits: ([\d_]+), group: '([^']+)'", match.group(1)
    )
    if len(entries) < 30:
        raise ValueError("canvas fixed image pricing table is incomplete")
    fixed = {model: (int(units.replace("_", "")), GROUPS[group])
             for model, units, group in entries}
    for variant, base in PHYSICAL_IMAGE_VARIANTS.items():
        fixed[variant] = fixed[base]
    return fixed, len(entries)


def main():
    options = gateway_options()
    fixed, canvas_model_count = canvas_fixed_costs()
    mismatches = []
    unverifiable = []
    for model, (cost_units, group) in sorted(fixed.items()):
        item = options["GroupModelPrice"].get(model, {}).get(group)
        ratio = options["GroupRatio"].get(group)
        if not isinstance(item, dict) or item.get("type") != 1 or not isinstance(ratio, (int, float)):
            unverifiable.append({"model": model, "group": group, "reason": "fixed group price unavailable"})
            continue
        gateway_units = round(float(item["price"]) * float(ratio) * 100_000)
        if gateway_units != cost_units:
            mismatches.append({"model": model, "group": group,
                               "canvasCostUnits": cost_units, "gatewayCostUnits": gateway_units})
    report = {
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "canvasModelCount": canvas_model_count,
        "physicalVariantCount": len(PHYSICAL_IMAGE_VARIANTS),
        "mismatches": mismatches,
        "unverifiable": unverifiable,
    }
    destination = ROOT / ".local-data/gateway-image-price-report.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 2 if mismatches or unverifiable else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f"gateway image price audit failed: {error}", file=sys.stderr)
        sys.exit(2)
