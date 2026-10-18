#!/usr/bin/env bash
# Builds the cluster on a Rock64 running Armbian (Debian Bookworm or newer)
# and sets it to start full-screen on boot.  Run from this folder:
#   sudo ./setup.sh
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo: sudo ./setup.sh"; exit 1; fi
HERE="$(cd "$(dirname "$0")" && pwd)"

echo "==> Installing Qt 6, Mesa (Lima GPU driver) and build tools"
apt-get update
apt-get install -y build-essential cmake \
    qt6-base-dev qt6-declarative-dev \
    qml6-module-qtquick qml6-module-qtquick-window qml6-module-qtqml-workerscript \
    libgl1-mesa-dri libegl1 libgles2 fonts-dejavu-core

echo "==> Building"
rm -rf "$HERE/build"
cmake -S "$HERE" -B "$HERE/build" -DCMAKE_BUILD_TYPE=Release
cmake --build "$HERE/build" -j"$(nproc)"

echo "==> Installing to /opt/cluster"
mkdir -p /opt/cluster
install -m 755 "$HERE/build/cluster" /opt/cluster/cluster

# Find the DRM card that actually drives HDMI (the Lima GPU is a separate,
# display-less node, and Qt must not grab that one).
CARD=""
for c in /sys/class/drm/card*-HDMI-A-*; do
    [ -e "$c" ] || continue
    CARD="/dev/dri/$(basename "$c" | cut -d- -f1)"; break
done
CARD="${CARD:-/dev/dri/card0}"
echo "==> Using display device $CARD"
cat > /opt/cluster/kms.json <<EOF
{ "device": "$CARD", "hwcursor": false }
EOF

echo "==> Installing systemd service"
install -m 644 "$HERE/cluster.service" /etc/systemd/system/cluster.service
systemctl daemon-reload
systemctl enable cluster.service

# Stop the login prompt fighting the cluster for the screen
systemctl disable getty@tty1.service 2>/dev/null || true

echo
echo "Done. Start it now with:   sudo systemctl start cluster"
echo "Logs:                       journalctl -u cluster -f"
echo "Test in a window instead:   QT_QPA_PLATFORM=eglfs QT_QPA_EGLFS_KMS_CONFIG=/opt/cluster/kms.json /opt/cluster/cluster"
