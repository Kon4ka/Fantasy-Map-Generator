import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = process.cwd();
const appUrl = process.env.KONTAR_APP_URL ?? "http://127.0.0.1:5173/Fantasy-Map-Generator/";
const mapPath = path.join(root, "worlds", "kontar", "kontar-first-rift-draft.map");
const browserPath = "C:/Program Files/Google/Chrome/Application/chrome.exe";

if (!fs.existsSync(mapPath)) throw new Error(`Не найдена карта: ${mapPath}`);

const browser = await chromium.launch({ headless: true, executablePath: browserPath });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

try {
  await page.addInitScript(() => {
    localStorage.setItem("version", "99.99.99");
    localStorage.setItem("kontar.interfaceLocale", "ru");
  });
  await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("#mapToLoad", { state: "attached", timeout: 120_000 });
  const mapsBeforeLoad = await page.evaluate(() => mapHistory.length);
  await page.locator("#mapToLoad").setInputFiles(mapPath);
  await page.waitForFunction(
    previousCount => mapHistory.length > previousCount && options.map.lore.name === "Контар после Первого раскола",
    mapsBeforeLoad,
    { timeout: 120_000 }
  );

  const readValues = selector =>
    page.locator(selector).evaluateAll(elements =>
      elements.map(element =>
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.value
          : element.textContent?.trim() || ""
      )
    );
  const open = async (expression, selector) => {
    await page.evaluate(expression);
    await page.waitForSelector(selector, { state: "attached" });
    await page.waitForTimeout(50);
  };

  await open(() => Controllers.BiomesEditor.open(), "#biomesEditor");
  const biomes = await readValues("#biomesBody .biomeName");

  await open(() => Controllers.ZonesEditor.open(), "#zonesEditor");
  const zones = await readValues("#zonesBodySection .zoneName, #zonesBodySection .zoneType");

  await open(() => Controllers.FeaturesOverview.open(), "#featuresOverview");
  const features = await readValues(
    "#featuresBody .featureName, #featuresBody [data-col='type'], #featuresBody [data-col='group']"
  );

  await open(() => Controllers.MarkersOverview.open(), "#markersOverview");
  const markers = await readValues("#markersBody [data-col='type'], #markersFilterState option");

  await open(() => Controllers.TradeAnimationEditor.open(), "#tradeAnimationEditor");
  const trade = await readValues("#tradeAnimDisplayType option");

  await open(() => Controllers.NamesbaseEditor.open(), "#namesbaseEditor");
  const nameBases = await readValues("#namesbaseSelect option, #namesbaseTextarea, #namesbaseExamples");

  await open(() => Controllers.ProvincesEditor.open(), "#provincesEditor");
  const provinces = await readValues("#provincesBodySection [data-col='name'], #provincesBodySection [data-col='form']");

  await open(() => Controllers.ReligionsEditor.open(), "#religionsEditor");
  const religions = await readValues(
    "#religionsBody .religionName, #religionsBody .religionForm, #religionsBody .religionDeity, #religionsBody .religionType option:checked"
  );

  await open(() => Controllers.StatesEditor.open(), "#statesEditor");
  const states = await readValues(
    "#statesBodySection .stateName, #statesBodySection .stateForm, #statesBodySection .stateCapital"
  );

  const sections = { biomes, zones, features, markers, trade, nameBases, provinces, religions, states };
  const remainingLatin = Object.fromEntries(
    Object.entries(sections).map(([section, values]) => [section, values.filter(value => /[A-Za-z]{2}/.test(value))])
  );
  const failures = Object.entries(remainingLatin).filter(([, values]) => values.length);

  console.log(JSON.stringify({ samples: Object.fromEntries(Object.entries(sections).map(([key, values]) => [key, values.slice(0, 12)])), remainingLatin }, null, 2));
  if (failures.length) throw new Error(`Остались латинские значения: ${failures.map(([section]) => section).join(", ")}`);
} finally {
  await browser.close();
}
