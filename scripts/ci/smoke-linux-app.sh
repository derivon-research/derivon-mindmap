#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  set -- derivon-app
fi
binary="$1"
if ! command -v "$binary" >/dev/null 2>&1 && [[ ! -x "$binary" ]]; then
  echo "Desktop binary not found: $binary" >&2
  exit 1
fi

display=":99"
xvfb_pid=""
if command -v xvfb-run >/dev/null 2>&1; then
  runner=(xvfb-run -a dbus-run-session -- "$@")
else
  Xvfb "$display" -screen 0 1280x800x24 -nolisten tcp >/tmp/derivon-xvfb.log 2>&1 &
  xvfb_pid=$!
  trap 'kill "$xvfb_pid" 2>/dev/null || true' EXIT
  sleep 2
  runner=(env DISPLAY="$display" dbus-run-session -- "$@")
fi

if [[ $(id -u) -eq 0 ]]; then
  useradd --create-home --shell /bin/bash derivon-smoke 2>/dev/null || true
  runner=(runuser -u derivon-smoke -- env HOME=/home/derivon-smoke "${runner[@]}")
fi

log="${RUNNER_TEMP:-/tmp}/derivon-smoke.log"
set +e
timeout --signal=TERM 12s "${runner[@]}" >"$log" 2>&1
status=$?
set -e

if [[ $status -ne 124 && $status -ne 143 ]]; then
  echo "Derivon exited before the smoke-test window (status $status)." >&2
  cat "$log" >&2
  exit 1
fi

if grep -Eiq 'panic|symbol lookup error|error while loading shared libraries' "$log"; then
  echo "Derivon emitted a fatal startup error." >&2
  cat "$log" >&2
  exit 1
fi

echo "Derivon remained alive for the 12-second desktop smoke test."
