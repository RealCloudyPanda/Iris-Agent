import { readFileSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";

const root = new URL("../", import.meta.url);
const svg = readFileSync(new URL("build/icon.svg", root));
const png = size => new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
for (const [file, size] of [["build/icon.png", 1024], ["build/icon-1024.png", 1024], ["electron/resources/app-icon.png", 256], ["public/app-icon-192.png", 192], ["public/app-icon-512.png", 512], ["public/apple-touch-icon.png", 180]]) {
  writeFileSync(new URL(file, root), png(size));
}
writeFileSync(new URL("public/app-icon.svg", root), svg);
const sizes = [16, 32, 48, 64, 128, 256];
const payloads = sizes.map(png);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const entry = 6 + i * 16;
  header[entry] = header[entry + 1] = size === 256 ? 0 : size;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(payloads[i].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += payloads[i].length;
});
writeFileSync(new URL("build/icon.ico", root), Buffer.concat([header, ...payloads]));

const chunks = [["icp4", 16], ["icp5", 32], ["icp6", 64], ["ic07", 128], ["ic08", 256], ["ic09", 512], ["ic10", 1024]].map(([type, size]) => {
  const bytes = png(size);
  const chunk = Buffer.alloc(8);
  chunk.write(type);
  chunk.writeUInt32BE(8 + bytes.length, 4);
  return Buffer.concat([chunk, bytes]);
});
const icns = Buffer.alloc(8);
icns.write("icns");
icns.writeUInt32BE(8 + chunks.reduce((length, chunk) => length + chunk.length, 0), 4);
writeFileSync(new URL("build/icon.icns", root), Buffer.concat([icns, ...chunks]));
