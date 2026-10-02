// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapFileSession } from "./map-file-session";

vi.mock("@/services/localization", () => ({ translate: (text: string) => text }));
vi.mock("@/utils", () => ({
  downloadFile: vi.fn(),
  ensureEl: (id: string) => document.getElementById(id)!
}));

interface DialogOptions {
  open: () => void;
  close: () => void;
  buttons: { text: string; click: () => void }[];
}
let dialog: DialogOptions;
let files: MapFileSession;
const saveAs = vi.fn(async (name: string) => ({ id: "copy", name }));

beforeAll(async () => {
  window.mapFileBridge = { associate: vi.fn(), save: vi.fn(), saveAs };
  vi.stubGlobal("$", () => ({
    dialog: (value: DialogOptions | string) => {
      if (value === "close") dialog.close();
      else if (typeof value !== "string") {
        dialog = value;
        dialog.open();
      }
    }
  }));
  files = (await import("./map-file")).MapFiles;
});

beforeEach(() => {
  document.body.innerHTML = '<div id="alertMessage"></div>';
  saveAs.mockClear();
  files.clear();
});

describe("Save as name dialog", () => {
  it("accepts an edited name, adds .map and makes that the active file", async () => {
    const saving = files.save("map data", "original.map", true);
    await vi.waitFor(() => expect(document.getElementById("mapSaveName")).not.toBeNull());
    const input = document.getElementById("mapSaveName") as HTMLInputElement;
    expect(input.value).toBe("original - copy.map");
    input.value = "My new map";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await saving;
    expect(saveAs).toHaveBeenCalledWith("My new map.map", "map data");
    expect(files.name).toBe("My new map.map");
  });

  it("cancel makes no copy", async () => {
    const saving = files.save("map data", "original.map", true);
    await vi.waitFor(() => expect(document.getElementById("mapSaveName")).not.toBeNull());
    dialog.buttons[1].click();
    expect(await saving).toBeNull();
    expect(saveAs).not.toHaveBeenCalled();
  });
});
