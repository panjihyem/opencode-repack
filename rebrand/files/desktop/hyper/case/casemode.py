"""Saklar mode kasus.

Mode kasus menutup jalur keluar yang bisa ditutup secara lokal:

  - plugin memori otomatis dimatikan (tidak ada retain/recall prompt),
  - Hindsight tidak memakai router remote (konsolidasi hanya lokal),
  - integrasi/tool yang menghubungi pihak luar ditolak lewat `policies`
    OpenCode V2 (bukan `permission` V1 yang tidak menegakkan larangan).

Yang TIDAK ditutup, dan tidak boleh diklaim tertutup: model agent itu sendiri
tetap remote, dan `shell` tetap bisa menjalankan perintah jaringan. Karena itu
mode kasus wajib dipakai bersama redaksi (`hyper-case redact`), bukan sebagai
penggantinya.

Semua perubahan dicatat di privacy.json supaya `off` bisa mencabut persis apa
yang ditambahkan, tanpa menyentuh aturan milik user.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

PRIVACY_FILE = Path(os.path.expanduser("~/.config/opencode/hyper/privacy.json"))
CONFIG_FILE = Path(os.path.expanduser("~/.config/opencode/opencode.json"))
PLUGIN_FILE = Path(os.path.expanduser("~/.config/opencode/plugin/hyper-memory.ts"))
MANAGED = "HYPER_AI_MANAGED"

# OpenCode V2: policy bersifat biner dan menang atas permission, sehingga cocok
# untuk mode yang tidak boleh ditembus "allow always". Resource memakai bentuk
# `<action>:<value>`; provider cloud sengaja TIDAK disentuh.
DENY_POLICIES = [
    {"action": "integration.use", "resource": "mcp:context7", "effect": "deny"},
    {"action": "integration.use", "resource": "mcp:hyper-search", "effect": "deny"},
    {"action": "tool.use", "resource": "webfetch:*", "effect": "deny"},
    {"action": "tool.use", "resource": "websearch:*", "effect": "deny"},
]

# Aturan V1 dari versi lama. Dicabut saat `on`/`off` supaya file pengguna tidak
# menyimpan larangan yang tidak lagi ditegakkan V2.
LEGACY_TOOLS = [
    "webfetch",
    "websearch",
    "context7_resolve-library-id",
    "context7_query-docs",
    "hyper-search_search",
    "opencode_list_mcp_resources",
    "opencode_read_mcp_resource",
]

# Plugin memori otomatis: menyalin prompt ke Hindsight, yang lalu memakai model
# remote untuk konsolidasi. Versi no-op di bawah mempertahankan slot plugin
# tetapi tidak mengirim apa pun.
NOOP_PLUGIN = f"""// {MANAGED} - disabled while case mode is on (hyper-case mode on).
// No prompt is retained, no recall is injected, no transcript is uploaded.
export default {{ id: "hyper-memory", setup: async () => {{}} }}
"""


def _read(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default
    except json.JSONDecodeError as error:
        raise SystemExit(f"error: {path} bukan JSON valid: {error}")


def _write(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def _canonical(rule: dict) -> str:
    return json.dumps(rule, sort_keys=True, separators=(",", ":"))


def _policies(config: dict) -> list:
    current = config.get("policies")
    if current is None:
        return []
    if not isinstance(current, list):
        raise SystemExit("error: 'policies' di opencode.json harus berupa array")
    return current


def _neutralize_plugin() -> str:
    """Ganti plugin memori milik aplikasi dengan versi no-op.

    Tanpa langkah ini, `mode on` baru berlaku setelah aplikasi restart, padahal
    retain prompt berjalan setiap langkah. Plugin milik user tidak disentuh.
    """
    current = PLUGIN_FILE.read_text(encoding="utf-8") if PLUGIN_FILE.is_file() else None
    if current is None:
        return "absent"
    if MANAGED not in current:
        return "milik-user"
    if current == NOOP_PLUGIN:
        return "sudah-noop"
    PLUGIN_FILE.write_text(NOOP_PLUGIN, encoding="utf-8")
    return "dimatikan"


def _clear_plugin() -> str:
    """Hapus no-op yang kita tulis; plugin asli dibuat lagi saat aplikasi mulai."""
    current = PLUGIN_FILE.read_text(encoding="utf-8") if PLUGIN_FILE.is_file() else None
    if current is None:
        return "absent"
    if current != NOOP_PLUGIN:
        return "bukan-noop"
    PLUGIN_FILE.unlink()
    return "dihapus"


def _drop_legacy(config: dict) -> list[str]:
    """Hapus larangan V1 yang pernah ditulis mode kasus versi lama."""
    permission = config.get("permission")
    removed: list[str] = []
    if not isinstance(permission, dict):
        return removed
    for tool in LEGACY_TOOLS:
        if permission.get(tool) == "deny":
            del permission[tool]
            removed.append(tool)
    if not permission:
        config.pop("permission", None)
    return removed


def status() -> dict:
    privacy = _read(PRIVACY_FILE, {})
    return {
        "case_mode": bool(privacy.get("case_mode")),
        "enabled_at": privacy.get("enabled_at"),
        "managed_policies": privacy.get("managed_policies", []),
        "legacy_permissions": privacy.get("managed_permissions", []),
        "config": str(CONFIG_FILE),
    }


def enable() -> dict:
    privacy = _read(PRIVACY_FILE, {})
    config = _read(CONFIG_FILE, None)
    if config is None:
        raise SystemExit(f"error: konfigurasi tidak ditemukan: {CONFIG_FILE}")

    policies = _policies(config)
    present = {_canonical(rule) for rule in policies if isinstance(rule, dict)}
    added: list[dict] = []
    for rule in DENY_POLICIES:
        key = _canonical(rule)
        if key in present:
            continue
        policies.append(dict(rule))
        present.add(key)
        added.append(rule)
    config["policies"] = policies
    legacy_removed = _drop_legacy(config)
    _write(CONFIG_FILE, config)

    previous = [item for item in privacy.get("managed_policies", []) if isinstance(item, str)]
    managed = sorted(set(previous) | {_canonical(rule) for rule in added})
    plugin = _neutralize_plugin()
    privacy = {
        "case_mode": True,
        "enabled_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "managed_policies": managed,
        "managed_permissions": [],
    }
    _write(PRIVACY_FILE, privacy)
    return {
        "changed": [f"{rule['action']}:{rule['resource']}" for rule in added],
        "legacy_removed": legacy_removed,
        "plugin": plugin,
        **status(),
    }


def disable() -> dict:
    privacy = _read(PRIVACY_FILE, {})
    managed = {item for item in privacy.get("managed_policies", []) if isinstance(item, str)}
    config = _read(CONFIG_FILE, None)
    removed: list[str] = []
    if config is not None:
        policies = _policies(config)
        kept = []
        for rule in policies:
            if isinstance(rule, dict) and _canonical(rule) in managed:
                removed.append(f"{rule['action']}:{rule['resource']}")
                continue
            kept.append(rule)
        config["policies"] = kept
        _drop_legacy(config)
        _write(CONFIG_FILE, config)
    plugin = _clear_plugin()
    _write(PRIVACY_FILE, {"case_mode": False, "enabled_at": None, "managed_policies": [], "managed_permissions": []})
    return {"changed": removed, "plugin": plugin, **status()}
