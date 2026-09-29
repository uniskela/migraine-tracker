import sharp from "sharp";
for (const [file, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["maskable-512.png", 512],
  ["apple-touch-icon.png", 180],
])
  await sharp("public/icons/icon.svg")
    .resize(size, size)
    .png()
    .toFile(`public/icons/${file}`);
