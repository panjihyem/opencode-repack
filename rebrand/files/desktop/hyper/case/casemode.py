"""Saklar mode kasus.

Mode kasus menutup jalur keluar yang bisa ditutup secara lokal:

  - plugin memori otomatis dimatikan (tidak ada retain/recall prompt),
  - Hindsight tidak memakai router remote (konsolidasi hanya lokal),
  - alat yang menghubungi pihak luar ditolak lewat permission.

Yang TIDAK ditutup, dan tidak boleh diklaim tertutup: model agent itu sendiri
tetap remote. Karena itu mode kasus wajib dipakai bersama redaksi
(`hyper-case redact`), bukan sebagai penggantinya.

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

# Plugin memori otomatis: menyalin prompt ke Hindsight, yang lalu memakai model
# remote untuk konsolidasi. Versi no-op di bawah mempertahankan slot plugin
# tetapi tidak mengirim apa pun.
NOOP_PLUGIN = f"""// {MANAGED} - disabled while case mode is on (hyper-case mode on).
// No prompt is retained, no recall is injected, no transcript is uploaded.
export default {{ id: "hyper-memory", setup: async () => {{}} }}
"""

# Alat yang mengirim isi percakapan ke luar mesin.
REMOTE_TOOLS = [
    "webfetch",
    "websearch",
    "context7_resolve-library-id",
    "context7_query-docs",
    "hyper-search_search",
    "opencode_list_mcp_resources",
    "opencode_read_mcp_resource",
]


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


def status() -> dict:
    privacy = _read(PRIVACY_FILE, {})
    return {
        "case_mode": bool(privacy.get("case_mode")),
        "enabled_at": privacy.get("enabled_at"),
        "managed_permissions": privacy.get("managed_permissions", []),
        "config": str(CONFIG_FILE),
    }


def enable() -> dict:
    privacy = _read(PRIVACY_FILE, {})
    config = _read(CONFIG_FILE, None)
    if config is None:
        raise SystemExit(f"error: konfigurasi tidak ditemukan: {CONFIG_FILE}")
    permission = config.setdefault("permission", {})
    added = []
    for tool in REMOTE_TOOLS:
        if permission.get(tool) != "deny":
            permission[tool] = "deny"
            added.append(tool)
    config["permission"] = permission
    _write(CONFIG_FILE, config)

    previous = set(privacy.get("managed_permissions", []))
    plugin = _neutralize_plugin()
    privacy = {
        "case_mode": True,
        "enabled_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "managed_permissions": sorted(previous | set(added)),
    }
    _write(PRIVACY_FILE, privacy)
    return {"changed": added, "plugin": plugin, **status()}


def disable() -> dict:
    privacy = _read(PRIVACY_FILE, {})
    managed = privacy.get("managed_permissions", [])
    config = _read(CONFIG_FILE, None)
    removed = []
    if config is not None:
        permission = config.get("permission", {})
        for tool in managed:
            if permission.get(tool) == "deny":
                del permission[tool]
                removed.append(tool)
        config["permission"] = permission
        _write(CONFIG_FILE, config)
    plugin = _clear_plugin()
    _write(PRIVACY_FILE, {"case_mode": False, "enabled_at": None, "managed_permissions": []})
    return {"changed": removed, "plugin": plugin, **status()}
