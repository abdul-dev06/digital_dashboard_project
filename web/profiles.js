// Car profiles: everything that belongs to one car. Pick one on the page (or add ?car=<id> to the
// address); the choice is remembered in this browser.
//
//   logo, logoRedline   images (paths from web/, or null for the built-in emblem). Sport mode fades
//                       the main logo in towards redline and swaps to the redline logo at redline.
//   sounds.start/alert  start-up chime and warning chime (null = silent)
//   obd                 which way to reach the engine ECU first: "can" (ISO 15765, most 2008+ cars) or
//                       "kwp" (K-line ISO 14230, many 2000s European cars). The other is tried too.
//   engine              overrides for the dashboard's car settings (CFG in index.html): redline,
//                       idle, speedometer end, tank size
//   body                measurements for the 3D car (metres). style: sedan, coupe, hatch or suv.
//                       frontOverhang = front bumper to front axle. The shape comes from the style,
//                       scaled to these numbers (see car3d.js).
//
// Logos, chimes and pictures you add with the page's buttons are kept per profile in this browser.
// To add a car: copy a block, give it a new id, change the numbers, and put its files in assets/.
window.CAR_PROFILES = [
  {
    id: "elantra-2007",
    name: "2007 Hyundai Elantra",
    logo: "../assets/hyundai/logo.png",
    logoRedline: "../assets/hyundai/logo.png",
    sounds: { start: "../assets/start.mp3", alert: "../assets/alert.mp3" },
    obd: ["can", "kwp"],                 // CAN 500k (ISO 15765), confirmed 2026-10-15
    engine: { redline: 5500, idle: 760, speedMax: 220, tankLitres: 55 },
    body: { style: "sedan", length: 4.505, width: 1.775, height: 1.48, wheelbase: 2.65,
            frontOverhang: 0.92, wheelRadius: 0.31, track: 1.53 },
  },
  {
    // W220 S500 4MATIC (VIN WDBNG84J...), M113 5.0 V8. OBD on the K-line: ISO 14230-4 KWP fast init (Torque, 2026-10-19)
    id: "s500-2005",
    name: "2005 Mercedes-Benz S500 4MATIC",
    logo: null, logoRedline: null,        // add the logos in Settings (or drop files in assets/ and point here)
    sounds: { start: "../assets/start.mp3", alert: "../assets/alert.mp3" },
    obd: ["kwp", "can"],
    engine: { redline: 6000, idle: 600, speedMax: 260, tankLitres: 88 },
    body: { style: "sedan", length: 5.043, width: 1.855, height: 1.444, wheelbase: 2.965,
            frontOverhang: 0.95, wheelRadius: 0.34, track: 1.58 },
  },
];
