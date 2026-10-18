# Elantra Digital Cluster — Rock64

Full-screen Qt Quick gauge cluster with a built-in fake-data simulator:
key-on bulb check and needle sweep, then an endless drive cycle with a
4-speed automatic, warming coolant, fuel burn, odometer/trip and turn signals.

Designed on a 1280×480 canvas and scaled to whatever HDMI screen you plug in.

## 1. Flash the Rock64

1. Download **Armbian for Rock64**, the minimal / CLI **Debian Bookworm (or newer)** image:
   https://www.armbian.com/rock64/
2. Flash it with **balenaEtcher** to a microSD card (8 GB+), or to the eMMC
   module using a USB eMMC adapter. eMMC is better for a car.
3. Plug in HDMI, Ethernet and a USB keyboard, then power up (5 V / 3 A barrel).
4. Log in as `root` with password `1234`. Armbian makes you set a new root
   password and create a user on first boot.

## 2. Copy this folder over

From your computer, on the same network (find the board's IP with `ip a` on the Rock64):

```
scp cluster.zip youruser@ROCK64_IP:~
```

Or put the zip on a USB stick. Then on the Rock64:

```
sudo apt install -y unzip
unzip cluster.zip && cd cluster
chmod +x setup.sh
sudo ./setup.sh
sudo systemctl start cluster
```

The cluster should take over the HDMI screen. It also starts on every boot.

## Handy commands

| What | Command |
|---|---|
| Stop it (get your console back) | `sudo systemctl stop cluster` |
| Watch logs | `journalctl -u cluster -f` |
| Disable autostart | `sudo systemctl disable cluster` |
| Rebuild after editing QML | `sudo ./setup.sh && sudo systemctl restart cluster` |

## If the screen stays black

- Check `journalctl -u cluster -n 50`.
- **"Could not open DRM device" / wrong card:** run `ls /sys/class/drm/` and put
  the card that has `HDMI-A-1` in `/opt/cluster/kms.json`.
- **EGL / GPU errors:** make sure the GPU driver loaded: `lsmod | grep lima`.
  As a quick fallback, edit `/etc/systemd/system/cluster.service`, change
  `QT_QPA_PLATFORM=eglfs` to `QT_QPA_PLATFORM=linuxfb`, then run
  `sudo systemctl daemon-reload && sudo systemctl restart cluster`
  (software rendering, slower but proves the app works).

## Files

| File | Purpose |
|---|---|
| `qml/Main.qml` | Layout: speed + trip computer (left), RPM dial (center), vehicle status (right) |
| `qml/RpmDial.qml` | Center RPM dial with lit tick ring and gear readout |
| `qml/CarTopView.qml` | Top-down car. Set `source` to a PNG to use a real photo |
| `qml/MetricRow.qml` | Value + bar rows on the status panel |
| `qml/Simulator.qml` | Fake data. Replace with real data later |
| `qml/Telltale.qml`, `qml/SegmentBar.qml` | Warning lamps, fuel/temp bars |
| `setup.sh`, `cluster.service` | Install + autostart on boot |

## Next step: real data

Keep `Simulator.qml`'s property names (`speed`, `rpm`, `coolant`, `fuel`, …) and
feed them from a microcontroller over UART (e.g. one line per update like
`S:87.4,R:2450,C:88,F:0.61,L:0x05`). The Rock64 only draws; the micro does the
signal conditioning and pulse counting.
