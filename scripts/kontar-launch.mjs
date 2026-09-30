import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const appUrl = "http://127.0.0.1:5173/Fantasy-Map-Generator/";
const logDir = path.join(process.env.LOCALAPPDATA ?? root, "Kontar");
const logPath = path.join(logDir, "launcher.log");
const dryRun = process.argv.includes("--dry-run");
const testRun = process.argv.includes("--test");

fs.mkdirSync(logDir, { recursive: true });
const logStream = fs.createWriteStream(logPath, { flags: "a" });
const log = message => {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(line);
  logStream.write(`${line}\n`);
};

const fail = error => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  log(`ERROR ${message}`);
  if (testRun) return;
  const escaped = message.replaceAll("'", "''");
  spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-WindowStyle",
      "Hidden",
      "-Command",
      `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${escaped}', 'Контар — ошибка запуска')`
    ],
    { windowsHide: true }
  );
};

const getTargetScreen = () => {
  const command = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$screens = [System.Windows.Forms.Screen]::AllScreens",
    "$screen = $screens | Where-Object { -not $_.Primary } | Select-Object -First 1",
    "if (-not $screen) { $screen = $screens | Select-Object -First 1 }",
    "$area = $screen.WorkingArea",
    "[pscustomobject]@{ X=$area.X; Y=$area.Y; Width=$area.Width; Height=$area.Height; Primary=$screen.Primary; DeviceName=$screen.DeviceName } | ConvertTo-Json -Compress"
  ].join("; ");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) throw new Error(`Не удалось определить мониторы: ${result.stderr}`);
  return JSON.parse(result.stdout.trim());
};

const getBrowserPath = () => {
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  ];
  const browserPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!browserPath) throw new Error("Не найден Chrome или Microsoft Edge");
  return browserPath;
};

const getDownloadsDirectory = () => {
  if (testRun) return path.join(logDir, "test-downloads");
  if (process.platform !== "win32") return path.join(process.env.HOME ?? root, "Downloads");

  const command = "(New-Object -ComObject Shell.Application).NameSpace('shell:Downloads').Self.Path";
  const result = spawnSync("powershell.exe", ["-NoProfile", "-Command", command], {
    encoding: "utf8",
    windowsHide: true
  });
  const downloadsDirectory = result.stdout?.trim();
  if (result.status === 0 && downloadsDirectory) return downloadsDirectory;
  return path.join(process.env.USERPROFILE ?? root, "Downloads");
};

const getLatestMapPath = () => {
  const directories = [getDownloadsDirectory(), path.join(root, "worlds", "kontar")];
  const maps = directories.flatMap(directory => {
    if (!fs.existsSync(directory)) return [];
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter(entry => entry.isFile() && path.extname(entry.name).toLowerCase() === ".map")
      .map(entry => {
        const filePath = path.join(directory, entry.name);
        return { filePath, modified: fs.statSync(filePath).mtimeMs };
      });
  });
  const latest = maps.sort((a, b) => b.modified - a.modified)[0];
  if (!latest) throw new Error("Не найдено ни одного файла карты в папке загрузок или worlds/kontar");
  return latest.filePath;
};

const getAvailableDownloadPath = (downloadsDirectory, suggestedFilename) => {
  const safeFilename = (suggestedFilename || "kontar-map.map")
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/[. ]+$/g, "");
  const filename = path.extname(safeFilename) ? safeFilename : `${safeFilename}.map`;
  const parsed = path.parse(filename);
  let candidate = path.join(downloadsDirectory, filename);
  let suffix = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(downloadsDirectory, `${parsed.name}-${suffix}${parsed.ext}`);
    suffix += 1;
  }
  return candidate;
};

const serverIsReady = async () => {
  try {
    const response = await fetch(appUrl, { signal: AbortSignal.timeout(1000) });
    return response.ok;
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
  if (!child?.pid) return;
  spawnSync("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true });
};

let server;
let browser;

try {
  const mapPath = getLatestMapPath();
  if (!fs.existsSync(mapPath)) throw new Error(`Не найдена карта: ${mapPath}`);
  const screen = getTargetScreen();
  const browserPath = getBrowserPath();
  log(`Экран: ${screen.DeviceName} ${screen.Width}x${screen.Height} @ ${screen.X},${screen.Y}`);
  log(`Карта: ${mapPath}`);

  if (dryRun) {
    log(`Браузер: ${browserPath}`);
    log("Проверка завершена, приложение не запускалось");
    process.exitCode = 0;
  } else {
    const ownsServer = !(await serverIsReady());
    if (ownsServer) {
      const npmCommand = process.platform === "win32" ? "cmd.exe" : "npm";
      const npmArguments =
        process.platform === "win32"
          ? ["/d", "/s", "/c", "npm.cmd", "run", "dev", "--", "--host", "127.0.0.1"]
          : ["run", "dev", "--", "--host", "127.0.0.1"];
      server = spawn(npmCommand, npmArguments, {
        cwd: root,
        windowsHide: true,
        stdio: ["ignore", logStream, logStream]
      });
      log(`Запущен локальный сервер, PID ${server.pid}`);
    } else {
      log("Используется уже запущенный локальный сервер");
    }

    await waitForServer();
    browser = await chromium.launch({
      headless: testRun,
      executablePath: browserPath,
      args: [
        `--window-position=${screen.X},${screen.Y}`,
        `--window-size=${screen.Width},${screen.Height}`,
        "--disable-session-crashed-bubble"
      ]
    });
    const context = await browser.newContext({ viewport: null });
    await context.addInitScript(() => localStorage.setItem("version", "99.99.99"));
    const page = await context.newPage();
    const downloadsDirectory = getDownloadsDirectory();
    fs.mkdirSync(downloadsDirectory, { recursive: true });
    const pendingDownloads = new Set();
    const saveDownload = async download => {
      const downloadPath = getAvailableDownloadPath(downloadsDirectory, download.suggestedFilename());
      await download.saveAs(downloadPath);
      log(`Скачанный файл сохранён: ${downloadPath}`);
      return downloadPath;
    };

    if (!testRun) {
      page.on("download", download => {
        const task = saveDownload(download)
          .catch(error => fail(error))
          .finally(() => pendingDownloads.delete(task));
        pendingDownloads.add(task);
      });
    }

    await page.goto(appUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector("#mapToLoad", { state: "attached", timeout: 120_000 });
    const mapsBeforeLoad = await page.evaluate(() => mapHistory.length);
    await page.locator("#mapToLoad").setInputFiles(mapPath);
    await page.waitForFunction(
      previousCount => mapHistory.length > previousCount && options.map.lore.name === "Контар после Первого раскола",
      mapsBeforeLoad,
      { timeout: 120_000 }
    );
    await page.bringToFront();
    log("Карта Контара открыта");

    if (testRun) {
      const downloadPromise = page.waitForEvent("download", { timeout: 120_000 });
      await page.evaluate(() => window.Services.Save.toMachine());
      const testDownloadPath = await saveDownload(await downloadPromise);
      if (!fs.existsSync(testDownloadPath)) throw new Error("Самопроверка не обнаружила сохранённый файл карты");
      fs.unlinkSync(testDownloadPath);
      await browser.close();
      if (ownsServer) stopProcessTree(server);
      log("Самопроверка запуска и сохранения завершена успешно");
      process.exit(0);
    }

    await new Promise(resolve => browser.once("disconnected", resolve));
    await Promise.allSettled([...pendingDownloads]);
    if (ownsServer) stopProcessTree(server);
  }
} catch (error) {
  fail(error);
  if (browser?.isConnected()) await browser.close().catch(() => {});
  stopProcessTree(server);
  process.exitCode = 1;
} finally {
  logStream.end();
}
