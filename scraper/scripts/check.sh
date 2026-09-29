#!/usr/bin/env bash
set -euo pipefail
python -m compileall app
pytest -q
