// ponytail: one-off generator for the content format card images —
// renders stylised SVG scenes (4:3, 1080x810) into frontend/public/formats.
// Pure vector scenes, no text — swapped for real photos later if desired.
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const W = 1080;
const H = 810;

const defs = (id: string, c1: string, c2: string) =>
  `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>`;

const phone = (x: number, y: number, w: number, h: number, screen: string, tilt = 0) => `
<g transform="rotate(${tilt} ${x + w / 2} ${y + h / 2})">
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w * 0.14}" fill="#141414"/>
  <rect x="${x + w * 0.055}" y="${y + h * 0.035}" width="${w * 0.89}" height="${h * 0.93}" rx="${w * 0.1}" fill="${screen}"/>
  <rect x="${x + w * 0.36}" y="${y + h * 0.045}" width="${w * 0.28}" height="${h * 0.02}" rx="${h * 0.01}" fill="#141414"/>
</g>`;

const person = (cx: number, cy: number, r: number, skin: string, shirt: string) => `
<circle cx="${cx}" cy="${cy}" r="${r}" fill="${skin}"/>
<path d="M ${cx - r * 1.7} ${cy + r * 3.4} Q ${cx} ${cy + r * 1.1} ${cx + r * 1.7} ${cy + r * 3.4} L ${cx + r * 1.7} ${cy + r * 4.4} L ${cx - r * 1.7} ${cy + r * 4.4} Z" fill="${shirt}"/>`;

const blob = (cx: number, cy: number, r: number, fill: string, op = 0.5) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${op}"/>`;

const scenes: Record<string, string> = {
  // 1. Slideshow — laptop on a desk showing a multi-image carousel
  slideshow: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#fdf3e7", "#f6dfc8")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${blob(920, 120, 180, "#FF941F", 0.18)}
    ${blob(120, 700, 200, "#e8a15c", 0.2)}
    <rect x="150" y="640" width="780" height="26" rx="13" fill="#d9b58e"/>
    <rect x="230" y="180" width="620" height="400" rx="18" fill="#1f1f1f"/>
    <rect x="248" y="198" width="584" height="364" rx="10" fill="#ffffff"/>
    <rect x="270" y="222" width="168" height="240" rx="10" fill="#ffb56b"/>
    <circle cx="354" cy="300" r="34" fill="#fff3e4"/>
    <rect x="292" y="356" width="124" height="12" rx="6" fill="#fff3e4"/>
    <rect x="292" y="380" width="90" height="12" rx="6" fill="#fff3e4" opacity="0.8"/>
    <rect x="456" y="222" width="168" height="240" rx="10" fill="#8a5a33"/>
    <circle cx="540" cy="300" r="34" fill="#f6dfc8"/>
    <rect x="478" y="356" width="124" height="12" rx="6" fill="#f6dfc8" opacity="0.85"/>
    <rect x="478" y="380" width="90" height="12" rx="6" fill="#f6dfc8" opacity="0.6"/>
    <rect x="642" y="222" width="168" height="240" rx="10" fill="#FF941F"/>
    <circle cx="726" cy="300" r="34" fill="#fff3e4"/>
    <rect x="664" y="356" width="124" height="12" rx="6" fill="#fff3e4" opacity="0.9"/>
    <rect x="664" y="380" width="90" height="12" rx="6" fill="#fff3e4" opacity="0.7"/>
    <circle cx="504" cy="506" r="8" fill="#FF941F"/>
    <circle cx="532" cy="506" r="8" fill="#e3c9ac"/>
    <circle cx="560" cy="506" r="8" fill="#e3c9ac"/>
    <rect x="180" y="580" width="720" height="20" rx="10" fill="#2b2b2b"/>
    <rect x="770" y="560" width="120" height="80" rx="10" fill="#c98a4b" opacity="0.75"/>
  </svg>`,

  // 2. Wall of Text — mirror-selfie style bathroom scene
  walloftext: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#eef2f4", "#dbe4ea")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect x="330" y="70" width="420" height="640" rx="150" fill="#cfdbe3" stroke="#b7c6d1" stroke-width="10"/>
    <rect x="360" y="100" width="360" height="580" rx="130" fill="#f3f7f9"/>
    ${person(540, 300, 62, "#e8b48c", "#2f2f2f")}
    <rect x="590" y="330" width="46" height="120" rx="20" fill="#1f1f1f" transform="rotate(18 613 390)"/>
    ${blob(180, 200, 90, "#9fb8c6", 0.4)}
    <rect x="120" y="430" width="70" height="150" rx="18" fill="#b8cdd8"/>
    <circle cx="155" cy="410" r="42" fill="#7ea88f" opacity="0.8"/>
    <rect x="800" y="480" width="150" height="18" rx="9" fill="#b7c6d1"/>
    <rect x="800" y="520" width="150" height="18" rx="9" fill="#b7c6d1" opacity="0.7"/>
    <rect x="800" y="560" width="110" height="18" rx="9" fill="#b7c6d1" opacity="0.5"/>
  </svg>`,

  // 3. Video Hook & Demo — hand holding a phone with an app on screen
  videohookdemo: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#332617", "#5c4326")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${blob(880, 140, 190, "#FF941F", 0.25)}
    <path d="M 300 810 Q 420 560 500 520 L 620 540 Q 560 700 520 810 Z" fill="#e8b48c"/>
    ${phone(430, 130, 260, 520, "#fff7ee")}
    <rect x="462" y="210" width="196" height="90" rx="12" fill="#FF941F" opacity="0.9"/>
    <rect x="462" y="320" width="196" height="26" rx="13" fill="#f0d9bd"/>
    <rect x="462" y="362" width="150" height="26" rx="13" fill="#f0d9bd" opacity="0.8"/>
    <circle cx="560" cy="500" r="44" fill="#FF941F"/>
    <path d="M 546 478 L 546 522 L 584 500 Z" fill="#fff7ee"/>
    ${blob(160, 620, 120, "#8a6a45", 0.4)}
  </svg>`,

  // 4. Speaking Hook & Demo — woman speaking directly to camera
  speakinghookdemo: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#fbe9e4", "#f3cdc2")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${blob(200, 160, 150, "#ef9f86", 0.3)}
    ${blob(900, 640, 170, "#e8a08b", 0.28)}
    ${person(540, 330, 100, "#d99a72", "#7c3f2e")}
    <ellipse cx="540" cy="255" rx="105" ry="70" fill="#5d2f22" opacity="0.9"/>
    <ellipse cx="475" cy="470" rx="26" ry="14" fill="#d99a72"/>
    <ellipse cx="605" cy="470" rx="26" ry="14" fill="#d99a72"/>
    <path d="M 505 375 Q 540 400 575 375" stroke="#8c4f3a" stroke-width="10" fill="none" stroke-linecap="round"/>
    <circle cx="505" cy="330" r="9" fill="#3d2117"/>
    <circle cx="575" cy="330" r="9" fill="#3d2117"/>
    <rect x="80" y="700" width="920" height="60" rx="30" fill="#e0a48e" opacity="0.5"/>
  </svg>`,

  // 5. Talking Head UGC — young man speaking to camera, ring-light vibe
  talkingheadugc: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#e9eef7", "#ccd8ec")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <circle cx="540" cy="360" r="300" fill="none" stroke="#ffffff" stroke-width="26" opacity="0.85"/>
    ${person(540, 350, 92, "#c98a5e", "#34507c")}
    <ellipse cx="540" cy="278" rx="96" ry="52" fill="#24344f"/>
    <circle cx="506" cy="352" r="8" fill="#20242c"/>
    <circle cx="574" cy="352" r="8" fill="#20242c"/>
    <path d="M 508 396 Q 540 416 572 396" stroke="#7c4a2d" stroke-width="9" fill="none" stroke-linecap="round"/>
    <rect x="500" y="640" width="80" height="120" rx="10" fill="#374a68"/>
    <rect x="470" y="740" width="140" height="22" rx="11" fill="#2c3c56"/>
  </svg>`,

  // 6. Green Screen Meme — goofy cat over a living-room background
  greenscreenmeme: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#f6ead2", "#ecd7ac")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect x="90" y="140" width="330" height="230" rx="14" fill="#c9a877" opacity="0.7"/>
    <rect x="110" y="160" width="290" height="190" rx="8" fill="#f8f1e2"/>
    <circle cx="255" cy="255" r="60" fill="#e8b06c" opacity="0.8"/>
    <rect x="640" y="430" width="340" height="180" rx="20" fill="#b98a5a" opacity="0.75"/>
    <rect x="120" y="600" width="840" height="150" rx="24" fill="#d9bc8f" opacity="0.8"/>
    <ellipse cx="540" cy="520" rx="190" ry="160" fill="#f2a64c"/>
    <circle cx="540" cy="330" r="130" fill="#f7b968"/>
    <path d="M 435 260 L 455 170 L 515 235 Z" fill="#f7b968"/>
    <path d="M 645 260 L 625 170 L 565 235 Z" fill="#f7b968"/>
    <path d="M 450 245 L 462 190 L 500 232 Z" fill="#e88f2f"/>
    <path d="M 630 245 L 618 190 L 580 232 Z" fill="#e88f2f"/>
    <circle cx="495" cy="320" r="16" fill="#3a2a17"/>
    <circle cx="585" cy="320" r="16" fill="#3a2a17"/>
    <path d="M 540 355 L 528 375 L 552 375 Z" fill="#b25f2a"/>
    <path d="M 520 398 Q 540 412 560 398" stroke="#8c4a20" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M 420 340 L 340 330 M 420 360 L 345 370 M 660 340 L 740 330 M 660 360 L 735 370" stroke="#8c5a2b" stroke-width="6" stroke-linecap="round"/>
  </svg>`,

  // 7. Talking Head Green Screen — presenter cornered over an app UI
  talkingheadgreenscreen: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#eaf6f2", "#cde9e0")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect x="80" y="90" width="920" height="620" rx="24" fill="#ffffff" stroke="#d3e6df" stroke-width="6"/>
    <rect x="80" y="90" width="920" height="90" rx="24" fill="#dff0ea"/>
    <circle cx="140" cy="135" r="18" fill="#8fc6b4"/>
    <rect x="180" y="120" width="220" height="30" rx="15" fill="#bfe0d5"/>
    <rect x="120" y="220" width="300" height="200" rx="16" fill="#eef8f4" stroke="#d3e6df" stroke-width="4"/>
    <path d="M 150 380 L 220 320 L 280 350 L 380 260" stroke="#3aa88a" stroke-width="14" fill="none" stroke-linecap="round"/>
    <rect x="460" y="220" width="240" height="58" rx="14" fill="#d9efe7"/>
    <rect x="460" y="300" width="240" height="58" rx="14" fill="#e7f5f0"/>
    <rect x="460" y="380" width="180" height="58" rx="14" fill="#eef8f4"/>
    <circle cx="790" cy="330" r="110" fill="none" stroke="#3aa88a" stroke-width="26" stroke-dasharray="520 200"/>
    ${person(830, 500, 74, "#e3a87c", "#1f6b57")}
    <ellipse cx="830" cy="442" rx="78" ry="44" fill="#37281e"/>
  </svg>`,

  // 8. Product Spokesperson — woman presenting a bottle product
  productspokesperson: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#fdf0e2", "#f7d9bb")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${blob(860, 160, 170, "#FF941F", 0.22)}
    ${person(430, 340, 95, "#e0a377", "#9c4a2f")}
    <ellipse cx="430" cy="265" rx="100" ry="60" fill="#402418"/>
    <circle cx="398" cy="342" r="8" fill="#2a1810"/>
    <circle cx="462" cy="342" r="8" fill="#2a1810"/>
    <path d="M 400 386 Q 430 406 460 386" stroke="#8c4a30" stroke-width="9" fill="none" stroke-linecap="round"/>
    <ellipse cx="620" cy="480" rx="34" ry="20" fill="#e0a377"/>
    <rect x="595" y="300" width="130" height="190" rx="26" fill="#FF941F"/>
    <rect x="620" y="270" width="80" height="44" rx="10" fill="#d97a12"/>
    <rect x="615" y="350" width="90" height="70" rx="10" fill="#fff3e4" opacity="0.92"/>
    <circle cx="760" cy="240" r="10" fill="#FF941F" opacity="0.7"/>
    <circle cx="800" cy="330" r="7" fill="#FF941F" opacity="0.5"/>
    <circle cx="770" cy="430" r="12" fill="#FF941F" opacity="0.4"/>
  </svg>`,

  // 9. Green Screen Mobile with App — presenter holding phone with analytics
  greenscreenmobile: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#eef0fb", "#d5dbf5")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${blob(170, 150, 140, "#8a97e8", 0.3)}
    ${person(400, 320, 88, "#d9a06f", "#46529e")}
    <ellipse cx="400" cy="250" rx="92" ry="52" fill="#241a12"/>
    <circle cx="370" cy="322" r="8" fill="#1c140d"/>
    <circle cx="432" cy="322" r="8" fill="#1c140d"/>
    <path d="M 372 364 Q 400 382 428 364" stroke="#8a5a34" stroke-width="9" fill="none" stroke-linecap="round"/>
    ${phone(580, 180, 300, 560, "#ffffff", -8)}
    <rect x="618" y="270" width="220" height="120" rx="14" fill="#eef0fb"/>
    <path d="M 640 360 L 690 320 L 730 340 L 800 285" stroke="#5468d8" stroke-width="12" fill="none" stroke-linecap="round"/>
    <rect x="622" y="430" width="34" height="120" rx="8" fill="#8a97e8"/>
    <rect x="672" y="470" width="34" height="80" rx="8" fill="#aab4ee"/>
    <rect x="722" y="410" width="34" height="140" rx="8" fill="#5468d8"/>
    <rect x="772" y="450" width="34" height="100" rx="8" fill="#c3caf4"/>
    <rect x="618" y="590" width="220" height="30" rx="15" fill="#e4e7f9"/>
    <rect x="618" y="636" width="160" height="30" rx="15" fill="#edeffb"/>
  </svg>`,

  // 10. Claymation — clay character on a craft set
  claymation: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#f4e8d8", "#e6cfae")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <rect x="0" y="600" width="${W}" height="210" fill="#c9a877" opacity="0.6"/>
    ${blob(240, 640, 70, "#b08850", 0.6)}
    ${blob(860, 660, 90, "#a87c46", 0.5)}
    <ellipse cx="540" cy="690" rx="200" ry="36" fill="#8c6a3f" opacity="0.45"/>
    <ellipse cx="540" cy="470" rx="150" ry="190" fill="#e86f4a"/>
    <ellipse cx="540" cy="470" rx="150" ry="190" fill="none" stroke="#c9552f" stroke-width="8" opacity="0.5"/>
    <circle cx="540" cy="280" r="105" fill="#f0825c"/>
    <circle cx="500" cy="265" r="16" fill="#3d1f12"/>
    <circle cx="580" cy="265" r="16" fill="#3d1f12"/>
    <circle cx="505" cy="258" r="5" fill="#ffffff"/>
    <circle cx="585" cy="258" r="5" fill="#ffffff"/>
    <path d="M 495 315 Q 540 350 585 315" stroke="#3d1f12" stroke-width="10" fill="none" stroke-linecap="round"/>
    <ellipse cx="400" cy="470" rx="46" ry="30" fill="#f0825c" transform="rotate(-30 400 470)"/>
    <ellipse cx="680" cy="470" rx="46" ry="30" fill="#f0825c" transform="rotate(30 680 470)"/>
    <circle cx="480" cy="180" r="26" fill="#f6a483" opacity="0.8"/>
    <circle cx="610" cy="170" r="18" fill="#f6a483" opacity="0.7"/>
  </svg>`,

  // 11. Character Swap — swap arrows around a presenter
  characterswap: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    ${defs("bg", "#f3ecfa", "#ddd0f0")}
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${blob(160, 620, 150, "#9d7bdc", 0.25)}
    ${blob(920, 160, 160, "#b79ae8", 0.3)}
    ${person(330, 330, 85, "#dba075", "#5b3f96")}
    <ellipse cx="330" cy="262" rx="88" ry="50" fill="#2e2140"/>
    <circle cx="302" cy="332" r="8" fill="#221830"/>
    <circle cx="360" cy="332" r="8" fill="#221830"/>
    ${person(750, 330, 85, "#c88a5c", "#9d7bdc")}
    <ellipse cx="750" cy="262" rx="88" ry="50" fill="#171321"/>
    <circle cx="722" cy="332" r="8" fill="#171321"/>
    <circle cx="780" cy="332" r="8" fill="#171321"/>
    <path d="M 460 250 Q 540 200 620 250" stroke="#7c5cc4" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M 620 250 L 585 225 L 590 268 Z" fill="#7c5cc4"/>
    <path d="M 620 420 Q 540 470 460 420" stroke="#b79ae8" stroke-width="16" fill="none" stroke-linecap="round"/>
    <path d="M 460 420 L 495 445 L 490 402 Z" fill="#b79ae8"/>
  </svg>`,
};

const outDir = path.resolve(process.cwd(), "../frontend/public/formats");
await mkdir(outDir, { recursive: true });

for (const [name, svg] of Object.entries(scenes)) {
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  await writeFile(path.join(outDir, `${name}.png`), png);
  console.log(`wrote ${name}.png (${png.length} bytes)`);
}
console.log("done");
