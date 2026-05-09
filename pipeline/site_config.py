"""Site config loader — parses site-specific Markdown configs into dicts.

Each site config lives in pipeline/sites/<site_id>.md and follows a
structured Markdown format with tables and code blocks. This module
extracts the key fields that the pipeline agents need at runtime.
"""

import logging
import re
from pathlib import Path

logger = logging.getLogger(__name__)

SITES_DIR = Path(__file__).parent / "sites"


def _parse_table(text: str) -> list[dict[str, str]]:
    """Parse a Markdown table into a list of row dicts."""
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    if len(lines) < 3:
        return []

    headers = [h.strip().strip('`') for h in lines[0].split('|') if h.strip()]
    rows = []
    for line in lines[2:]:
        cells = [c.strip().strip('`') for c in line.split('|') if c.strip()]
        if len(cells) == len(headers):
            rows.append(dict(zip(headers, cells)))
    return rows


def _extract_section(text: str, heading: str) -> str:
    """Extract the content under a specific ## heading."""
    pattern = rf'^## {re.escape(heading)}\s*\n(.*?)(?=^## |\Z)'
    match = re.search(pattern, text, re.MULTILINE | re.DOTALL)
    return match.group(1).strip() if match else ""


def _extract_bullet_items(text: str) -> list[str]:
    """Extract bullet list items from a section."""
    items = []
    for line in text.splitlines():
        line = line.strip()
        if line.startswith('- '):
            items.append(line[2:].strip())
    return items


def _clean_value(val: str) -> str:
    """Strip Markdown formatting from a value."""
    val = val.strip().strip('`').strip('"').strip("'")
    return val


def load_site_config(site_id: str) -> dict:
    """Load and parse a site config file into a structured dict.

    Args:
        site_id: The site identifier (filename without .md in pipeline/sites/)

    Returns:
        Dict with parsed config fields. Returns empty dict if file not found.
    """
    config_path = SITES_DIR / f"{site_id}.md"
    if not config_path.exists():
        logger.error("Site config not found: %s", config_path)
        return {}

    text = config_path.read_text()
    config: dict = {"site_id": site_id}

    # Parse Site Identity table
    identity_section = _extract_section(text, "Site Identity")
    for row in _parse_table(identity_section):
        field = row.get("Field", "").lower().replace(" ", "_")
        value = _clean_value(row.get("Value", ""))
        if field:
            config[field] = value

    # Parse Session Value Events table
    events_section = _extract_section(text, "Session Value Events")
    for row in _parse_table(events_section):
        field = _clean_value(row.get("Field", ""))
        value = _clean_value(row.get("Value", ""))
        if field == "bounce_gate_event":
            config["bounce_gate_event"] = value
        elif field == "completion_event":
            config["completion_event"] = value
        elif field == "completion_cap":
            try:
                config["completion_cap"] = int(value)
            except ValueError:
                config["completion_cap"] = 5
        elif field == "active_time_cap_ms":
            try:
                config["active_time_cap_ms"] = int(value)
            except ValueError:
                config["active_time_cap_ms"] = 300000

    # Parse Current Version table
    version_section = _extract_section(text, "Current Version")
    for row in _parse_table(version_section):
        field = _clean_value(row.get("Field", ""))
        value = _clean_value(row.get("Value", ""))
        if field == "site_version":
            config["site_version"] = value
        elif field == "last_experiment_id":
            config["last_experiment_id"] = value

    # Parse Change Scope table
    scope_section = _extract_section(text, "Change Scope")
    for row in _parse_table(scope_section):
        field = row.get("Field", "").strip()
        value = _clean_value(row.get("Value", ""))
        if "max files" in field.lower():
            try:
                config["max_files"] = int(value)
            except ValueError:
                config["max_files"] = 1
        elif "max lines" in field.lower():
            try:
                config["max_lines"] = int(value)
            except ValueError:
                config["max_lines"] = 50
        elif "allowed files" in field.lower():
            config["allowed_files"] = [f.strip() for f in value.split(",")]

    # Parse Identity Constraints
    identity_constraints = _extract_section(text, "Identity Constraints")
    config["identity_constraints"] = _extract_bullet_items(identity_constraints)

    # Parse Site-Specific Constraints
    site_constraints = _extract_section(text, "Site-Specific Constraints")
    config["site_constraints"] = _extract_bullet_items(site_constraints)

    # Parse Agent Context
    agent_context = _extract_section(text, "Agent Context")
    config["agent_context"] = _extract_bullet_items(agent_context)

    # Parse Custom Events table
    events_table_section = _extract_section(text, "Custom Events")
    config["custom_events"] = []
    for row in _parse_table(events_table_section):
        config["custom_events"].append({
            "name": _clean_value(row.get("Event Name", "")),
            "when": row.get("When It Fires", "").strip(),
            "properties": row.get("Key Properties", "").strip(),
        })

    logger.info(
        "Loaded site config: %s (repo=%s, bounce=%s, completion=%s)",
        site_id,
        config.get("repo"),
        config.get("bounce_gate_event"),
        config.get("completion_event"),
    )
    return config


def list_sites() -> list[str]:
    """List all registered site IDs (files in pipeline/sites/)."""
    if not SITES_DIR.exists():
        return []
    return sorted(
        p.stem for p in SITES_DIR.glob("*.md")
        if not p.name.startswith("_")
    )


def load_all_site_configs() -> dict[str, dict]:
    """Load configs for all registered sites."""
    return {site_id: load_site_config(site_id) for site_id in list_sites()}
