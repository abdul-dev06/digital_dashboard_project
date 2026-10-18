#!/bin/sh
# Shows the cluster web prototype full-screen on the HDMI screen.
# Run it from the Rock64's own keyboard (logged in on the screen itself, not over SSH).
#
# Keys:  K key on   E start/stop engine   Space (hold) rev   arrows shift
#        1 Eco  2 Normal  3 Sport
#        C cold start  H overheat  M check engine  F filled up  I icy  L OBD lost
# Exit:  Alt+F4   (or from SSH:  pkill cage)
DIR="$(cd "$(dirname "$0")" && pwd)"
exec cage -s -- chromium --kiosk --no-first-run --noerrdialogs --disable-infobars \
  --password-store=basic --ozone-platform=wayland \
  --autoplay-policy=no-user-gesture-required \
  "file://$DIR/index.html?kiosk"
