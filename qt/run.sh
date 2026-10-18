#!/bin/sh
# Starts the cluster full-screen on the HDMI screen (Qt Quick, GPU, no desktop needed).
# Works from the Rock64's own console or over SSH.
#
# Auto-update: if this folder is a git clone and there's internet, it pulls the latest
# version from GitHub first (15 s limit). Offline it just runs what it has.
#   sh run.sh            update, then run
#   sh run.sh --no-update  run without checking for updates
#
# Screen resolution: the cluster is drawn at 1280x480, so the HDMI output is set to 1280x720
# (a 4K TV would otherwise make the GPU paint 9x the pixels for no gain). On the car's own
# 1280x480 screen, which has no 720p mode, Qt falls back to the screen's own mode.
# Override with e.g. CLUSTER_MODE=1920x1080 sh run.sh, or CLUSTER_MODE=preferred for the screen's default.
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
MODE="${CLUSTER_MODE:-1280x720}"
KMS="${TMPDIR:-/tmp}/cluster-kms.json"
# Qt names the HDMI output "HDMI1" (the kernel calls it HDMI-A-1); both are listed to be safe
printf '{ "hwcursor": false, "outputs": [ { "name": "HDMI1", "mode": "%s" }, { "name": "HDMI-A-1", "mode": "%s" } ] }\n' "$MODE" "$MODE" > "$KMS"
export QT_QPA_EGLFS_KMS_CONFIG="$KMS"
echo "Screen mode: $MODE  (Esc quits)"
exec /usr/lib/qt6/bin/qml main.qml
