import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const APP_URL = process.env.KONTAR_APP_URL ?? "http://127.0.0.1:5173/Fantasy-Map-Generator/";
const root = process.cwd();
const worldDir = path.join(root, "worlds", "kontar");
const referenceDir = path.join(worldDir, "reference");
const previewDir =
  process.env.KONTAR_PREVIEW_DIR ??
  path.join("C:", "Users", "Kon4ka", ".codex", "visualizations", "2026", "09", "30", "01a0f1cb-0c5e-7203-87d8-c17649fb2861");

await fs.mkdir(referenceDir, { recursive: true });
await fs.mkdir(previewDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe"
});

const page = await browser.newPage({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on("pageerror", error => pageErrors.push(error.message));

try {
  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.mapHistory?.length && globalThis.pack?.cells?.i?.length, null, {
    timeout: 120_000
  });

  await page.evaluate(async () => {
    const geographyScale = 0.5;
    const ellipse = (x, y, cx, cy, rx, ry) =>
      1 - Math.hypot((x - cx) / (rx * geographyScale), (y - cy) / (ry * geographyScale));
    const ridge = (x, y, ax, ay, bx, by, width) => {
      const abx = bx - ax;
      const aby = by - ay;
      const t = Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / (abx * abx + aby * aby)));
      return Math.max(0, 1 - Math.hypot(x - (ax + abx * t), y - (ay + aby * t)) / (width * geographyScale));
    };

    const islands = [
      [0.16, 0.515, 0.047, 0.027],
      [0.27, 0.535, 0.041, 0.024],
      [0.385, 0.505, 0.046, 0.026],
      [0.505, 0.535, 0.052, 0.03],
      [0.61, 0.52, 0.027, 0.017],
      [0.665, 0.545, 0.022, 0.014],
      [0.765, 0.505, 0.058, 0.036],
      [0.885, 0.565, 0.052, 0.029]
    ];
    const kaishi = [
      [0.17, 0.745, 0.135, 0.095],
      [0.355, 0.705, 0.145, 0.09],
      [0.43, 0.84, 0.19, 0.12],
      [0.64, 0.725, 0.135, 0.095],
      [0.76, 0.845, 0.17, 0.105],
      [0.88, 0.735, 0.07, 0.065]
    ];

    const originalGenerate = HeightmapGenerator.generate;
    HeightmapGenerator.generate = function () {
      const heights = new Uint8Array(grid.points.length);
      for (let i = 0; i < grid.points.length; i++) {
        const [px, py] = grid.points[i];
        const x = px / options.map.graph.width;
        const y = py / options.map.graph.height;
        const coastNoise =
          Math.sin(x * 91 + y * 37) * 0.012 +
          Math.sin(x * 43 - y * 73) * 0.009 +
          Math.sin((x + y) * 137) * 0.006;

        const valeyn = Math.max(
          ellipse(x, y, 0.5, 0.235, 0.39, 0.19),
          ellipse(x, y, 0.19, 0.285, 0.13, 0.135),
          ellipse(x, y, 0.82, 0.285, 0.12, 0.14),
          ellipse(x, y, 0.49, 0.39, 0.245, 0.07)
        );
        const equatorial = Math.max(...islands.map(([cx, cy, rx, ry]) => ellipse(x, y, cx, cy, rx, ry)));
        const southern = Math.max(...kaishi.map(([cx, cy, rx, ry]) => ellipse(x, y, cx, cy, rx, ry)));
        const land = Math.max(valeyn, equatorial, southern) + coastNoise;
        if (land <= 0) continue;

        let elevation = 21 + Math.round(Math.min(1, land * 2.5) * 22);
        elevation += Math.round(ridge(x, y, 0.26, 0.17, 0.75, 0.17, 0.026) * 30);
        elevation += Math.round(ridge(x, y, 0.72, 0.69, 0.86, 0.79, 0.032) * 38);
        elevation += Math.round(ridge(x, y, 0.34, 0.73, 0.5, 0.86, 0.028) * 20);
        if (y < 0.43 && x < 0.31) elevation = Math.min(elevation, 35);
        if (y < 0.43 && x > 0.34 && x < 0.7) elevation = Math.min(elevation, 31);
        heights[i] = Math.max(20, Math.min(95, elevation));
      }

      grid.cells.h = heights;
      HeightmapGenerator.setGraph(grid);
      HeightmapGenerator.smooth(2, 0);
      grid.cells.h = HeightmapGenerator.getHeights();
    };

    try {
      await new Promise(resolve => {
        window.addEventListener("map:generated", resolve, { once: true });
        window.regenerateMap({ seed: "Kontar-First-Rift", width: 1600, height: 1000 });
      });
    } finally {
      HeightmapGenerator.generate = originalGenerate;
    }

    options.map.lore.name = "Контар после Первого раскола";
    options.map.lore.description =
      "Черновая карта Контара: Валейн на севере, острова Моря туманов у экватора и архипелаг Кайши на юге.";
  });

  const summary = await page.evaluate(() => {
    const width = options.map.graph.width;
    const height = options.map.graph.height;
    const normalized = (x, y) => [x / width, y / height];
    const nearestUnique = (items, pointOf, targets) => {
      const unused = new Set(items);
      const assignments = [];
      for (const target of targets) {
        let best = null;
        let bestDistance = Infinity;
        for (const item of unused) {
          const [x, y] = pointOf(item);
          const distance = Math.hypot(x - target.x, y - target.y);
          if (distance < bestDistance) {
            best = item;
            bestDistance = distance;
          }
        }
        if (!best) continue;
        unused.delete(best);
        assignments.push([best, target]);
      }
      return assignments;
    };

    const stateTargets = [
      { name: "Алахея", x: 0.2, y: 0.27 },
      { name: "Северный Валейн", x: 0.48, y: 0.17 },
      { name: "Восточный Валейн", x: 0.77, y: 0.27 },
      { name: "Южный Валейн", x: 0.5, y: 0.39 },
      { name: "Жаар", x: 0.16, y: 0.515 },
      { name: "Крич", x: 0.27, y: 0.535 },
      { name: "Икран", x: 0.385, y: 0.505 },
      { name: "Светолоз", x: 0.505, y: 0.535 },
      { name: "Мартугор", x: 0.765, y: 0.505 },
      { name: "Западные степи", x: 0.17, y: 0.745 },
      { name: "Цикло-каньон", x: 0.43, y: 0.79 },
      { name: "Стая Кицунэ", x: 0.68, y: 0.72 },
      { name: "Стая Ликанов", x: 0.8, y: 0.84 },
      { name: "Южный Кайши", x: 0.57, y: 0.89 }
    ];
    const states = pack.states.filter(state => state.i && !state.removed && state.pole);
    for (const [state, target] of nearestUnique(states, state => normalized(...state.pole), stateTargets)) {
      state.name = target.name;
      state.fullName = target.name;
      state.note = `Черновая привязка области Контара: ${target.name}.`;
    }

    const cultureTargets = [
      { name: "Дженази земли", x: 0.2, y: 0.27 },
      { name: "Дворфы", x: 0.39, y: 0.18 },
      { name: "Люди Валейна", x: 0.59, y: 0.19 },
      { name: "Тёмные эльфы", x: 0.78, y: 0.28 },
      { name: "Юань-Ти", x: 0.5, y: 0.39 },
      { name: "Люди островов", x: 0.18, y: 0.52 },
      { name: "Эльфы островов", x: 0.4, y: 0.51 },
      { name: "Тифлинги", x: 0.765, y: 0.505 },
      { name: "Дженази воздуха", x: 0.885, y: 0.565 },
      { name: "Табакси", x: 0.16, y: 0.75 },
      { name: "Гоблины", x: 0.29, y: 0.76 },
      { name: "Фейри", x: 0.43, y: 0.76 },
      { name: "Эльфы Нари", x: 0.5, y: 0.86 },
      { name: "Кицунэ", x: 0.68, y: 0.72 },
      { name: "Ликаны", x: 0.79, y: 0.83 },
      { name: "Дженази воды", x: 0.67, y: 0.9 }
    ];
    const cultures = pack.cultures.filter(culture => culture.i && !culture.removed && culture.center != null);
    for (const [culture, target] of nearestUnique(
      cultures,
      culture => normalized(...pack.cells.p[culture.center]),
      cultureTargets
    )) {
      culture.name = target.name;
      culture.code = target.name.slice(0, 3).toUpperCase();
      culture.note = `Народ Контара: ${target.name}.`;
    }

    const burgTargets = [
      { name: "Алахея", x: 0.2, y: 0.27 },
      { name: "Жаар", x: 0.16, y: 0.515 },
      { name: "Крич", x: 0.27, y: 0.535 },
      { name: "Икран", x: 0.385, y: 0.505 },
      { name: "Светолоз", x: 0.505, y: 0.535 },
      { name: "Мартугор", x: 0.765, y: 0.505 },
      { name: "Цикло-каньон", x: 0.43, y: 0.79 }
    ];
    const burgs = pack.burgs.filter(burg => burg.i && !burg.removed);
    for (const [burg, target] of nearestUnique(burgs, burg => normalized(burg.x, burg.y), burgTargets)) {
      burg.name = target.name;
      burg.note = `Опорная точка черновой карты: ${target.name}.`;
    }

    pack.addedLabels = [];
    const labels = [
      ["ВАЛЕЙН", 800, 205, 36, "Северный материк"],
      ["Алахея", 320, 310, 20, "Западная пустыня дженази земли"],
      ["Равнины Изморози", 820, 315, 22, "Опустошённый центр Валейна"],
      ["Южные берега Юань-Ти", 800, 420, 17, "Тёплое побережье Валейна"],
      ["МОРЕ ТУМАНОВ", 800, 492, 22, "Экваториальный пояс островов"],
      ["Жаар", 256, 485, 16, "Остров людей"],
      ["Крич", 432, 505, 16, "Остров людей"],
      ["Икран", 616, 475, 16, "Остров эльфов"],
      ["Светолоз", 808, 505, 16, "Торговый остров"],
      ["Мартугор", 1224, 475, 18, "Остров тифлингов и сезонный портал"],
      ["Парящий остров", 1416, 615, 16, "Остров дженази воздуха"],
      ["АРХИПЕЛАГ КАЙШИ", 800, 720, 32, "Южный архипелаг"],
      ["Западные степи", 272, 785, 18, "Земли Табакси и Гоблинов"],
      ["Цикло-каньон", 688, 835, 20, "Леса Фейри и эльфов Нари"],
      ["Горы Кицунэ и Ликанов", 1210, 765, 17, "Северо-восточные горы Кайши"],
      ["Южный берег", 925, 930, 17, "Южные земли Фейри и эльфов Нари"]
    ];
    for (const [text, x, y, fontSize, note] of labels) {
      AddedLabels.add({ x, y, label: { text, group: "added", fontSize }, note });
    }

    for (const group of options.map.labels.groups) {
      if (group.type === "state" || group.type === "province") group.active = false;
      if (group.type === "added" || group.type === "burg") group.active = true;
    }
    Layers.draw("labels", "burgIcons", "borders", "routes", "rivers", "relief");

    return {
      cells: pack.cells.i.length,
      landCells: pack.cells.i.filter(i => pack.cells.h[i] >= 20).length,
      states: states.length,
      cultures: cultures.length,
      burgs: burgs.length,
      rivers: pack.rivers.length,
      labels: pack.addedLabels.length
    };
  });

  const mapData = await page.evaluate(() => window.Services.Save.prepareMapData());
  const svg = await page.locator("#map").evaluate(element => element.outerHTML);

  const mapPath = path.join(worldDir, "kontar-first-rift-draft.map");
  const svgPath = path.join(referenceDir, "kontar-first-rift.svg");
  const previewPath = path.join(previewDir, "kontar-first-rift-preview.png");
  await fs.writeFile(mapPath, mapData, "utf8");
  await fs.writeFile(svgPath, svg, "utf8");

  const verificationPage = await browser.newPage({ viewport: { width: 1500, height: 1050 }, deviceScaleFactor: 1 });
  const verificationErrors = [];
  verificationPage.on("pageerror", error => verificationErrors.push(error.message));
  await verificationPage.addInitScript(() => localStorage.setItem("version", "99.99.99"));
  await verificationPage.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await verificationPage.waitForSelector("#mapToLoad", { state: "attached", timeout: 120_000 });
  const mapsBeforeLoad = await verificationPage.evaluate(() => mapHistory.length);
  await verificationPage.locator("#mapToLoad").setInputFiles(mapPath);
  await verificationPage.waitForFunction(
    previousCount =>
      mapHistory.length > previousCount || document.querySelector("#alert")?.offsetParent !== null,
    mapsBeforeLoad,
    { timeout: 120_000 }
  );

  const visibleLoadError = await verificationPage
    .locator("#alert")
    .evaluate(element => (element.offsetParent ? element.textContent?.trim() : ""));
  if (visibleLoadError) {
    const loadDebug = await verificationPage.evaluate(() => ({
      cells: pack.cells.i.length,
      stateCells: pack.cells.state.length,
      vertices: pack.vertices.p.length,
      invalidFeatureVertices: pack.features.flatMap(feature =>
        (feature?.vertices ?? []).filter(vertex => !pack.vertices.p[vertex])
      )
    }));
    throw new Error(`Saved map did not reopen cleanly: ${visibleLoadError}\n${JSON.stringify(loadDebug)}`);
  }
  await verificationPage.waitForFunction(
    () =>
      options.map.lore.name === "Контар после Первого раскола" &&
      pack.cells.i.length > 0 &&
      pack.addedLabels.length === 16,
    null,
    { timeout: 120_000 }
  );

  const verification = await verificationPage.evaluate(() => ({
    name: options.map.lore.name,
    cells: pack.cells.i.length,
    states: pack.states.filter(state => state.i && !state.removed).length,
    cultures: pack.cultures.filter(culture => culture.i && !culture.removed).length,
    burgs: pack.burgs.filter(burg => burg.i && !burg.removed).length,
    rivers: pack.rivers.length,
    labels: pack.addedLabels.length
  }));
  await verificationPage.evaluate(() => {
    for (const selector of [
      "#optionsContainer",
      "#helpAssistantBubble",
      "#tourPromptButton",
      "#tooltip",
      "#loading"
    ]) {
      document.querySelector(selector)?.setAttribute("style", "display:none");
    }
    document.querySelector("#map").style.background = "#dcebf0";
  });
  await verificationPage.locator("#map").screenshot({ path: previewPath });
  await verificationPage.close();

  console.log(
    JSON.stringify({ mapPath, svgPath, previewPath, summary, verification, pageErrors, verificationErrors }, null, 2)
  );
} finally {
  await browser.close();
}
