// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addHeightmapScheme,
  initializeHeightmapSchemes,
  syncHeightmapSchemeSelect
} from "@/components/heightmap-color-schemes";
import { encodeColorRamp, parseColorRamp } from "@/utils/heightmap-colors";

const mocks = vi.hoisted(() => ({
  draw: vi.fn(),
  confirm: vi.fn(),
  dialogs: [] as { buttons: Record<string, () => void>; close: () => void }[]
}));
vi.mock("@/components/layers", () => ({ Layers: { draw: mocks.draw } }));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn() }));
vi.mock("@/renderers/draw-heightmap", () => ({ drawHeights: () => "data:image/png;base64," }));
vi.mock("@/components/dialog/dialog-helpers", () => ({
  confirmationDialog: mocks.confirm,
  destroyDialog: (id: string) => document.getElementById(id)?.remove()
}));

import { HeightmapColorEditor } from "./heightmap-color-editor";

const source = encodeColorRamp({
  name: "Sea",
  interpolation: "linear",
  stops: [
    { position: 0, color: "#ffffff" },
    { position: 1, color: "#000000" }
  ]
});
beforeEach(() => {
  document.body.innerHTML =
    '<select id="styleElementSelect"><option value="oceanHeights">Ocean</option><option value="terrs">Land</option></select><select id="styleHeightmapScheme"></select><button id="editHeightmapSchemeButton"></button><button id="deleteHeightmapSchemeButton"></button>';
  localStorage.clear();
  mocks.dialogs.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("styles", {
    heightmap: { landHeights: { options: { scheme: "natural" } }, oceanHeights: { options: { scheme: source } } }
  });
  vi.stubGlobal("grid", { cells: { h: [0, 19, 40] }, cellsX: 3, cellsY: 1 });
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    callback();
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("$", () => ({
    dialog: (options: unknown) => {
      if (typeof options === "object") mocks.dialogs.push(options as (typeof mocks.dialogs)[number]);
      if (options === "close") mocks.dialogs.at(-1)?.close();
    }
  }));
  initializeHeightmapSchemes();
  addHeightmapScheme(source);
});

describe("heightmap color editor", () => {
  it("does not open against an unfinished map load", () => {
    vi.stubGlobal("grid", {});
    HeightmapColorEditor.open();
    expect(document.getElementById("heightmapColorEditor")).toBeNull();
  });
  it("edits a precise stop position and name without changing the map until Apply", () => {
    HeightmapColorEditor.open(true);
    const name = document.getElementById("rampName") as HTMLInputElement;
    name.value = "Fog sea";
    const position = document.getElementById("rampPosition") as HTMLInputElement;
    position.value = "0.375";
    position.dispatchEvent(new Event("input"));
    expect(styles.heightmap.oceanHeights.options.scheme).toBe(source);
    mocks.dialogs.at(-1)!.buttons.Apply();
    const saved = parseColorRamp(styles.heightmap.oceanHeights.options.scheme)!;
    expect(saved.name).toBe("Fog sea");
    expect(saved.stops[0].position).toBe(0.375);
    expect(styles.heightmap.landHeights.options.scheme).toBe("natural");
    expect(document.getElementById("heightmapColorEditor")).toBeNull();
    expect(JSON.parse(localStorage.getItem("heightmapColorSchemes")!)).toContain(
      styles.heightmap.oceanHeights.options.scheme
    );
  });
  it("cancel discards draft edits and removes transient UI", () => {
    HeightmapColorEditor.open();
    document.getElementById("rampAddStop")!.click();
    expect(document.querySelectorAll(".ramp-stop")).toHaveLength(3);
    mocks.dialogs.at(-1)!.buttons.Cancel();
    expect(styles.heightmap.oceanHeights.options.scheme).toBe(source);
    expect(mocks.draw).not.toHaveBeenCalled();
    expect(document.getElementById("heightmapColorEditor")).toBeNull();
  });
  it("deletes only confirmed custom palettes and resets every current reference", () => {
    styles.heightmap.landHeights.options.scheme = source;
    HeightmapColorEditor.remove();
    expect(styles.heightmap.oceanHeights.options.scheme).toBe(source);
    mocks.confirm.mock.calls[0][0].onConfirm();
    expect(styles.heightmap.landHeights.options.scheme).toBe("natural");
    expect(styles.heightmap.oceanHeights.options.scheme).toBe("natural");
    expect(localStorage.getItem("heightmapColorSchemes")).not.toContain(source);
    expect(document.querySelector(`option[value='${source}']`)).toBeNull();
  });
  it("protects built-in palettes and restores browser palettes without duplicates", () => {
    styles.heightmap.oceanHeights.options.scheme = "natural";
    HeightmapColorEditor.remove();
    expect(mocks.confirm).not.toHaveBeenCalled();
    syncHeightmapSchemeSelect("natural");
    expect((document.getElementById("deleteHeightmapSchemeButton") as HTMLButtonElement).disabled).toBe(true);
    initializeHeightmapSchemes();
    addHeightmapScheme(source);
    addHeightmapScheme(source);
    expect(
      Array.from((document.getElementById("styleHeightmapScheme") as HTMLSelectElement).options).filter(
        option => option.value === source
      )
    ).toHaveLength(1);
  });
});
