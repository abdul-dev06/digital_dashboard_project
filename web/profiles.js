// Car profiles: everything that belongs to one car. Pick one on the page (or add ?car=<id> to the
// address); the choice is remembered in this browser.
//
//   logo, logoRedline   images (paths from web/, or null for the built-in emblem). Sport mode fades
//                       the main logo in towards redline and swaps to the redline logo at redline.
//   sounds.start/alert  start-up chime and warning chime (null = silent)
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
    logo: "../assets/logo.png",
    logoRedline: "../assets/logo-redline.png",
    sounds: { start: "../assets/start.mp3", alert: "../assets/alert.mp3" },
    engine: { redline: 6500, idle: 760, speedMax: 220, tankLitres: 55 },
    body: { style: "sedan", length: 4.505, width: 1.775, height: 1.48, wheelbase: 2.65,
            frontOverhang: 0.92, wheelRadius: 0.31, track: 1.53 },
  },
  {
    id: "tucson-2017",
    name: "2017 Hyundai Tucson",
    logo: null, logoRedline: null,
    sounds: { start: null, alert: null },
    engine: { redline: 6500, idle: 700, speedMax: 220, tankLitres: 62 },
    body: { style: "suv", length: 4.475, width: 1.85, height: 1.65, wheelbase: 2.67,
            frontOverhang: 0.9, wheelRadius: 0.35, track: 1.6 },
  },
  {
    id: "forte-koup-2015",
    name: "2015 Kia Forte Koup SX",
    logo: null, logoRedline: null,
    sounds: { start: null, alert: null },
    engine: { redline: 6500, idle: 700, speedMax: 240, tankLitres: 50 },
    body: { style: "coupe", length: 4.53, width: 1.78, height: 1.41, wheelbase: 2.7,
            frontOverhang: 0.9, wheelRadius: 0.32, track: 1.55 },
  },
];
