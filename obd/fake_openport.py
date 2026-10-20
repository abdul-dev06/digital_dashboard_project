#!/usr/bin/env python3
"""A pretend Tactrix OpenPort 2.0 with a pretend engine ECU behind it, for testing obd/reader.py
without the cable or the car. Speaks the cable's protocol (see reader.py) on a pseudo-terminal.

  python3 obd/fake_openport.py            prints the device path to give the reader:
  python3 obd/reader.py --device <path> -v

Options: --no-multi  the ECU answers only the first PID of a request (tests the reader's fallback)
         --silent    the ECU never answers (car off)
         --key A,B   ignition script: ECU silent (ACC) for A s, then key ON (rpm 0) for B s, then running
         --kline     the ECU is on the K-line (ISO 14230 KWP2000, fast init) instead of CAN, like a 2005 S500:
                     CAN stays silent; one PID per request
"""
import math, os, sys, time, tty

NO_MULTI, SILENT, KLINE = "--no-multi" in sys.argv, "--silent" in sys.argv, "--kline" in sys.argv
KINIT = {"done": False}
KEY = [float(x) for x in sys.argv[sys.argv.index("--key") + 1].split(",")] if "--key" in sys.argv else None
T0 = time.time()


def ignition():
    if not KEY: return "silent" if SILENT else "run"
    t = time.time() - T0
    return "silent" if t < KEY[0] else "on" if t < KEY[0] + KEY[1] else "run"


def ecu_value(pid):
    t = time.time() - T0
    rpm = 0 if ignition() == "on" else 800 + 2500 * (0.5 + 0.5 * math.sin(t / 3))
    return {
        0x01: bytes([0x00, 0x07, 0xE5, 0x00]),
        0x04: bytes([int(30 * 2.55)]), 0x05: bytes([88 + 40]), 0x0E: bytes([int((12 + 64) * 2)]),
        0x0C: int(rpm * 4).to_bytes(2, "big"), 0x0D: bytes([int(40 + 20 * math.sin(t / 3))]),
        0x0F: bytes([25 + 40]), 0x10: int(rpm / 1000 * 3.2 * 100).to_bytes(2, "big"),
        0x11: bytes([40]), 0x1F: int(t).to_bytes(2, "big"), 0x44: (32768).to_bytes(2, "big"),
        0x46: bytes([7 + 40]), 0x42: (14100).to_bytes(2, "big"),
    }.get(pid)


def kframe(ch, status, data):                      # K-line data frame: the line's bytes, no timestamp
    body = bytes([status]) + data
    return b"ar" + str(ch).encode() + bytes([len(body)]) + body


def kwp(fmt_tgt_src, data):                        # KWP message with its checksum
    m = bytes(fmt_tgt_src) + bytes(data)
    return m + bytes([sum(m) & 0xFF])


def frame(ch, status, payload):
    body = bytes([status]) + int((time.time() - T0) * 1e6 % 2**32).to_bytes(4, "big") + payload
    return b"ar" + str(ch).encode() + bytes([len(body)]) + body


def main():
    master, slave = os.openpty()
    tty.setraw(slave)
    print(os.ttyname(slave), flush=True)
    buf = b""
    while True:
        buf += os.read(master, 4096)
        while True:
            j = buf.find(b"\r\n")
            if j < 0: break
            line = buf[:j].decode("ascii", "replace").strip(); rest = buf[j + 2:]
            if not line: buf = rest; continue
            parts = line.split(); verb = parts[0]
            need = 0                                         # binary payload length that follows
            if verb.startswith("att") or verb.startswith("aty"): need = int(parts[1])
            elif verb.startswith("atf"): need = int(parts[3]) * (3 if parts[1] == "3" else 2)
            if len(rest) < need: break                       # wait for the payload
            payload, buf = rest[:need], rest[need:]
            seq = parts[-1]
            out = b""
            if verb == "ati": out = b"ari main code version : 1.17.4877 (fake)\r\n"
            elif verb in ("atz", "ata") or verb.startswith("ato") or verb.startswith("atc"): out = f"aro {seq}\r\n".encode()
            elif verb.startswith("atf"): out = f"arf{verb[3]} 0 {seq}\r\n".encode()
            elif verb.startswith("ats"): out = f"aro {seq}\r\n".encode()
            elif verb.startswith("aty"):                                  # K-line fast init
                time.sleep(0.12)
                if KLINE and ignition() != "silent" and payload[:4] == bytes([0xC1, 0x33, 0xF1, 0x81]):
                    KINIT["done"] = True
                    resp = kwp([0x83, 0xF1, 0x10], [0xC1, 0xE9, 0x8F])
                    out = f"ary{verb[3]} {len(resp)} {seq}\r\n".encode() + resp
                else: out = f"are 7 {seq}\r\n".encode()
            elif verb == "att4":                                          # K-line message
                out = f"aro {seq}\r\n".encode()
                time.sleep(0.03)
                if KLINE and KINIT["done"] and ignition() != "silent" and len(payload) >= 5 and payload[3] == 0x01:
                    pid = payload[4]; v = ecu_value(pid)
                    if v is not None:
                        out += frame(4, 0x80, b"") + kframe(4, 0x00, kwp([0x80 | (2 + len(v)), 0xF1, 0x10], bytes([0x41, pid]) + v)) + frame(4, 0x40, b"")
                time.sleep(0.03)
            elif verb == "atr": out = f"arr 16 12450 {seq}\r\n".encode()
            elif verb.startswith("att"):
                can_id, data = payload[:4], payload[4:]
                out = f"aro {seq}\r\n".encode() + frame(6, 0x10, can_id)
                if not KLINE and ignition() != "silent" and int.from_bytes(can_id, "big") == 0x7E0 and data[:1] == b"\x01":
                    pids = list(data[1:]) if not NO_MULTI else list(data[1:2])
                    resp = b"\x41" + b"".join(bytes([p]) + ecu_value(p) for p in pids if ecu_value(p))
                    rid = (0x7E8).to_bytes(4, "big")
                    if len(resp) > 7: out += frame(6, 0x80, rid)          # segmented: START with the id only
                    out += frame(6, 0x40, rid + resp)
                time.sleep(0.008)                                         # a CAN round trip
            os.write(master, out)


if __name__ == "__main__":
    main()
