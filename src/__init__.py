from pathlib import Path

_PACKAGE_DIR = Path(__file__).resolve().parent
_SERVER_SRC_DIR = _PACKAGE_DIR.parent / "server" / "src"

if _SERVER_SRC_DIR.is_dir():
    __path__.append(str(_SERVER_SRC_DIR))
