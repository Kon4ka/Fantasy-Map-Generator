import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const appUrl = process.env.KONTAR_APP_URL ?? "http://127.0.0.1:5173/Fantasy-Map-Generator/";
const browserOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" };
const inputPath = path.resolve(process.argv[2] ?? "");
const outputPath = path.resolve(process.argv[3] ?? "");

if (!process.argv[2] || !fs.existsSync(inputPath)) throw new Error(`Не найдена исходная карта: ${inputPath}`);
if (!process.argv[3]) throw new Error("Не указан путь для исправленной карты");

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

  const loadMap = async mapPath => {
    const mapsBeforeLoad = await page.evaluate(() => mapHistory.length);
    await page.locator("#mapToLoad").setInputFiles(mapPath);
    await page.waitForFunction(previousCount => mapHistory.length > previousCount, mapsBeforeLoad, { timeout: 120_000 });
  };

  await loadMap(inputPath);
  const result = await page.evaluate(() => {
    const normalize = (text = "") => text.replace(/\|/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const states = pack.states.filter(state => state.i && !state.removed);
    const stateNames = new Set(states.flatMap(state => [state.name, state.fullName].filter(Boolean).map(normalize)));
    const removed = pack.addedLabels.filter(({ label }) => stateNames.has(normalize(label.text))).map(label => label.label.text);

    pack.addedLabels = pack.addedLabels
      .filter(({ label }) => !stateNames.has(normalize(label.text)))
      .map(addedLabel => {
        const text = addedLabel.label.text?.trim().replace(/^\(\)\s*/, "") || "";
        return { ...addedLabel, label: { ...addedLabel.label, text } };
      });

    const geographicFeatures = pack.features.filter(feature => feature?.name);
    const landFeatures = geographicFeatures.filter(feature => feature.type === "island").sort((a, b) => b.area - a.area);
    const valeyn = landFeatures[0];
    const kaishi = landFeatures[1];
    const getStateNames = feature => {
      const stateIds = new Set(
        pack.cells.i
          .filter(cellId => pack.cells.f[cellId] === feature.i && pack.cells.state[cellId])
          .map(cellId => pack.cells.state[cellId])
      );
      return [...stateIds]
        .map(stateId => pack.states[stateId])
        .filter(state => state && !state.removed)
        .map(state => state.name);
    };

    geographicFeatures.forEach(feature => {
      const fallbackName = feature.name.trim().replace(/^\(\)\s*/, "");
      const stateNames = feature.type === "island" ? getStateNames(feature) : [];
      feature.name =
        feature.i === valeyn?.i
          ? "Континент Валейн"
          : feature.i === kaishi?.i
            ? "Архипелаг Кайши"
            : stateNames.length === 1
              ? stateNames[0]
              : `() ${fallbackName}`;
    });

    States.collectStatistics();
    States.getPoles();
    states.forEach(state => delete state.label);
    options.map.labels.groups.filter(group => group.type === "state").forEach(group => delete group.active);
    Layers.draw("labels");

    return {
      states: states.length,
      migratedStateLabels: removed,
      restoredMapLabels: pack.addedLabels.map(({ label }) => label.text),
      geographicFeatures: geographicFeatures.map(feature => ({
        i: feature.i,
        name: feature.name,
        states: getStateNames(feature)
      }))
    };
  });

  const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
  await page.evaluate(() => window.Services.Save.toMachine());
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await (await downloadPromise).saveAs(outputPath);

  await loadMap(outputPath);
  const verification = await page.evaluate(expectedFeatures => {
    const normalize = (text = "") => text.replace(/\|/g, " ").replace(/\s+/g, " ").trim().toLocaleLowerCase();
    const states = pack.states.filter(state => state.i && !state.removed);
    const stateNames = new Set(states.flatMap(state => [state.name, state.fullName].filter(Boolean).map(normalize)));
    const incorrectlyNamedFeatures = expectedFeatures
      .map(expected => ({ ...expected, savedName: pack.features[expected.i]?.name }))
      .filter(feature => feature.savedName !== feature.name);

    return {
      states: states.length,
      activeStateLabels: options.map.labels.groups.filter(group => group.type === "state").every(group => group.active !== false),
      duplicateStateLabels: pack.addedLabels.filter(({ label }) => stateNames.has(normalize(label.text))).map(label => label.label.text),
      wronglyMarkedMapLabels: pack.addedLabels
        .filter(({ label }) => label.text?.trim().startsWith("()"))
        .map(label => label.label.text),
      incorrectlyNamedFeatures
    };
  }, result.geographicFeatures);

  if (
    verification.states !== result.states ||
    !verification.activeStateLabels ||
    verification.duplicateStateLabels.length ||
    verification.wronglyMarkedMapLabels.length ||
    verification.incorrectlyNamedFeatures.length
  ) {
    throw new Error(`Проверка исправленной карты не пройдена: ${JSON.stringify(verification)}`);
  }

  console.log(JSON.stringify({ inputPath, outputPath, result, verification }, null, 2));
} finally {
  if (browser?.isConnected()) await browser.close();
  stopProcessTree(server);
}
