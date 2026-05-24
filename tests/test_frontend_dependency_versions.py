import json
from pathlib import Path

import yaml

FRONTEND_DIR = Path("frontend")


def _pnpm_base_version(version: str) -> str:
    return version.split("(", 1)[0]


def test_react_and_react_dom_are_locked_to_the_same_version() -> None:
    package_json = json.loads((FRONTEND_DIR / "package.json").read_text())
    pnpm_lock = yaml.safe_load((FRONTEND_DIR / "pnpm-lock.yaml").read_text())

    dependencies = package_json["dependencies"]
    assert dependencies["react"] == dependencies["react-dom"]
    assert not dependencies["react"].startswith("^")

    lock_dependencies = pnpm_lock["importers"]["."]["dependencies"]
    assert _pnpm_base_version(lock_dependencies["react"]["version"]) == _pnpm_base_version(
        lock_dependencies["react-dom"]["version"]
    )
