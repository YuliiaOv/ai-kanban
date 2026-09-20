import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_ROOT = ROOT / "backend"
for candidate in (str(BACKEND_ROOT), str(ROOT)):
    if candidate not in sys.path:
        sys.path.insert(0, candidate)
