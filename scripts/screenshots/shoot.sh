#!/usr/bin/env bash
# Re-shoots the README screenshots (docs/1-adding … 4-picker.png) from a real
# `claude --plugin-dir` session over a seeded demo stash. Makes no model calls.
# Needs python3, rsvg-convert (brew install librsvg) and claude on PATH.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
export PSTASH_REPO="$repo"
export PSTASH_SHOTS="${PSTASH_SHOTS:-/tmp/pstash-shots}"
work="$PSTASH_SHOTS"

mkdir -p "$work/my-app" "$work/store" "$work/out"
[ -x "$work/venv/bin/python" ] && "$work/venv/bin/python" -c 'import pyte' 2>/dev/null ||
  { python3 -m venv --clear "$work/venv" && "$work/venv/bin/pip" install -q pyte; }
py="$work/venv/bin/python"

# The plugin names the stash file after the project's real path.
app="$(cd "$work/my-app" && pwd -P)"
store="$work/store/$(printf '%s' "$app" | sed 's/[^A-Za-z0-9]/-/g').json"
seed() { sed "s|\"project\": \"\"|\"project\": \"$app\"|" "$here/seed.json" >"$store"; }

for scene in flow picker; do
  seed
  "$py" -I "$here/drive.py" "$here/$scene.json" "$work/out" >/dev/null
done

for shot in 1-adding 2-added 3-popped 4-picker; do
  "$py" -I "$here/render.py" "$work/out/$shot.json" "$work/out/$shot.svg"
  rsvg-convert -z 2 "$work/out/$shot.svg" -o "$repo/docs/$shot.png"
  echo "docs/$shot.png"
done
