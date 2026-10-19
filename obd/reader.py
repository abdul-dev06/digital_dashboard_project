#!/usr/bin/env python3
"""OBD2 reader for the Elantra cluster: Tactrix OpenPort 2.0 on the Rock64.

Reads the engine ECU over CAN (ISO 15765, 500 kbit/s, 11-bit ids) and writes the latest values
to a small JSON file in RAM (/dev/shm/cluster-obd.json). qt/main.qml reads that file 20 times a
second and hands it to the cluster (feed() in web/index.html). Python standard library only.

The OpenPort 2.0 is a USB serial device (/dev/ttyACM0) that takes text commands
("at<verb><channel> <args> <seq>\r\n" + binary payload) and answers with text replies
("ar<letter> ...") and binary message frames ("ar<digit><len>..."). It does ISO-TP itself.
Protocol notes: github.com/bisak/openport-j2534/blob/main/docs/PROTOCOL.md

Modes written to the file:
  live   the ECU is answering: values are real
  noecu  the cable is there but the ECU is silent (car off, or not plugged into a car)
  demo   no cable: the cluster runs its keyboard demo
  sim    made-up driving data, for testing the whole path without a car (--sim)

Usage:  python3 obd/reader.py [--sim] [--device /dev/ttyACM0] [--out /dev/shm/cluster-obd.json] [-v]
"""
import glob, json, math, os, select, sys, termios, time

OUT = "/dev/shm/cluster-obd.json"
REQ_ID, RESP_ID = 0x7E0, 0x7E8          # engine ECU, physical addressing (the gearbox 7E9 stays quiet)
CH = 6                                   # OpenPort channel for ISO 15765
PAD = 64                                 # ISO15765_FRAME_PAD: CAN frames padded to 8 bytes (required)
REPLY_TIMEOUT = 0.15                     # s to wait for an ECU reply before moving on
MAX_WRITES_PER_S = 30

# PID -> (data bytes, decode). Values in the cluster's units.
PIDS = {
    0x01: (4, lambda d: {"checkEngine": bool(d[0] & 0x80), "dtcCount": d[0] & 0x7F}),
    0x04: (1, lambda d: {"engineLoad": d[0] * 100 / 255}),
    0x05: (1, lambda d: {"coolant": d[0] - 40}),
    0x0C: (2, lambda d: {"rpm": (d[0] * 256 + d[1]) / 4}),
    0x0D: (1, lambda d: {"speed": d[0]}),
    0x0E: (1, lambda d: {"timing": d[0] / 2 - 64}),
    0x0F: (1, lambda d: {"intakeTemp": d[0] - 40}),
    0x10: (2, lambda d: {"maf": (d[0] * 256 + d[1]) / 100}),
    0x11: (1, lambda d: {"throttle": d[0] * 100 / 255}),
    0x1F: (2, lambda d: {"runTime": d[0] * 256 + d[1]}),
    0x42: (2, lambda d: {"moduleVolts": (d[0] * 256 + d[1]) / 1000}),
    0x44: (2, lambda d: {"lambda": (d[0] * 256 + d[1]) * 2 / 65536}),
    0x46: (1, lambda d: {"outsideTemp": d[0] - 40}),
}
# What to poll and how often (s). Up to 6 PIDs per request; rpm + speed go every cycle.
GROUPS = [
    {"pids": [0x0C, 0x0D], "every": 0.0},
    {"pids": [0x10, 0x44], "every": 0.5},                       # fuel: MAF + commanded lambda
    {"pids": [0x05, 0x04, 0x0E, 0x11, 0x1F, 0x01], "every": 1.0},
    {"pids": [0x0F, 0x46], "every": 5.0},
]
BATTERY_EVERY = 1.0                      # OBD pin 16 read by the cable itself (no ECU traffic)


def log(*a):
    if VERBOSE: print(time.strftime("%H:%M:%S"), *a, file=sys.stderr, flush=True)


class Out:
    """Writes the state file atomically, at most MAX_WRITES_PER_S times a second."""
    def __init__(self, path):
        self.path, self.tmp, self.last, self.state = path, path + ".tmp", 0.0, {"mode": "demo"}

    def update(self, force=False, **kw):
        self.state.update(kw)
        now = time.time()
        if not force and now - self.last < 1 / MAX_WRITES_PER_S: return
        self.last = now
        self.state["t"] = now
        with open(self.tmp, "w") as f: json.dump(self.state, f, separators=(",", ":"))
        os.replace(self.tmp, self.path)


class OpenPort:
    def __init__(self, dev):
        self.fd = os.open(dev, os.O_RDWR | os.O_NOCTTY | os.O_NONBLOCK)
        a = termios.tcgetattr(self.fd)
        a[0] = a[1] = a[3] = 0
        a[2] = termios.CREAD | termios.CLOCAL | termios.CS8
        termios.tcsetattr(self.fd, termios.TCSANOW, a)
        self.buf, self.seq, self.lines, self.frames = b"", 10, [], []

    def close(self):
        try: self.cmd("atz")
        except Exception: pass
        os.close(self.fd)

    def _write(self, data):
        while data:
            try:
                n = os.write(self.fd, data); data = data[n:]
            except BlockingIOError:
                select.select([], [self.fd], [], 0.05)

    def _pump(self, timeout):
        """Read what's there (waiting up to timeout), split into text replies and binary frames."""
        r, _, _ = select.select([self.fd], [], [], timeout)
        if r:
            try: self.buf += os.read(self.fd, 4096)
            except BlockingIOError: pass
            except OSError: raise IOError("cable gone")
        while True:
            i = self.buf.find(b"ar")
            if i < 0: self.buf = self.buf[-1:]; return
            if i: self.buf = self.buf[i:]
            if len(self.buf) < 4: return
            c = self.buf[2:3]
            if c.isdigit():                                  # binary frame: ar<ch><len><status><ts:4><payload>
                n = self.buf[3]
                if len(self.buf) < 4 + n: return
                body, self.buf = self.buf[4:4 + n], self.buf[4 + n:]
                if len(body) >= 5: self.frames.append((int(c), body[0], body[5:]))
            else:                                            # text reply up to \r\n
                j = self.buf.find(b"\r\n")
                if j < 0: return
                line, self.buf = self.buf[:j].decode("ascii", "replace"), self.buf[j + 2:]
                self.lines.append(line)

    def cmd(self, text, payload=b"", timeout=0.6, numbered=True):
        """Send a command and wait for the reply carrying its sequence number."""
        self.seq = self.seq + 1 if self.seq < 9999 else 10
        line = f"{text} {self.seq}" if numbered else text
        self._write(line.encode() + b"\r\n" + payload)
        end = time.time() + timeout
        while time.time() < end:
            self._pump(max(0.0, end - time.time()))
            for k, l in enumerate(self.lines):
                parts = l.split()
                if not numbered or (parts and parts[-1] == str(self.seq)):
                    del self.lines[:k + 1]
                    return l
        return None

    def open_can(self):
        self._write(b"\r\n\r\n"); time.sleep(0.05)
        self.cmd("atz", timeout=0.4); self.cmd("ata", timeout=0.4)
        self.lines.clear()
        ver = self.cmd("ati", timeout=0.6, numbered=False)
        if not ver or not ver.startswith("ari"): raise IOError("no answer from the cable")
        r = self.cmd(f"ato{CH} 0 500000 0")
        if not r or not r.startswith("aro"): raise IOError(f"could not open CAN: {r}")
        # flow-control filter: replies from 7E8, flow control sent to 7E0 (needed for multi-PID replies)
        fc = (0x7FF).to_bytes(4, "big") + RESP_ID.to_bytes(4, "big") + REQ_ID.to_bytes(4, "big")
        r = self.cmd(f"atf{CH} 3 {PAD} 4", fc)
        if not r or not r.startswith("arf"): raise IOError(f"could not set the filter: {r}")
        return ver

    def battery(self):
        r = self.cmd("atr 16", timeout=0.5)                  # arr 16 <mV> <seq>
        try: return int(r.split()[2]) / 1000
        except Exception: return None

    def request(self, data):
        """Send an OBD request to the engine ECU; return its reply bytes (or None)."""
        self.frames.clear()
        msg = REQ_ID.to_bytes(4, "big") + bytes(data)
        r = self.cmd(f"att{CH} {len(msg)} {PAD} 100000", msg, timeout=0.3)
        if not r or not r.startswith("aro"): return None
        end = time.time() + REPLY_TIMEOUT
        while time.time() < end:
            for ch, status, payload in self.frames:
                # 0x40 = end of a received message; 0x10 = our own transmit indication; 0x80 = start
                if ch == CH and status & 0x40 and not status & 0x30 and len(payload) > 4:
                    if int.from_bytes(payload[:4], "big") == RESP_ID:
                        return payload[4:]
            self.frames.clear()
            self._pump(max(0.0, end - time.time()))
        return None


def parse_mode01(data):
    """41 <pid> <bytes> <pid> <bytes> ... -> {field: value}"""
    out, i = {}, 1
    if not data or data[0] != 0x41: return out
    while i < len(data):
        pid = data[i]
        if pid not in PIDS: break
        n, dec = PIDS[pid]
        if i + 1 + n > len(data): break
        out.update(dec(data[i + 1:i + 1 + n])); out.setdefault("_pids", []).append(pid)
        i += 1 + n
    return out


def supported_pids(port):
    """Ask the ECU which mode-01 PIDs it supports (0100, 0120, 0140 bitmaps)."""
    pids = []
    for base in (0x00, 0x20, 0x40):
        r = port.request([0x01, base])
        if not r or len(r) < 6 or r[0] != 0x41 or r[1] != base: break
        bits = int.from_bytes(r[2:6], "big")
        pids += [base + i + 1 for i in range(32) if bits & (1 << (31 - i))]
        if not bits & 1: break                       # bit 32 = the next bitmap exists
    return pids


def run_cable(dev, out):
    port = OpenPort(dev)
    try:
        ver = port.open_can()
        log("cable:", ver)
        out.update(force=True, mode="noecu", cable=ver[4:].strip())
        due = [0.0] * len(GROUPS)
        single = [False] * len(GROUPS)           # ECU didn't answer the multi-PID request: ask one by one
        next_batt, last_ecu, polls, t_rate = 0.0, 0.0, 0, time.time()
        checked = False                          # supported-PID list read once the ECU first answers
        while True:
            if os.getppid() == 1: return "parent gone"
            now = time.time()
            if now >= next_batt:
                v = port.battery()
                if v is not None: out.update(batteryVolts=v)
                next_batt = now + BATTERY_EVERY
            for gi, g in enumerate(GROUPS):
                if now < due[gi]: continue
                due[gi] = now + g["every"]
                asks = [[p] for p in g["pids"]] if single[gi] else [g["pids"]]
                for ask in asks:
                    vals = parse_mode01(port.request([0x01] + ask))
                    got = vals.pop("_pids", [])
                    if got:
                        last_ecu = time.time(); polls += 1
                        out.update(mode="live", **vals)
                        if not checked:
                            checked = True
                            sup = supported_pids(port)
                            if sup:
                                out.update(force=True, supported=[f"{p:02X}" for p in sup])
                                log("ECU supports PIDs:", " ".join(f"{p:02X}" for p in sup))
                    if len(ask) > 1 and 0 < len(got) < len(ask):
                        single[gi] = True; log("group", [hex(p) for p in ask], "-> one at a time")
            if time.time() - last_ecu > 2 and out.state.get("mode") != "noecu":
                out.update(force=True, mode="noecu")
            if time.time() - t_rate > 5:
                log(f"{polls / (time.time() - t_rate):.0f} replies/s, mode {out.state.get('mode')}")
                polls, t_rate = 0, time.time()
            if out.state.get("mode") == "noecu": time.sleep(0.2)   # car off: don't spin
    finally:
        port.close()


def run_sim(out):
    """Made-up drive: idle, pull away through the gears, cruise, brake. Exercises every field."""
    t0, ratios = time.time(), [0, 7.6, 13.2, 19.5, 26.5, 34.0]
    speed, gear = 0.0, 1
    while True:
        if os.getppid() == 1: return
        t = (time.time() - t0) % 60
        if t < 6: speed = 0
        elif t < 30: speed = min(110, speed + 0.6)
        elif t < 45: speed = 100 + 5 * math.sin(t)
        else: speed = max(0, speed - 1.2)
        gear = max(1, min(5, next((g for g in range(1, 6) if speed / ratios[g] * 1000 < 3200), 5)))
        rpm = 800 if speed < 3 else max(1200, speed / ratios[gear] * 1000)
        out.update(mode="sim", rpm=rpm, speed=round(speed), coolant=min(90, 40 + (time.time() - t0) / 3),
                   intakeTemp=25, outsideTemp=7, maf=rpm / 1000 * (8 if 6 < t < 30 else 3.2),
                   **{"lambda": 1.0}, engineLoad=70 if 6 < t < 30 else 18, throttle=50 if 6 < t < 30 else 0,
                   timing=10 + rpm / 400, runTime=int(time.time() - t0), checkEngine=False,
                   batteryVolts=14.2)
        time.sleep(0.03)


def main():
    global VERBOSE
    args = sys.argv[1:]
    VERBOSE = "-v" in args
    path = args[args.index("--out") + 1] if "--out" in args else OUT
    out = Out(path)
    if "--sim" in args:
        log("sim mode"); run_sim(out); return
    want = args[args.index("--device") + 1] if "--device" in args else None
    while True:
        if os.getppid() == 1: return                         # the cluster quit: stop too
        devs = [want] if want else sorted(glob.glob("/dev/ttyACM*"))
        dev = next((d for d in devs if d and os.path.exists(d)), None)
        if not dev:
            out.update(force=True, mode="demo"); time.sleep(2); continue
        try:
            log("opening", dev)
            why = run_cable(dev, out)
            if why: log(why); return
        except PermissionError:
            out.update(force=True, mode="demo", error=f"no permission for {dev}: sudo usermod -aG dialout $USER, then log in again")
            log(out.state["error"]); time.sleep(5)
        except (IOError, OSError) as e:
            out.update(force=True, mode="demo", error=str(e)); log("cable:", e); time.sleep(2)


if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: pass
