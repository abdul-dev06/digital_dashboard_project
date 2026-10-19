// Tests web/openport.js against obd/fake_openport.py (a pretend cable + ECU on a pseudo-terminal).
//   python3 obd/fake_openport.py [--no-multi | --silent]   -> prints a device path
//   node tools/test_openport_js.mjs <device path> [seconds]
import fs from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("../web/openport.js");
const { OpenPort, poll } = globalThis.OpenPortOBD;

const dev = process.argv[2], secs = +(process.argv[3] || 6);
const fd = fs.openSync(dev, fs.constants.O_RDWR | fs.constants.O_NOCTTY);
const transport = {
  write: data => new Promise((res, rej) => fs.write(fd, Buffer.from(data), e => e ? rej(e) : res())),
  read: () => new Promise((res, rej) => fs.read(fd, Buffer.alloc(4096), 0, 4096, null, (e, n, b) => e ? rej(e) : res(new Uint8Array(b.subarray(0, n))))),
};
const port = new OpenPort(transport);
let last = null, count = 0;
setTimeout(() => {
  console.log("states emitted:", count);
  console.log("last state:", JSON.stringify(last));
  process.exit(0);
}, secs * 1000);
poll(port, s => { last = s; count++; }, m => console.log("log:", m)).catch(e => { console.log("error:", e.message); process.exit(1); });
