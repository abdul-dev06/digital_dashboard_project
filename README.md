# Elantra digital cluster

A supplementary digital instrument cluster for a 2007 Hyundai Elantra, running on a
Pine64 Rock64 (Armbian, Qt Quick, Mali-450 GPU) with data from an OBD2 adapter.

| Folder | What it is |
|---|---|
| `web/index.html` | **The design.** Single-file canvas prototype; open it in a browser to try it. |
| `qt/` | The Rock64 app. **Generated** from `web/index.html` by `tools/port_qt.py`; only `qt/main.qml` and `qt/run.sh` are hand-written. |
| `tools/` | `port_qt.py` (web → Qt converter) and `qt_prelude.js` (browser stand-ins for Qt). |
| `fonts/` | Bundled fonts (OFL / free licences). |
| `rock64/` | Optional: run the web version full-screen in Chromium (kiosk). |
| `archive/` | First Qt attempt, outdated. |
| `DESIGN.md` | Design and data reference: read this first. |
| `SETUP.md` | Rock64 setup steps that worked. |

## On the Rock64

First time:
```
sudo apt install git
git clone https://github.com/abdul-dev06/digital_dashboard_project.git ~/dashboard
sh ~/dashboard/qt/run.sh
```
After that, `sh ~/dashboard/qt/run.sh` pulls the latest version (when online) and starts it.
Keys: K key on, E engine, Space rev, arrows shift, 1/2/3 modes, P fps, Esc quit.

## Changing the design

Edit `web/index.html`, then:
```
python3 tools/port_qt.py
```
Commit both, and push.
