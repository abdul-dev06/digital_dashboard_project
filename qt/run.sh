#!/bin/sh
# Starts the cluster full-screen on the HDMI screen (Qt Quick, GPU, no desktop needed).
# Works from the Rock64's own console or over SSH.
#
# Auto-update: if this folder is a git clone and there's internet, it pulls the latest
# version from GitHub first (15 s limit). Offline it just runs what it has.
#   sh run.sh            update, then run
#   sh run.sh --no-update  run without checking for updates
#
# Screen: the HDMI output is forced to 1280x720 and the cluster (laid out at 1280x480) is drawn
# at 0.75x = 960x360 real pixels, then the screen scales it up. Every test screen gets the same
# picture, and the GPU paints few pixels (a 4K TV at full resolution made the GPU the bottleneck;
# 1920x720 was too much for the Rock64, 1280x480 was good).
#   CLUSTER_SCALE=1          draw at 1280x480                (default 0.75 = 960x360)
#   CLUSTER_SCALE=1.5        draw at 1920x720 (12.3" automotive panel resolution)
#   CLUSTER_MODE=preferred   use the screen's own mode       (default 1280x720)
#
# Live data: obd/reader.py runs alongside and reads the car through a Tactrix OpenPort 2.0 (USB).
# Without the cable the cluster runs its keyboard demo. CLUSTER_OBD=sim feeds made-up driving data
# (tests the whole path without a car); CLUSTER_OBD=off doesn't start the reader.
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
export QT_SCALE_FACTOR="${CLUSTER_SCALE:-0.75}"
echo "Screen mode: $MODE, cluster drawn at ${QT_SCALE_FACTOR}x  (Esc quits)"
export QML_XHR_ALLOW_FILE_READ=1
rm -f /dev/shm/cluster-obd.json
READER=""
case "${CLUSTER_OBD:-on}" in
  off) ;;
  sim) python3 "$REPO/obd/reader.py" --sim & READER=$! ;;
  *)   python3 "$REPO/obd/reader.py" & READER=$! ;;
esac
/usr/lib/qt6/bin/qml main.qml
[ -n "$READER" ] && kill "$READER" 2>/dev/null
exit 0
