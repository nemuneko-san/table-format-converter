import sharp from "sharp";
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/icons/icon.svg", import.meta.url));
for (const size of [16, 48, 128]) {
  await sharp(svg, { density: 384 })
    .resize(size, size)
    .png()
    .toFile(new URL(`../public/icons/icon${size}.png`, import.meta.url).pathname);
}
