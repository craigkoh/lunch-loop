#!/usr/bin/env bash
# Lunch Loop backup: turn one raw export (the result of scripts/backup/export.sql)
# into a dated, checksummed backup folder, verify it, and keep the newest 14.
#
# Usage: scripts/backup/lunch-loop-backup.sh RAW_EXPORT_FILE [BACKUP_ROOT]
#   RAW_EXPORT_FILE  saved output of export.sql (MCP execute_sql result or plain JSON)
#   BACKUP_ROOT      default /workspace/lunchloop-backups
#   KEEP             env var, default 14 (only folders named YYYYMMDD-HHMMSS are pruned)
#
# No secrets live here. The backup itself contains user data: keep it private.
set -euo pipefail
raw="${1:?Usage: $0 RAW_EXPORT_FILE [BACKUP_ROOT]}"
root="${2:-/workspace/lunchloop-backups}"
keep="${KEEP:-14}"
stamp="$(date +%Y%m%d-%H%M%S)"
dir="$root/$stamp"
mkdir -p "$dir"
cp "$raw" "$dir/raw_export.txt"

python3 - "$dir" <<'PY'
import json, re, sys, pathlib
d = pathlib.Path(sys.argv[1])
s = (d / "raw_export.txt").read_text()
try:
    outer = json.loads(s)
    text = outer.get("result", s) if isinstance(outer, dict) else s
except json.JSONDecodeError:
    text = s
m = re.search(r"<untrusted-data-[^>]+>\s*(\[.*\])\s*</untrusted-data", text, re.S)
rows = json.loads(m.group(1) if m else text)
b = rows[0]["backup"] if isinstance(rows, list) else rows["backup"]
problems = []
missing = sorted(set(b.get("public_tables") or []) - set(b["counts"]))
if missing:
    problems.append("tables not in export.sql: " + ", ".join(missing))
for name, value in b.items():
    if name in ("taken_at",):
        continue
    (d / f"{name}.json").write_text(json.dumps(value, indent=1, default=str))
for t, n in b["counts"].items():
    got = len(b.get(t) or [])
    if got != n:
        problems.append(f"{t}: count {n} but exported {got}")
if not b.get("auth_users"):
    problems.append("auth_users is empty")
if not b.get("site_settings"):
    problems.append("site_settings is empty")
(d / "counts.json").write_text(json.dumps(b["counts"], indent=1))
print("taken_at", b.get("taken_at"), "| tables", len(b["counts"]), "| rows", sum(b["counts"].values()),
      "| users", len(b.get("auth_users") or []), "| migrations", len(b.get("migrations") or []))
if problems:
    print("PROBLEMS:\n  " + "\n  ".join(problems)); sys.exit(1)
PY

(cd "$dir" && sha256sum ./*.json raw_export.txt > SHA256SUMS && sha256sum -c --quiet SHA256SUMS)
chmod -R go-rwx "$dir"
echo "OK $dir ($(du -sh "$dir" | cut -f1))"

# Keep the newest $keep dated folders only.
ls -1d "$root"/[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9] 2>/dev/null \
  | sort | head -n -"$keep" | while read -r old; do rm -rf -- "$old"; echo "pruned $old"; done
