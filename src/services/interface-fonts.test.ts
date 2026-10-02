// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let service: typeof import("./interface-fonts");
const rows = new Map<string, unknown>();
let fontLoad: (font: FakeFontFace) => Promise<FakeFontFace>;
let failWrite = false;
class FakeFontFace {
  constructor(public family: string) {}
  load() {
    return fontLoad(this);
  }
}
const fontSet = { add: vi.fn(), delete: vi.fn() };

beforeEach(async () => {
  vi.resetModules();
  rows.clear();
  failWrite = false;
  fontLoad = async font => font;
  vi.stubGlobal("FontFace", FakeFontFace);
  Object.defineProperty(document, "fonts", { configurable: true, value: fontSet });
  fontSet.add.mockClear();
  fontSet.delete.mockClear();
  document.documentElement.style.setProperty("--sans-serif", "Map font");
  vi.stubGlobal("indexedDB", {
    open: () => {
      const openRequest: Record<string, unknown> = {};
      openRequest.result = {
        close: vi.fn(),
        transaction: () => {
          const transaction: Record<string, unknown> = {};
          transaction.objectStore = () => ({
            get: (id: string) => read(rows.get(id)),
            getAll: () => read([...rows.values()]),
            put: (font: { id: string }) => {
              queueMicrotask(() => {
                if (failWrite) (transaction.onerror as () => void)();
                else {
                  rows.set(font.id, font);
                  (transaction.oncomplete as () => void)();
                }
              });
            }
          });
          return transaction;
        }
      };
      queueMicrotask(() => (openRequest.onsuccess as () => void)());
      return openRequest;
    }
  });
  service = await import("./interface-fonts");
});

function read(result: unknown) {
  const request: Record<string, unknown> = { result };
  queueMicrotask(() => (request.onsuccess as () => void)());
  return request;
}

function file(name = "My font.ttf", size = 24): File {
  return { name, size, arrayBuffer: async () => new ArrayBuffer(24) } as File;
}

afterEach(() => vi.unstubAllGlobals());

describe("interface fonts", () => {
  it("applies system fonts without touching map fonts or storage", async () => {
    vi.stubGlobal("indexedDB", {
      open: () => {
        throw new Error("No storage");
      }
    });
    expect(await service.applyInterfaceFont("Georgia")).toBe(true);
    expect(document.documentElement.style.getPropertyValue("--ui-font")).toContain('"Georgia"');
    expect(document.documentElement.style.getPropertyValue("--sans-serif")).toBe("Map font");
    await service.applyInterfaceFont("default");
    expect(document.documentElement.style.getPropertyValue("--ui-font")).toBe("Helvetica, Arial, sans-serif");
  });

  it("validates file type, empty files, size and font parsing before storing", async () => {
    await expect(service.importInterfaceFont(file("bad.png"))).rejects.toThrow("Choose a TTF");
    await expect(service.importInterfaceFont(file("empty.ttf", 0))).rejects.toThrow("10 MB");
    await expect(service.importInterfaceFont(file("big.woff2", 11 * 1024 * 1024))).rejects.toThrow("10 MB");
    fontLoad = async () => {
      throw new Error("Invalid binary");
    };
    await expect(service.importInterfaceFont(file())).rejects.toThrow("Cannot load this font");
    expect(rows.size).toBe(0);
  });

  it("persists the binary, lists its name and applies it independently of map fonts", async () => {
    const font = await service.importInterfaceFont(file("Мой шрифт.OTF"));
    expect(await service.listInterfaceFonts()).toEqual([font]);
    expect(font.name).toBe("Мой шрифт");
    expect(rows.get(font.id)).toMatchObject({ data: expect.any(ArrayBuffer) });
    await service.applyInterfaceFont(font.id);
    expect(fontSet.add).toHaveBeenCalledWith(expect.objectContaining({ family: font.id }));
    expect(document.documentElement.style.getPropertyValue("--ui-font")).toContain(font.id);
    await service.applyInterfaceFont("Arial");
    expect(fontSet.delete).toHaveBeenCalledOnce();
  });

  it("reports failed persistence without claiming the font was saved", async () => {
    failWrite = true;
    await expect(service.importInterfaceFont(file())).rejects.toThrow("Cannot save this font");
    expect(rows.size).toBe(0);
    expect(fontSet.add).not.toHaveBeenCalled();
  });

  it("does not let a slow custom font overwrite a more recent selection", async () => {
    const font = await service.importInterfaceFont(file());
    let release!: (font: FakeFontFace) => void;
    let pending!: FakeFontFace;
    fontLoad = font => {
      pending = font;
      return new Promise(resolve => {
        release = resolve;
      });
    };
    const slow = service.applyInterfaceFont(font.id);
    await vi.waitFor(() => expect(release).toBeDefined());
    await service.applyInterfaceFont("Verdana");
    release(pending);
    expect(await slow).toBe(false);
    expect(document.documentElement.style.getPropertyValue("--ui-font")).toContain("Verdana");
  });

  it("rejects missing fonts and untrusted font IDs", async () => {
    await expect(service.applyInterfaceFont("unknown")).rejects.toThrow("unavailable");
    await expect(service.applyInterfaceFont(`KontarUI_${"0".repeat(32)}`)).rejects.toThrow("unavailable");
  });
});
