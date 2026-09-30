import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOCALE_PATH = path.join(ROOT, "src", "data", "locales", "ru.json");
const EXTRACTOR_PATH = path.join(import.meta.dirname, "i18n-extract.mjs");
const ENDPOINT = "https://translate.googleapis.com/translate_a/single";
const SEPARATOR = "__KONTAR_I18N_SEPARATOR__";
const MAX_BATCH_LENGTH = 2800;

const manualTranslations = {
  About: "О программе",
  Add: "Добавить",
  Apply: "Применить",
  Biomes: "Биомы",
  Burg: "Поселение",
  Burgs: "Поселения",
  Cancel: "Отмена",
  Cells: "Ячейки",
  Close: "Закрыть",
  Coastline: "Береговая линия",
  Confirm: "Подтвердить",
  Coordinates: "Координаты",
  Cultures: "Культуры",
  Delete: "Удалить",
  Diplomacy: "Дипломатия",
  Edit: "Изменить",
  Emblems: "Гербы",
  Export: "Экспорт",
  Features: "Географические объекты",
  Generate: "Создать",
  "Generate random map": "Создать случайную карту",
  Goods: "Товары",
  Grid: "Сетка",
  Heightmap: "Карта высот",
  Harbor: "Гавань",
  Ice: "Лёд",
  Icons: "Значки",
  Journeys: "Путешествия",
  Labels: "Подписи",
  Language: "Язык",
  Layers: "Слои",
  Legend: "Легенда",
  Load: "Загрузить",
  Markers: "Маркеры",
  Markets: "Рынки",
  Measurers: "Измерители",
  Military: "Военные силы",
  "New Map": "Новая карта",
  Notes: "Заметки",
  Options: "Настройки",
  Population: "Население",
  Precipitation: "Осадки",
  Preset: "Предустановка",
  Provinces: "Провинции",
  Regenerate: "Пересоздать",
  Religions: "Религии",
  Relief: "Рельеф",
  Remove: "Удалить",
  Rivers: "Реки",
  Routes: "Маршруты",
  "Scale Bar": "Масштабная линейка",
  Save: "Сохранить",
  Search: "Поиск",
  Shading: "Затенение",
  State: "Государство",
  States: "Государства",
  Style: "Стиль",
  Temperature: "Температура",
  Texture: "Текстура",
  Tools: "Инструменты",
  Trade: "Торговля",
  Units: "Единицы измерения",
  Vignette: "Виньетка",
  "Wind Rose": "Роза ветров",
  Zones: "Зоны",
  "Choose burg icon": "Выберите значок поселения",
  "Choose port icon": "Выберите значок порта",
  Ports: "Порты",
  Anchor: "Якорь",
  default: "По умолчанию",
  ancient: "Древний",
  gloom: "Мрачный",
  pale: "Бледный",
  light: "Светлый",
  watercolor: "Акварель",
  clean: "Чистый",
  atlas: "Атлас",
  darkSeas: "Тёмные моря",
  cyberpunk: "Киберпанк",
  night: "Ночной",
  monochrome: "Монохромный",
  ink: "Тушь",
  cinderwood: "Угольный",
  frostbite: "Морозный",
  bright: "Яркий",
  natural: "Естественный",
  green: "Зелёный",
  olive: "Оливковый",
  livid: "Синеватый",
  neon: "Неон",
  smoke: "Дым",
  wound: "Рана",
  paper: "Бумага",
  granite: "Гранит",
  spotlight: "Прожектор",
  width: "Ширина",
  circle: "Круг",
  square: "Квадрат",
  triangle: "Треугольник",
  cross: "Крест",
  star: "Звезда",
  circled: "В круге",
  squared: "В квадрате",
  "star circled": "Звезда в круге",
  "star circled empty": "Контурная звезда в круге",
  "star squared": "Звезда в квадрате",
  "circle rayed": "Круг с лучами",
  "circle dotted": "Точечный круг",
  "diamond dotted": "Точечный ромб",
  capital: "Столица",
  city: "Город",
  town: "Городок",
  village: "Деревня",
  hamlet: "Посёлок",
  fort: "Форт",
  monastery: "Монастырь",
  caravanserai: "Караван-сарай",
  post: "Застава",
  palace: "Дворец",
  burgh: "Город",
  castle: "Замок",
  abbey: "Аббатство",
  camp: "Лагерь",
  "Blurred Splotch": "Размытое пятно",
  Outline: "Контур",
  Pencil: "Карандаш",
  Turbulence: "Турбулентность",
  Paper: "Бумага",
  Crumpled: "Мятая бумага",
  "Watabou capital": "Watabou — столица",
  "Watabou city": "Watabou — город",
  "Watabou town": "Watabou — городок",
  "Watabou village": "Watabou — деревня",
  "Watabou hamlet": "Watabou — посёлок",
  "Watabou fort": "Watabou — форт",
  "Watabou monastery": "Watabou — монастырь",
  "Watabou caravanserai": "Watabou — караван-сарай",
  "Watabou post": "Watabou — застава",
  "Illustrated palace": "Иллюстрированный дворец",
  "Illustrated burgh": "Иллюстрированный город",
  "Illustrated castle": "Иллюстрированный замок",
  "Illustrated abbey": "Иллюстрированное аббатство",
  "Illustrated caravanserai": "Иллюстрированный караван-сарай",
  "Illustrated camp": "Иллюстрированный лагерь",
  "Blur 0.2": "Размытие 0,2",
  "Blur 1": "Размытие 1",
  "Blur 3": "Размытие 3",
  "Blur 5": "Размытие 5",
  "Blur 7": "Размытие 7",
  "Blur 10": "Размытие 10",
  Splotch: "Пятно",
  "Shadow 2": "Тень 2",
  "Shadow 0.1": "Тень 0,1",
  "Shadow 0.5": "Тень 0,5",
  ". For older versions see the": ". Старые версии доступны в",
  ". Please report bugs": ". Сообщайте об ошибках",
  ". You can also contact me directly via": ". Также со мной можно связаться напрямую через",
  ". Open": ". Откройте",
  ". If you have a font": ". Если у вас есть шрифт",
  ". Provide font name and link to the font file hosted online. The best free font hostings are": ". Укажите название шрифта и ссылку на размещённый в интернете файл. Лучшие бесплатные хостинги шрифтов:",
  ". To get font file open the link to css provided by these services and manually copy the link to": ". Чтобы получить файл шрифта, откройте ссылку на CSS от сервиса и вручную скопируйте ссылку на",
  auto: "авто",
  "Map seed": "Сид карты",
  "Points number": "Количество точек",
  "Cultures number": "Количество культур",
  "Cultures set": "Набор культур",
  "States number": "Количество государств",
  "Provinces ratio": "Доля провинций",
  "Size variety": "Разброс размеров",
  "Growth rate": "Скорость экспансии",
  "Burgs number": "Количество поселений",
  "Religions number": "Количество религий",
  "Interface settings:": "Настройки интерфейса:",
  "On load": "При запуске",
  "Azgaar assistant": "Ассистент Azgaar",
  "Speaker voice": "Голос озвучивания",
  "Emblem shape": "Форма герба",
  "Viewport size": "Размер области просмотра",
  "Zoom extent": "Диапазон масштаба",
  "Configure World": "Настроить мир",
  "Set Lore": "Настроить лор",
  "Reset Options": "Сбросить настройки",
  English: "Английский",
  "All-world": "Весь мир",
  European: "Европейский",
  Oriental: "Восточный",
  Antique: "Античный",
  "High Fantasy": "Высокое фэнтези",
  "Dark Fantasy": "Тёмное фэнтези",
  Random: "Случайный"
};

function readMissingStrings() {
  const result = spawnSync(process.execPath, [EXTRACTOR_PATH, "--json"], { cwd: ROOT, encoding: "utf8" });
  if (!result.stdout.trim()) throw new Error(result.stderr || "The i18n extractor returned no data");
  return JSON.parse(result.stdout);
}

function createBatches(strings) {
  const batches = [];
  let batch = [];
  let length = 0;
  for (const value of strings) {
    const additional = value.length + SEPARATOR.length + 2;
    if (batch.length && length + additional > MAX_BATCH_LENGTH) {
      batches.push(batch);
      batch = [];
      length = 0;
    }
    batch.push(value);
    length += additional;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

function prepareSource(value) {
  return value
    .replace(/\bBurgs\b/g, "Settlements")
    .replace(/\bburgs\b/g, "settlements")
    .replace(/\bBurg\b/g, "Settlement")
    .replace(/\bburg\b/g, "settlement")
    .replace(/\bCells\b/g, "Grid cells")
    .replace(/\bcells\b/g, "grid cells");
}

async function requestTranslation(source) {
  const url = new URL(ENDPOINT);
  url.search = new URLSearchParams({ client: "gtx", dt: "t", q: source, sl: "en", tl: "ru" }).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Translation request failed: ${response.status} ${response.statusText}`);
  const data = await response.json();
  return data[0].map(part => part[0]).join("");
}

async function translateBatch(batch) {
  const prepared = batch.map(prepareSource);
  const translated = await requestTranslation(prepared.join(`\n${SEPARATOR}\n`));
  const parts = translated.split(new RegExp(`\\s*${SEPARATOR}\\s*`));
  if (parts.length === batch.length) return parts;
  return Promise.all(prepared.map(requestTranslation));
}

function save(locale) {
  locale.messages = Object.fromEntries(Object.entries(locale.messages).sort(([left], [right]) => left.localeCompare(right)));
  fs.writeFileSync(LOCALE_PATH, `${JSON.stringify(locale, null, 2)}\n`);
}

const locale = JSON.parse(fs.readFileSync(LOCALE_PATH, "utf8"));
const missing = readMissingStrings().filter(source => !(source in manualTranslations));
const batches = createBatches(missing);

Object.assign(locale.messages, manualTranslations);
process.stdout.write(`Translating ${missing.length} strings in ${batches.length} batches\n`);

for (let index = 0; index < batches.length; index++) {
  const batch = batches[index];
  const translated = await translateBatch(batch);
  batch.forEach((source, itemIndex) => {
    locale.messages[source] = translated[itemIndex].trim();
  });
  save(locale);
  process.stdout.write(`\rCompleted ${index + 1}/${batches.length} batches`);
}

save(locale);
process.stdout.write("\nRussian catalog updated\n");
