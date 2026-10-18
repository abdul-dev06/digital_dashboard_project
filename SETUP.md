# Rock64 setup notes: what worked

These are the steps that worked on Abdul's Rock64, in order, with the problems we hit and how we fixed them. They're meant to be followed again on a fresh card, by a person or by another AI.
Last updated 2026-10-17.

## Hardware

| Item | Status / notes |
|---|---|
| Board | Rock64 v2.0, 4 GB RAM (RK3328, 4× Cortex-A53, Mali-450 GPU) |
| Case | Raspberry Pi 3 acrylic case, modified to fit, with a 5 V 0.10 A fan |
| Fan | 40-pin "Pi-2" header, outer row (board-edge side), counting from the reset/power-button end: **pin 4 (5 V) = red, pin 6 (GND) = black**. Check with a multimeter first: about 5 V on pin 4 and 0 V on pin 6, with the black probe on a USB port shell. The fan is always on. CPU temperature was 41–57 °C. |
| Power | **5 V 3 A barrel supply, 3.5 × 1.35 mm, centre positive.** Don't use the StarTech USB-A to Type-H cable (too little current, too much voltage drop). Don't use 12 V "PD trigger" USB-C to barrel adapters, which would put 12 V into the board. |
| Storage | **Use a 16–32 GB A1/A2 microSD** (SanDisk Ultra/Extreme, Samsung EVO, Kingston Canvas). The old **4 GB card failed**: EXT4 "failed to convert unwritten extents… error -5" during installs, then corrupt downloads ("is not a Debian format archive"). Long term, an eMMC module is better for the car. |
| Screen | HDMI works straight away (tested on an LG monitor). Boot text appears about a minute after power-on. |
| Network | The Rock64 has **no Wi-Fi or Bluetooth**. What worked: **Pixel USB tethering** in the **blue USB 3.0 port**, with the phone unlocked and a data-capable cable. It appeared as `enx…` with a 10.x address and connected automatically. If USB tethering is greyed out on the phone, it's the cable or the port. |

## 1. Flash the card (Windows laptop)

1. Image: armbian.com/rock64 → **Debian 13 Trixie, Minimal (CLI), "current" kernel**. This is a rolling "Developer Preview" build, and it's the only one offered for the Rock64 now. File: `Trixie_current_minimal.img.xz`.
2. The **HP "Digital Drive" USB reader** shows up as a *fixed disk*, so:
   - File Explorer may not show the card. Use **Disk Management**: delete the card's volumes, then create a **New Simple Volume**.
   - **Armbian Imager refuses it** ("system disk").
   - **Use Rufus instead**:
     - pick the card (tick *List USB Hard Drives* if it isn't shown, and check the size);
     - select the `.img.xz` directly;
     - START, choosing DD mode if asked;
     - optionally tick "Check device for bad blocks" first.
3. Afterwards, Windows may say the card "needs formatting". Ignore that and eject.

## 2. First boot

1. Connect the card, HDMI and keyboard, then plug in power last.
2. Root is logged in automatically: "Press Enter to start the first login setup".
3. Wizard answers:
   - root password;
   - shell **1 (bash)**;
   - user **abdul** (gets sudo);
   - locale **86 = en_CA.UTF-8**;
   - time zone **2 (Americas) → 10 (Canada) → the Mountain/AB line → 1 (Yes)** = America/Edmonton.
   - The wizard has no back button. Fix things afterwards instead:
     - locale: `sudo dpkg-reconfigure locales`
     - time zone: `sudo timedatectl set-timezone America/Edmonton`
4. The clock is wrong until it's online, because the board has no clock battery. Time syncs automatically once connected.
5. Tiny text: `setfont -d` (this session only), or `sudo dpkg-reconfigure console-setup` → Terminus 16×32 (permanent).

## 3. Network and updates

- Turn on Pixel USB tethering, then check with `ip -br addr` (look for the `enx…` line) and `ping -c 3 debian.org`.
- Updating worked: `sudo apt update && sudo apt full-upgrade -y`, then reboot. The kernel went from 6.18.56 to 6.18.57.
- Afterwards, `sudo apt clean` frees the downloaded package files.

## 4. Qt + GPU (confirmed working)

```
sudo apt install --no-install-recommends qml-qt6 qml6-module-qtquick
sudo apt install --no-install-recommends qml6-module-qtquick-window qt6-qpa-plugins
sudo apt install --no-install-recommends libegl1 libgles2 libgl1-mesa-dri
sudo usermod -aG video,render abdul      # then log out and back in
sudo apt clean
```

Test (Qt 6.8.2):
```
echo 'import QtQuick; Window{visible:true;color:"black";Rectangle{width:200;height:200;color:"orange";anchors.centerIn:parent;RotationAnimation on rotation{to:360;duration:2000;loops:-1}}}' > t.qml
QSG_INFO=1 QT_QPA_PLATFORM=eglfs timeout 10 /usr/lib/qt6/bin/qml t.qml 2>&1 | grep -iE "renderer|vendor|version"
```

Results:
- `/dev/dri` has card0, card1 and renderD128.
- **GL renderer = Mali-450**, so the open-source lima driver is doing GPU drawing.
- EGLFS draws full-screen with no desktop.
- The spin is smooth, with slight micro-stutter up close. Tune and measure this in the real app.

## Gotchas we hit

- **Typing:** the console font makes lowercase **l** and **1** look the same. Package names are `qml6-…` (q-m-L-6). A **trailing dash** on a package name (`qml6-module-qtquick-`) tells apt to *remove* it. Use **Tab** to autocomplete and **Up arrow** to repeat earlier commands.
- **`>` prompt** after Enter means a quote was left open. Press Ctrl+C and retype.
- **sudo:** after the first login you're `abdul`, not root, so system commands need `sudo`. The "Permission denied" errors on `apt clean` were just a missing sudo.
- **EGLFS grabs the keyboard**, so Ctrl+C and Ctrl+Alt+F2 don't work while a Qt app is running. Always test with `timeout 10 …`. If you get stuck, pull the power (safe when nothing is being installed).
- **After an interrupted install:** `sudo apt clean`, then `sudo dpkg --configure -a`, then `sudo apt install -f`. Reinstall anything still broken with `sudo apt install --reinstall <pkg>`.
- **Card health check:**
  - `sudo dmesg | grep -iE "mmc|ext4|i/o error" | tail -15`
  - `mmc1: Failed to initialize a non-removable card` is just the empty eMMC socket, which is normal.
  - Any `EXT4-fs … error` line means the card is failing.

## 5. Remote access (Tailscale): so commands can be copy-pasted from the laptop

On the Rock64:
```
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
- Open the login link it prints (on your phone is fine) and sign in.
- On the Windows laptop, install Tailscale from tailscale.com/download and sign in with the same account.
- Then, in PowerShell: `ssh abdul@rock64`.

This works over any internet connection the Rock64 has (phone tether, home Wi-Fi, later the car hotspot).

## 6. Web prototype on the Rock64 (kiosk), for trying the design before the Qt port

Files are in `cluster/rock64/`: `index.html`, `install-web.sh`, `run-web.sh`.

1. Copy them from the laptop (PowerShell):
   ```
   ssh abdul@rock64 mkdir -p cluster
   scp $HOME\Downloads\index.html $HOME\Downloads\install-web.sh $HOME\Downloads\run-web.sh abdul@rock64:cluster/
   ```
2. Install (over SSH): `sh ~/cluster/install-web.sh`. This installs cage + Chromium, about 400 MB.
3. Run it **on the Rock64's own keyboard**: `sh ~/cluster/run-web.sh`.
4. Exit with **Alt+F4**, or `pkill cage` over SSH.

Keys:

| Key | Action |
|---|---|
| **K** | key on |
| **E** | start/stop engine |
| **Space** (hold) | rev |
| **arrows** | shift |
| **1 / 2 / 3** | Eco / Normal / Sport |
| **C** | cold start |
| **H** | overheat |
| **M** | check engine |
| **F** | filled up |
| **I** | icy |
| **L** | OBD lost |

Notes:
- `?kiosk` in the address hides the controls and fills the screen.
- Chromium may draw on the CPU on this GPU, so expect it to be less smooth than the Qt version will be. This is only for trying the design.

## 7. The Qt cluster app (the real thing), from GitHub

Repo: https://github.com/abdul-dev06/digital_dashboard_project. The `qt/` folder there is generated from the web design by `tools/port_qt.py`. It needs only the packages from step 4: no compiling, no browser.

First time, on the Rock64:
```
sudo apt install git
sudo usermod -aG input abdul          # lets the app read the keyboard when started over SSH; log out/in after
git clone https://github.com/abdul-dev06/digital_dashboard_project.git ~/dashboard
sh ~/dashboard/qt/run.sh
```

Sounds (start-up and warning chimes), once. These are the steps that worked on 2026-10-18:
```
sudo apt install --no-install-recommends qml6-module-qtmultimedia pipewire-pulse wireplumber
sudo reboot
```
Then log in and point the sound at HDMI. The two outputs both show as "Built-in Audio" until you add `-n`:
```
wpctl status -n                 # under Audio > Sinks: alsa_output.platform-hdmi-sound... = the TV
wpctl set-default 35            # use that line's number (it was 35)
wpctl set-volume 35 1.0         # it starts at 40 %
pw-play /usr/share/sounds/alsa/Front_Center.wav   # test: a voice from the TV
```
- The default is remembered across reboots.
- For the car's 3.5 mm jack instead, pick the `analog-sound` sink.
- Without the module, the cluster still runs silently, and its console says "Sounds off".
- Gotchas:
  - Right after installing, the cluster says "pa_context_connect() failed / No audio device detected". The sound service only starts at login, so reboot first.
  - The `RTKit error` lines and the red `mp3float … timestamps` lines are harmless.
  - To test the hardware without PipeWire:
    ```
    systemctl --user stop pipewire.socket pipewire-pulse.socket pipewire pipewire-pulse wireplumber
    speaker-test -D plughw:1,0 -c 2 -t sine -l 1
    systemctl --user start pipewire.socket pipewire-pulse.socket pipewire pipewire-pulse wireplumber
    ```
    In `speaker-test`, card 1 is HDMI and card 0 is analog. Mind the dash in `-D` and the lack of a space in `plughw:1,0`.

Every time after:
- `sh ~/dashboard/qt/run.sh` pulls the latest version from GitHub (15 s limit, skipped when offline), then starts the app.
- `--no-update` skips the check.
- The HDMI output is forced to 1280x720 and the cluster is drawn at **960x360** (0.75x), so every test screen gets the same picture and the GPU paints few pixels. Tested on the 4K TV: 4K output was GPU-bound, 1920x720 too heavy, 1280x480 good. `CLUSTER_SCALE=1` (1280x480) or `1.5` (1920x720) draws sharper; `CLUSTER_MODE=preferred` uses the screen's own mode.

Using it:
- Keys are typed on the **Rock64's keyboard**:

  | Key | Action |
  |---|---|
  | K | key on |
  | E | engine |
  | Space | rev |
  | arrows | shift |
  | 1/2/3 | modes |
  | C/H/M/F/I/L | tests |
  | P | fps |
  | Esc | quit |

- Over SSH, Ctrl+C also quits.

## 8. Live data: Tactrix OpenPort 2.0

Once, so the cluster can use the cable:
```
sudo usermod -aG dialout abdul        # then log out and back in
```

Testing at home:
- **Made-up data, no cable needed:**
  ```
  CLUSTER_OBD=sim sh ~/dashboard/qt/run.sh
  ```
  Press P: it shows "data: sim" and the gauges drive by themselves.
- **The cable at home (no car):** plug it into the Rock64 and run `sh ~/dashboard/qt/run.sh`.
  - P should show "data: noecu" (the cable answers, there is no car) and the OBD lamp lights.
  - Without the cable it shows "data: demo" and the keys drive it as before.
- **Reader on its own, with a log:**
  ```
  python3 ~/dashboard/obd/reader.py -v
  ```
  It prints the cable's firmware, then the replies per second once it's in a car. Ctrl+C stops it.

In the car: OBD port → OpenPort → Rock64 USB, then key on and run the cluster. P shows "data: live" once the ECU answers.

## Still to do

- New 16–32 GB card, then redo steps 1–4. A one-command setup script is planned.
- Qt port runs on fake data (step 7). Next: measure fps on the Rock64, add the OBD2 data source, autostart at boot.
- Autostart at boot, a read-only/frozen system for the car, and a USB OBD adapter test (`/dev/ttyUSB0`, `ATZ`, `ATRV`, `010C`).
