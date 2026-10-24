"""Self-check local Hyper Case utilities; no case files/network required."""

import json
from pathlib import Path
from tempfile import TemporaryDirectory

import case
from case import CaseError, validate
import pseudonym

schema = {
    "required": ["kasus_id", "wp"],
    "properties": {
        "kasus_id": {"type": "string"},
        "wp": {"type": "object", "properties": {"nama": {"type": "string"}, "npwp": {"type": "string"}}},
    },
}
with TemporaryDirectory() as temp:
    root = Path(temp)
    (root / "uji").mkdir()
    (root / "uji" / "parameter.schema.json").write_text(json.dumps(schema), encoding="utf-8")
    case.DEFAULT_ROOTS = [root]
    assert validate("uji", {"kasus_id": "SYN-1", "wp": {"nama": "Budi Santoso", "npwp": "09.123.456.7-890.000"}})["valid"]
    try:
        validate("uji", [])
    except CaseError:
        pass
    else:
        raise AssertionError("non-object parameter JSON must fail")

mapping = pseudonym.build_map({"wp": {"nama": "Budi Santoso", "npwp": "09.123.456.7-890.000"}})
redacted = pseudonym.redact_text("Budi Santoso NPWP 09.123.456.7-890.000", mapping)
assert "Budi Santoso" not in redacted and "09.123.456.7-890.000" not in redacted
assert pseudonym.screen("NIK 3174012508900001")["blocked"]
assert pseudonym.restore_text(redacted, mapping) == "Budi Santoso NPWP 09.123.456.7-890.000"
print("case selfcheck: OK")
