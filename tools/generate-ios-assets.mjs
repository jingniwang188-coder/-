import { mkdir, writeFile, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const iconPath = join(root, "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png");
const splashDir = join(root, "ios/App/App/Assets.xcassets/Splash.imageset");
const splashPaths = [
  join(splashDir, "splash-2732x2732.png"),
  join(splashDir, "splash-2732x2732-1.png"),
  join(splashDir, "splash-2732x2732-2.png")
];

const clamp = value => Math.max(0, Math.min(255, Math.round(value)));
const mix = (a, b, t) => a + (b - a) * t;
const colorMix = (a, b, t) => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
  mix(a[3] ?? 255, b[3] ?? 255, t)
];

function setPixel(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (Math.floor(y) * png.width + Math.floor(x)) << 2;
  png.data[idx] = clamp(color[0]);
  png.data[idx + 1] = clamp(color[1]);
  png.data[idx + 2] = clamp(color[2]);
  png.data[idx + 3] = clamp(color[3] ?? 255);
}

function blendPixel(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (Math.floor(y) * png.width + Math.floor(x)) << 2;
  const a = (color[3] ?? 255) / 255;
  const inv = 1 - a;
  png.data[idx] = clamp(color[0] * a + png.data[idx] * inv);
  png.data[idx + 1] = clamp(color[1] * a + png.data[idx + 1] * inv);
  png.data[idx + 2] = clamp(color[2] * a + png.data[idx + 2] * inv);
  png.data[idx + 3] = 255;
}

function fillBackground(png, deep = [9, 14, 32, 255], glow = [88, 72, 142, 255]) {
  const w = png.width;
  const h = png.height;
  const gold = [196, 151, 72, 255];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const nx = x / w;
      const ny = y / h;
      const base = colorMix(deep, [18, 29, 62, 255], ny * 0.72);
      const dx = nx - 0.34;
      const dy = ny - 0.24;
      const halo = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2.6);
      const right = Math.max(0, 1 - Math.sqrt((nx - 0.82) ** 2 + (ny - 0.15) ** 2) * 3.2);
      const c1 = colorMix(base, glow, halo * 0.55);
      const c2 = colorMix(c1, gold, right * 0.18);
      setPixel(png, x, y, c2);
    }
  }
}

function fillEllipse(png, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const d = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      if (d <= 1) blendPixel(png, x, y, color);
    }
  }
}

function strokeEllipse(png, cx, cy, rx, ry, width, color) {
  const inner = Math.max(0, 1 - width / Math.max(rx, ry));
  for (let y = Math.floor(cy - ry - width); y <= Math.ceil(cy + ry + width); y += 1) {
    for (let x = Math.floor(cx - rx - width); x <= Math.ceil(cx + rx + width); x += 1) {
      const d = ((x - cx) ** 2) / (rx ** 2) + ((y - cy) ** 2) / (ry ** 2);
      if (d <= 1 && d >= inner) blendPixel(png, x, y, color);
    }
  }
}

function fillCircle(png, cx, cy, r, color) {
  fillEllipse(png, cx, cy, r, r, color);
}

function drawLine(png, x1, y1, x2, y2, width, color) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    fillCircle(png, mix(x1, x2, t), mix(y1, y2, t), width, color);
  }
}

function drawDiamond(png, cx, cy, r, color) {
  for (let y = -r; y <= r; y += 1) {
    const span = r - Math.abs(y);
    for (let x = -span; x <= span; x += 1) blendPixel(png, cx + x, cy + y, color);
  }
}

function random(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function scatterStars(png, count, seed, opacity = 130) {
  const rnd = random(seed);
  for (let i = 0; i < count; i += 1) {
    const x = Math.floor(rnd() * png.width);
    const y = Math.floor(rnd() * png.height);
    const r = 1 + Math.floor(rnd() * 3);
    fillCircle(png, x, y, r, [255, 231, 170, opacity * (0.45 + rnd() * 0.55)]);
  }
}

function drawTarotEye(png, cx, cy, scale = 1) {
  const gold = [226, 179, 87, 235];
  const softGold = [255, 226, 152, 120];
  const violet = [149, 87, 218, 230];
  const white = [255, 247, 219, 235];

  fillEllipse(png, cx, cy, 255 * scale, 122 * scale, [235, 205, 132, 32]);
  strokeEllipse(png, cx, cy, 260 * scale, 126 * scale, 18 * scale, gold);
  strokeEllipse(png, cx, cy, 176 * scale, 176 * scale, 10 * scale, softGold);
  fillCircle(png, cx, cy, 94 * scale, [73, 51, 128, 220]);
  fillCircle(png, cx, cy, 70 * scale, violet);
  fillCircle(png, cx, cy, 34 * scale, [38, 20, 61, 245]);
  fillCircle(png, cx - 24 * scale, cy - 32 * scale, 16 * scale, white);
  fillCircle(png, cx + 22 * scale, cy - 18 * scale, 7 * scale, [255, 255, 255, 190]);

  drawLine(png, cx - 175 * scale, cy, cx - 312 * scale, cy, 5 * scale, softGold);
  drawLine(png, cx + 175 * scale, cy, cx + 312 * scale, cy, 5 * scale, softGold);
  drawLine(png, cx, cy - 190 * scale, cx, cy - 284 * scale, 4 * scale, softGold);
  drawLine(png, cx, cy + 190 * scale, cx, cy + 284 * scale, 4 * scale, softGold);

  drawDiamond(png, cx, cy - 322 * scale, 18 * scale, [255, 222, 141, 180]);
  drawDiamond(png, cx, cy + 322 * scale, 14 * scale, [255, 222, 141, 150]);
}

function makeIcon() {
  const png = new PNG({ width: 1024, height: 1024 });
  fillBackground(png, [6, 10, 26, 255], [77, 62, 132, 255]);
  scatterStars(png, 160, 108, 120);

  fillCircle(png, 512, 512, 376, [255, 226, 149, 18]);
  strokeEllipse(png, 512, 512, 390, 390, 8, [255, 224, 150, 92]);
  strokeEllipse(png, 512, 512, 322, 322, 4, [134, 108, 218, 110]);
  drawTarotEye(png, 512, 520, 1.08);

  fillEllipse(png, 512, 802, 162, 20, [0, 0, 0, 75]);
  drawDiamond(png, 220, 220, 18, [255, 224, 151, 160]);
  drawDiamond(png, 822, 278, 14, [255, 238, 196, 140]);
  drawDiamond(png, 786, 768, 16, [191, 151, 255, 128]);
  return png;
}

function makeSplash() {
  const png = new PNG({ width: 2732, height: 2732 });
  fillBackground(png, [7, 11, 27, 255], [71, 60, 125, 255]);
  scatterStars(png, 520, 306, 100);

  fillCircle(png, 1366, 1300, 760, [255, 226, 149, 12]);
  strokeEllipse(png, 1366, 1300, 720, 720, 6, [255, 224, 150, 70]);
  strokeEllipse(png, 1366, 1300, 520, 520, 4, [134, 108, 218, 96]);
  drawTarotEye(png, 1366, 1300, 1.8);
  fillEllipse(png, 1366, 1920, 330, 34, [0, 0, 0, 68]);

  drawDiamond(png, 890, 720, 26, [255, 224, 151, 130]);
  drawDiamond(png, 1900, 820, 22, [255, 238, 196, 115]);
  drawDiamond(png, 2010, 1880, 24, [191, 151, 255, 116]);
  return png;
}

async function writePng(path, png) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, PNG.sync.write(png, { colorType: 2 }));
}

await writePng(iconPath, makeIcon());
await writePng(splashPaths[0], makeSplash());
await copyFile(splashPaths[0], splashPaths[1]);
await copyFile(splashPaths[0], splashPaths[2]);

console.log("Generated iOS app icon and splash assets.");
