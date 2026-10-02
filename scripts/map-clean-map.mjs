import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const appUrl = process.env.MAP_APP_URL ?? "http://127.0.0.1:5173/Fantasy-Map-Generator/";
const browserOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" };
const inputPath = path.resolve(process.argv[2] ?? "");
const outputPath = path.resolve(process.argv[3] ?? "");

if (!process.argv[2] || !fs.existsSync(inputPath)) throw new Error(`Не найдена исходная карта: ${inputPath}`);
if (!process.argv[3]) throw new Error("Не указан путь для очищенной карты");

const serverIsReady = async () => {
  try {
    return (await fetch(appUrl, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
};

const waitForServer = async () => {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await serverIsReady()) return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Локальный сервер не запустился за 60 секунд");
};

const stopProcessTree = child => {
  if (child?.pid) spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
};

let server;
let browser;

try {
  const ownsServer = !(await serverIsReady());
  if (ownsServer) {
    server = spawn("cmd.exe", ["/d", "/s", "/c", "npm.cmd", "run", "dev", "--", "--host", "127.0.0.1"], {
      cwd: root,
      windowsHide: true,
      stdio: "ignore"
    });
  }

  await waitForServer();
  browser = await chromium.launch({ headless: true, ...browserOptions });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.addInitScript(() => localStorage.setItem("version", "99.99.99"));
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("#mapToLoad", { state: "attached", timeout: 120_000 });

  const mapsBeforeLoad = await page.evaluate(() => mapHistory.length);
  await page.locator("#mapToLoad").setInputFiles(inputPath);
  await page.waitForFunction(previousCount => mapHistory.length > previousCount, mapsBeforeLoad, { timeout: 120_000 });

  const before = await page.evaluate(() => ({
    states: pack.states.filter(state => state.i && !state.removed).length,
    burgs: pack.burgs.filter(burg => burg.i && !burg.removed).length,
    routes: pack.routes.length,
    markets: pack.markets.length
  }));

  await page.evaluate(() => {
    pack.cells.burg.fill(0);
    pack.burgs = [pack.burgs[0]];
    pack.states.forEach(state => {
      if (state.i && !state.removed) state.capital = 0;
    });
    pack.provinces.forEach(province => {
      if (!province?.i || province.removed) return;
      province.burg = 0;
      province.burgs = [];
    });

    pack.routes = [];
    pack.cells.routes = [];
    Routes.sync();

    pack.markets = [];
    pack.deals = [];
    pack.cells.market.fill(0);

    Layers.draw("burgIcons", "labels", "routes", "states", "provinces", "markets");
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page.evaluate(() => window.Services.Save.toMachine());
  const download = await downloadPromise;
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await download.saveAs(outputPath);

  const mapsBeforeVerification = await page.evaluate(() => mapHistory.length);
  await page.locator("#mapToLoad").setInputFiles(outputPath);
  await page.waitForFunction(previousCount => mapHistory.length > previousCount, mapsBeforeVerification, {
    timeout: 120_000
  });
  const after = await page.evaluate(() => ({
    states: pack.states.filter(state => state.i && !state.removed).length,
    burgs: pack.burgs.filter(burg => burg.i && !burg.removed).length,
    routes: pack.routes.length,
    markets: pack.markets.length
  }));

  if (!after.states || after.burgs || after.routes || after.markets) {
    throw new Error(`Проверка очищенной карты не пройдена: ${JSON.stringify(after)}`);
  }

  console.log(JSON.stringify({ inputPath, outputPath, before, after }, null, 2));
} finally {
  if (browser?.isConnected()) await browser.close();
  stopProcessTree(server);
}
