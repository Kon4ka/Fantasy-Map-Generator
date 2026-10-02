/** UI-only fonts: binaries live in browser storage, never in map saves or the map font catalog. */
export const INTERFACE_FONTS = [
  "default",
  "Segoe UI",
  "Arial",
  "Verdana",
  "Tahoma",
  "Trebuchet MS",
  "Georgia",
  "Calibri"
];

export interface InterfaceFont {
  id: string;
  name: string;
}

interface StoredFont extends InterfaceFont {
  data: ArrayBuffer;
}

let revision = 0;
let activeFont: FontFace | undefined;

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("kontar-interface-fonts", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("fonts", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => reject(new Error("Cannot access local font storage"));
  });
}

async function readFonts(id?: string): Promise<StoredFont | StoredFont[] | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("fonts", "readonly");
      const store = transaction.objectStore("fonts");
      const request = id ? store.get(id) : store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = transaction.onabort = () => reject(new Error("Cannot access local font storage"));
    });
  } finally {
    db.close();
  }
}

export async function listInterfaceFonts(): Promise<InterfaceFont[]> {
  const fonts = (await readFonts()) as StoredFont[];
  return fonts.map(({ id, name }) => ({ id, name }));
}

async function loadFont(font: StoredFont): Promise<FontFace> {
  try {
    return await new FontFace(font.id, font.data).load();
  } catch {
    throw new Error("Cannot load this font. Choose a valid TTF, OTF, WOFF or WOFF2 file");
  }
}

export async function importInterfaceFont(file: File): Promise<InterfaceFont> {
  if (!/\.(ttf|otf|woff2?)$/i.test(file.name)) throw new Error("Choose a TTF, OTF, WOFF or WOFF2 font file");
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("Font files must be between 1 byte and 10 MB");
  const font: StoredFont = {
    id: `KontarUI_${crypto.randomUUID().replaceAll("-", "")}`,
    name: file.name.replace(/\.[^.]+$/, ""),
    data: await file.arrayBuffer()
  };
  await loadFont(font);
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("fonts", "readwrite");
      transaction.objectStore("fonts").put(font);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () =>
        reject(new Error("Cannot save this font in local browser storage"));
    });
  } finally {
    db.close();
  }
  return { id: font.id, name: font.name };
}

export async function applyInterfaceFont(id: string): Promise<boolean> {
  const currentRevision = ++revision;
  let nextFont: FontFace | undefined;
  let family = "Helvetica, Arial, sans-serif";
  if (id !== "default" && INTERFACE_FONTS.includes(id)) family = `"${id}", Arial, sans-serif`;
  else if (id !== "default") {
    if (!/^KontarUI_[a-f0-9]{32}$/.test(id)) throw new Error("The selected interface font is unavailable");
    const font = (await readFonts(id)) as StoredFont | undefined;
    if (!font) throw new Error("The selected interface font is unavailable");
    nextFont = await loadFont(font);
    family = `"${id}", Arial, sans-serif`;
  }
  if (currentRevision !== revision) return false;
  if (activeFont) document.fonts.delete(activeFont);
  if (nextFont) document.fonts.add(nextFont);
  activeFont = nextFont;
  document.documentElement.style.setProperty("--ui-font", family);
  return true;
}
