// OpenPort 2.0 (Tactrix) driver for the browser: reads the car's OBD2 data straight from the cable
// over WebUSB (Chrome on Android, desktop Chrome), and hands it to the cluster like the Rock64's
// obd/reader.py does. Same protocol, same polling plan; see reader.py for the notes.
//
// The cable: text commands "at<verb><ch> <args> <seq>\r\n" (+ binary payload), text replies
// "ar<letter> ...\r\n" and binary frames "ar<digit><len><status><ts:4><payload>". It does ISO-TP.
// Protocol reference: github.com/bisak/openport-j2534/blob/main/docs/PROTOCOL.md
//
// Works in Node too (for testing against obd/fake_openport.py): see tools/test_openport_js.mjs.
(function (root) {
  "use strict";
  const REQ_ID = 0x7E0, RESP_ID = 0x7E8, CH = 6, PAD = 64;
  const REPLY_TIMEOUT = 150;                         // ms to wait for an ECU reply
  const enc = s => new TextEncoder().encode(s);

  const PIDS = {
    0x01: [4, d => ({ checkEngine: !!(d[0] & 0x80), dtcCount: d[0] & 0x7F })],
    0x04: [1, d => ({ engineLoad: d[0] * 100 / 255 })],
    0x05: [1, d => ({ coolant: d[0] - 40 })],
    0x0C: [2, d => ({ rpm: (d[0] * 256 + d[1]) / 4 })],
    0x0D: [1, d => ({ speed: d[0] })],
    0x0E: [1, d => ({ timing: d[0] / 2 - 64 })],
    0x0F: [1, d => ({ intakeTemp: d[0] - 40 })],
    0x10: [2, d => ({ maf: (d[0] * 256 + d[1]) / 100 })],
    0x11: [1, d => ({ throttle: d[0] * 100 / 255 })],
    0x1F: [2, d => ({ runTime: d[0] * 256 + d[1] })],
    0x42: [2, d => ({ moduleVolts: (d[0] * 256 + d[1]) / 1000 })],
    0x44: [2, d => ({ lambda: (d[0] * 256 + d[1]) * 2 / 65536 })],
    0x46: [1, d => ({ outsideTemp: d[0] - 40 })],
  };
  const GROUPS = [
    { pids: [0x0C, 0x0D], every: 0 },
    { pids: [0x10, 0x44], every: 500 },
    { pids: [0x05, 0x04, 0x0E, 0x11, 0x1F, 0x01], every: 1000 },
    { pids: [0x0F, 0x46], every: 5000 },
  ];
  const BATTERY_EVERY = 1000;

  function parseMode01(data) {
    const out = {}, got = [];
    if (!data || data[0] !== 0x41) return { vals: out, got };
    let i = 1;
    while (i < data.length) {
      const pid = data[i], p = PIDS[pid];
      if (!p || i + 1 + p[0] > data.length) break;
      Object.assign(out, p[1](data.slice(i + 1, i + 1 + p[0])));
      got.push(pid); i += 1 + p[0];
    }
    return { vals: out, got };
  }

  // ---- protocol over any byte transport: { write(Uint8Array) -> Promise, read() -> Promise<Uint8Array> } ----
  class OpenPort {
    constructor(transport) {
      this.t = transport; this.buf = new Uint8Array(0); this.seq = 10;
      this.lines = []; this.frames = []; this.waiters = []; this.closed = false;
      // counters for the on-page diagnostics: what went out, what came back
      this.stats = { sent: 0, aro: 0, odd: {}, rx: 0, frames: {}, ecu: 0 };
      this._pump();
    }
    async _pump() {
      while (!this.closed) {
        let chunk;
        try { chunk = await this.t.read(); } catch (e) { this.closed = true; this.error = e; break; }
        if (!chunk || !chunk.length) continue;
        this.stats.rx += chunk.length;
        const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length); this.buf = b;
        this._parse();
        const w = this.waiters; this.waiters = []; w.forEach(f => f());
      }
      const w = this.waiters; this.waiters = []; w.forEach(f => f());
    }
    _parse() {
      for (;;) {
        let i = -1;
        for (let k = 0; k + 1 < this.buf.length; k++) if (this.buf[k] === 0x61 && this.buf[k + 1] === 0x72) { i = k; break; }   // "ar"
        if (i < 0) { this.buf = this.buf.slice(-1); return; }
        if (i) this.buf = this.buf.slice(i);
        if (this.buf.length < 4) return;
        const c = this.buf[2];
        if (c >= 0x30 && c <= 0x39) {                           // binary frame
          const n = this.buf[3];
          if (this.buf.length < 4 + n) return;
          const body = this.buf.slice(4, 4 + n); this.buf = this.buf.slice(4 + n);
          if (body.length >= 5) {
            this.frames.push({ ch: c - 0x30, status: body[0], payload: body.slice(5) });
            const k = `ch${c - 0x30}/${body[0].toString(16)}`; this.stats.frames[k] = (this.stats.frames[k] || 0) + 1;
          }
        } else {                                                // text reply up to \r\n
          let j = -1;
          for (let k = 0; k + 1 < this.buf.length; k++) if (this.buf[k] === 13 && this.buf[k + 1] === 10) { j = k; break; }
          if (j < 0) return;
          this.lines.push(new TextDecoder().decode(this.buf.slice(0, j))); this.buf = this.buf.slice(j + 2);
        }
      }
    }
    _wait(ms) {                                                 // until new data or ms
      return new Promise(res => { const t = setTimeout(res, Math.max(0, ms)); this.waiters.push(() => { clearTimeout(t); res(); }); });
    }
    async cmd(text, payload, timeout = 600, numbered = true) {
      this.seq = this.seq < 9999 ? this.seq + 1 : 10;
      const line = numbered ? `${text} ${this.seq}` : text, head = enc(line + "\r\n");
      const msg = new Uint8Array(head.length + (payload ? payload.length : 0)); msg.set(head); if (payload) msg.set(payload, head.length);
      await this.t.write(msg);
      const end = Date.now() + timeout, want = String(this.seq);
      while (Date.now() < end && !this.closed) {
        for (let k = 0; k < this.lines.length; k++) {
          const parts = this.lines[k].trim().split(/\s+/);
          if (!numbered || parts[parts.length - 1] === want) { const l = this.lines[k]; this.lines.splice(0, k + 1); return l; }
        }
        await this._wait(end - Date.now());
      }
      return null;
    }
    async openCan() {
      await this.t.write(enc("\r\n\r\n"));
      await this.cmd("atz", null, 400); await this.cmd("ata", null, 400);
      this.lines = [];
      const ver = await this.cmd("ati", null, 600, false);
      if (!ver || !ver.startsWith("ari")) throw new Error("no answer from the cable");
      let r = await this.cmd(`ato${CH} 0 500000 0`);
      if (!r || !r.startsWith("aro")) throw new Error("could not open CAN: " + r);
      const fc = new Uint8Array(12), dv = new DataView(fc.buffer);
      dv.setUint32(0, 0x7FF); dv.setUint32(4, RESP_ID); dv.setUint32(8, REQ_ID);
      r = await this.cmd(`atf${CH} 3 ${PAD} 4`, fc);
      if (!r || !r.startsWith("arf")) throw new Error("could not set the filter: " + r);
      return ver.slice(4).trim();
    }
    async battery() {
      const r = await this.cmd("atr 16", null, 500);
      const p = r && r.split(/\s+/); return p && p[0] === "arr" ? +p[2] / 1000 : null;
    }
    async request(data) {
      this.frames = [];
      const msg = new Uint8Array(4 + data.length); new DataView(msg.buffer).setUint32(0, REQ_ID); msg.set(data, 4);
      this.stats.sent++;
      const r = await this.cmd(`att${CH} ${msg.length} ${PAD} 100000`, msg, 300);
      if (!r || !r.startsWith("aro")) { const k = r ? r.split(/\s+/).slice(0, 2).join(" ") : "no reply"; this.stats.odd[k] = (this.stats.odd[k] || 0) + 1; return null; }
      this.stats.aro++;
      const end = Date.now() + REPLY_TIMEOUT;
      while (Date.now() < end && !this.closed) {
        for (const f of this.frames) {
          // 0x40 = end of a received message; 0x10 = our transmit indication; 0x20 = loopback
          if (f.ch === CH && (f.status & 0x40) && !(f.status & 0x30) && f.payload.length > 4) {
            const id = new DataView(f.payload.buffer, f.payload.byteOffset).getUint32(0);
            if (id === RESP_ID) { this.stats.ecu++; return f.payload.slice(4); }
          }
        }
        this.frames = [];
        await this._wait(end - Date.now());
      }
      return null;
    }
    async supported() {
      const pids = [];
      for (const base of [0x00, 0x20, 0x40]) {
        const r = await this.request([0x01, base]);
        if (!r || r.length < 6 || r[0] !== 0x41 || r[1] !== base) break;
        const bits = new DataView(r.buffer, r.byteOffset).getUint32(2);
        for (let i = 0; i < 32; i++) if (bits & (1 << (31 - i))) pids.push(base + i + 1);
        if (!(bits & 1)) break;
      }
      return pids;
    }
    async close() { try { await this.cmd("atz", null, 300); } catch (e) {} this.closed = true; }
  }

  // ---- polling loop: calls onState(state) with the same shape as reader.py's JSON ----
  async function poll(port, onState, log = () => {}) {
    const state = { mode: "noecu" };
    const emit = () => onState(Object.assign({}, state, { t: Date.now() / 1000 }));
    state.cable = await port.openCan(); log("cable: " + state.cable); emit();
    const due = GROUPS.map(() => 0), single = GROUPS.map(() => false);
    let nextBatt = 0, lastEcu = 0, polls = 0, tRate = Date.now(), checked = false;
    while (!port.closed) {
      const now = Date.now();
      if (now >= nextBatt) { const v = await port.battery(); if (v !== null) state.batteryVolts = v; nextBatt = now + BATTERY_EVERY; }
      for (let gi = 0; gi < GROUPS.length; gi++) {
        if (now < due[gi]) continue;
        due[gi] = now + GROUPS[gi].every;
        const asks = single[gi] ? GROUPS[gi].pids.map(p => [p]) : [GROUPS[gi].pids];
        for (const ask of asks) {
          const { vals, got } = parseMode01(await port.request([0x01, ...ask]));
          if (got.length) {
            lastEcu = Date.now(); polls++;
            Object.assign(state, vals, { mode: "live" }); emit();
            if (!checked) {
              checked = true;
              const sup = await port.supported();
              if (sup.length) { state.supported = sup.map(p => p.toString(16).toUpperCase().padStart(2, "0")); log("ECU supports PIDs: " + state.supported.join(" ")); }
            }
          }
          if (ask.length > 1 && got.length > 0 && got.length < ask.length) { single[gi] = true; log("group -> one PID at a time"); }
        }
      }
      if (Date.now() - lastEcu > 2000 && state.mode !== "noecu") { state.mode = "noecu"; emit(); }
      if (Date.now() - tRate > 5000) {
        state.rate = Math.round(polls / ((Date.now() - tRate) / 1000));
        const st = port.stats, fr = Object.entries(st.frames).map(([k, n]) => `${k}:${n}`).join(" ") || "none",
              odd = Object.entries(st.odd).map(([k, n]) => `${k}:${n}`).join(" ");
        log(`${state.mode} · ${state.rate}/s · battery ${state.batteryVolts ?? "?"} V · requests ${st.sent}, cable ok ${st.aro}, ECU replies ${st.ecu} · frames ${fr}` + (odd ? ` · odd replies ${odd}` : "") + ` · ${st.rx} bytes in`);
        port.stats = { sent: 0, aro: 0, odd: {}, rx: 0, frames: {}, ecu: 0 };
        polls = 0; tRate = Date.now(); emit();
      }
      if (state.mode === "noecu") { emit(); await new Promise(r => setTimeout(r, 200)); }
    }
    log("stopped: " + (port.error ? "USB read failed: " + (port.error.message || port.error) : "closed"));
    state.mode = "demo"; emit();
  }

  // ---- WebUSB transport (browser) ----
  const USB_FILTER = { vendorId: 0x0403, productId: 0xcc4d };   // Tactrix OpenPort 2.0
  async function usbTransport(dev, log = () => {}) {
    await dev.open();
    if (!dev.configuration) await dev.selectConfiguration(1);
    let dataIf = null, epIn = null, epOut = null;
    for (const intf of dev.configuration.interfaces) {
      for (const alt of intf.alternates) {
        const i = alt.endpoints.find(e => e.direction === "in" && e.type === "bulk");
        const o = alt.endpoints.find(e => e.direction === "out" && e.type === "bulk");
        if (i && o) { dataIf = intf.interfaceNumber; epIn = i.endpointNumber; epOut = o.endpointNumber; }
      }
    }
    if (dataIf === null) throw new Error("no data interface on the cable");
    try { await dev.claimInterface(0); await dev.controlTransferOut({ requestType: "class", recipient: "interface", request: 0x22, value: 1, index: 0 }); }
    catch (e) { log("serial setup skipped: " + (e.message || e)); }
    await dev.claimInterface(dataIf);
    log(`USB: ${dev.productName || "cable"} · data interface ${dataIf} · in ${epIn} out ${epOut}`);
    return {
      async write(data) { for (let k = 0; k < data.length; k += 64) await dev.transferOut(epOut, data.slice(k, k + 64)); },
      async read() {
        const r = await dev.transferIn(epIn, 64);
        if (r.status === "stall") { await dev.clearHalt("in", epIn); return new Uint8Array(0); }
        return r.data ? new Uint8Array(r.data.buffer, r.data.byteOffset, r.data.byteLength) : new Uint8Array(0);
      },
      async close() { try { await dev.close(); } catch (e) {} },
    };
  }
  // connect(): ask for the cable (or reuse one already allowed), then poll forever
  async function connect(onState, log, ask = true) {
    if (!("usb" in navigator)) throw new Error("this browser can't talk to USB devices (needs Chrome)");
    let dev = (await navigator.usb.getDevices()).find(d => d.vendorId === USB_FILTER.vendorId && d.productId === USB_FILTER.productId);
    if (!dev && ask) dev = await navigator.usb.requestDevice({ filters: [USB_FILTER] });
    if (!dev) return false;
    const t = await usbTransport(dev, log), port = new OpenPort(t);
    try { await poll(port, onState, log); } finally { await t.close(); }
    return true;
  }

  root.OpenPortOBD = { OpenPort, poll, parseMode01, connect, usbTransport, USB_FILTER };
})(typeof window !== "undefined" ? window : globalThis);
