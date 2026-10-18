#!/bin/sh
# Starts the cluster full-screen on the HDMI screen (Qt Quick, GPU, no desktop needed).
# Works from the Rock64's own console or over SSH.
#
# Auto-update: if this folder is a git clone and there's internet, it pulls the latest
# version from GitHub first (15 s limit). Offline it just runs what it has.
#   sh run.sh            update, then run
#   sh run.sh --no-update  run without checking for updates
#
# Screen: the cluster is drawn at 1920x720 real pixels, the resolution of a 12.3" automotive
# cluster panel (the design is laid out at 1280x480 and scaled 1.5x, sharp, not stretched).
# The HDMI output is set to 1920x1080 so a TV/monitor shows exactly that, letterboxed, and a
# 4K TV doesn't make the GPU paint 4x the pixels. On a real 1920x720 panel Qt falls back to the
# panel's own mode, which the cluster fills exactly.
#   CLUSTER_MODE=preferred   use the screen's own mode     (default 1920x1080)
#   CLUSTER_SCALE=1          draw at 1280x480 (faster)     (default 1.5 = 1920x720)
#
# Keys (Rock64 keyboard): K key on, E engine, Space rev, arrows shift, 1/2/3 modes,
#   C cold, H overheat, M check engine, F filled up, I icy, L OBD lost, P fps counter, Esc quit.
# Over SSH, Ctrl+C in the SSH window also quits.
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(dirname "$HERE")"
if [ "$1" != "--no-update" ] && command -v git >/dev/null 2>&1 && [ -d "$REPO/.git" ]; then
  echo "Checking for updates..."
  if timeout 15 git -C "$REPO" pull --ff-only -q; then
    echo "Up to date: $(git -C "$REPO" log -1 --format='%h %s')"
  else
    echo "Update skipped (offline or local changes). Running the current version."
  fi
  exec sh "$HERE/run.sh" --no-update      # restart with the (possibly updated) script
fi
cd "$HERE"
export QT_QPA_PLATFORM=eglfs
export QT_QPA_EGLFS_HIDECURSOR=1
export QT_QPA_EVDEV_KEYBOARD_PARAMETERS=grab=1
export QT_LOGGING_RULES="qt.qml.usedbeforedeclared=false"
MODE="${CLUSTER_MODE:-1920x1080}"
KMS="${TMPDIR:-/tmp}/cluster-kms.json"
# Qt names the HDMI output "HDMI1" (the kernel calls it HDMI-A-1); both are listed to be safe
printf '{ "hwcursor": false, "outputs": [ { "name": "HDMI1", "mode": "%s" }, { "name": "HDMI-A-1", "mode": "%s" } ] }\n' "$MODE" "$MODE" > "$KMS"
export QT_QPA_EGLFS_KMS_CONFIG="$KMS"
export QT_SCALE_FACTOR="${CLUSTER_SCALE:-1.5}"
echo "Screen mode: $MODE, cluster drawn at ${QT_SCALE_FACTOR}x  (Esc quits)"
exec /usr/lib/qt6/bin/qml main.qml
