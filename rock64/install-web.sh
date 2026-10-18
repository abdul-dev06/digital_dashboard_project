#!/bin/sh
# Installs what the Rock64 needs to show the web prototype full-screen:
# cage (a tiny full-screen display server) + Chromium. About 400 MB on the card.
set -e
sudo apt-get update
sudo apt-get install -y --no-install-recommends cage chromium fonts-dejavu-core
sudo apt-get clean
echo
echo "Done. On the Rock64's own keyboard, run:  sh ~/cluster/run-web.sh"
