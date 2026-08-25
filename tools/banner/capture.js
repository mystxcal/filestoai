// Deterministic frame capture for the FilesToAI README banner.
//
// Usage: node capture.js <page.html> <outDir> <theme> <fps> <phase>

"use strict";

const path = require("path");

function loadPuppeteer() {
  for (const id of ["puppeteer", "puppeteer-core", "rebrowser-puppeteer-core"]) {
    try { return require(id); } catch { /* keep looking */ }
  }
  const extra = process.env.BANNER_PUPPETEER;
  if (extra) return require(extra);
  throw new Error("No Puppeteer package found; set BANNER_PUPPETEER to puppeteer-core");
}

const puppeteer = loadPuppeteer();
const [pageFile, outDir, theme, fpsArg, phaseArg] = process.argv.slice(2);
const W = 1280;
const H = 400;
const LOOP = 10;
const FPS = Number(fpsArg || 20);
const PHASE = Number(phaseArg || 8.15);
const FRAMES = Math.round(LOOP * FPS);

(async () => {
  const launch = {
    headless: "new",
    executablePath: process.env.CHROME_PATH || "/usr/bin/google-chrome",
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${W + 20},${H + 20}`,
    ],
  };
  const browser = await puppeteer.launch(launch);
  const page = await browser.newPage();
  await page.setViewport({ width: W + 20, height: H + 20, deviceScaleFactor: 1 });

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });

  await page.evaluateOnNewDocument(() => { window.__manual = true; });
  await page.goto(`file://${path.resolve(pageFile)}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__ready === true, { timeout: 30_000 });
  await page.evaluate((value) => window.__setTheme(value), theme);

  const canvas = await page.$("#banner");
  for (let index = 0; index < FRAMES; index += 1) {
    const t = (PHASE + index / FPS) % LOOP;
    await page.evaluate((value) => window.__step(value), t);
    const frame = `frame-${String(index).padStart(4, "0")}.png`;
    await canvas.screenshot({ path: path.join(outDir, frame) });
    if (index % 50 === 0) process.stdout.write(`${index}/${FRAMES} `);
  }
  await browser.close();

  if (errors.length) {
    throw new Error(errors.join("\n"));
  }
  process.stdout.write(`\ncaptured ${FRAMES} frames (${theme})\n`);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
