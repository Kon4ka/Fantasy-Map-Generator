// @vitest-environment jsdom
import { select } from "d3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tip } from "@/components/tooltips";

const mocks = vi.hoisted(() => ({ setBrush: vi.fn(), close: () => {} }));
vi.mock("@/components/dialog/dialog-helpers", () => ({
  closeDialogs: vi.fn(),
  destroyDialog: (id: string) => document.getElementById(id)?.remove()
}));
vi.mock("@/components/layers", () => ({ Layers: { show: vi.fn(), hide: vi.fn(), draw: vi.fn(), isOn: () => false } }));
vi.mock("@/components/tooltips", () => ({ tip: vi.fn(), clearMainTip: vi.fn() }));
vi.mock("@/components/zoom", () => ({ setMapBrushActive: mocks.setBrush }));
vi.mock("@/controllers", () => ({ Controllers: { RiverEditor: { open: vi.fn() } } }));
vi.mock("@/components/viewbox-events", () => ({
  applyDefaultViewboxEvents: () => select("#viewbox").on(".drag", null).style("cursor", "default")
}));

import { RiverCreator } from "./river-creator";

const stroke = async (button: number, start: number, end: number): Promise<void> => {
  const eventView = document.defaultView!;
  const mouseEvent = (type: string, clientX: number): MouseEvent => {
    const event = new eventView.MouseEvent(type, { button, clientX, clientY: 10, bubbles: true });
    Object.defineProperty(event, "view", { value: eventView });
    return event;
  };
  document.getElementById("viewbox")!.dispatchEvent(mouseEvent("mousedown", start));
  eventView.dispatchEvent(mouseEvent("mousemove", end));
  eventView.dispatchEvent(mouseEvent("mouseup", end));
  await new Promise(resolve => setTimeout(resolve, 0));
};
const cellRows = () =>
  [...document.querySelectorAll<HTMLElement>("#riverCreatorBody [data-cell]")].map(el => el.dataset.cell);

beforeEach(() => {
  vi.clearAllMocks();
  document.body.innerHTML = '<svg id="map"><g id="viewbox"><g id="debug"></g></g></svg><div id="dialogs"></div>';
  vi.stubGlobal("customization", 0);
  vi.stubGlobal("$", () => ({
    dialog: (config: { close: () => void }) => {
      mocks.close = config.close;
    }
  }));
  vi.stubGlobal("Pack", {
    findCell: (x: number) => Math.floor(x / 10),
    getPolygon: () => [
      [0, 0],
      [10, 0],
      [10, 10]
    ]
  });
  vi.stubGlobal("pack", {
    cells: {
      h: new Uint8Array([40, 35, 30, 25, 20]),
      c: [[1], [0, 2], [1, 3], [2, 4], [3]],
      r: new Uint16Array(5),
      fl: [10, 20, 30, 40, 50],
      p: [
        [5, 10],
        [15, 10],
        [25, 10],
        [35, 10],
        [45, 10]
      ]
    },
    rivers: []
  });
  vi.stubGlobal("options", { map: { graph: { points: 10000 } } });
  vi.stubGlobal("Rivers", {
    getNextId: () => 1,
    getSourceWidth: vi.fn((flux: number) => flux / 100),
    addMeandering: vi.fn((cells: number[]) => cells.map(cell => [...pack.cells.p[cell], 0])),
    getApproximateLength: () => 100,
    getWidth: () => 1,
    getOffset: vi.fn(() => 1),
    getName: vi.fn(() => "Test river"),
    getBasin: vi.fn((parent: number) => parent)
  });
  RiverCreator.open();
});

afterEach(() => {
  mocks.close();
  vi.unstubAllGlobals();
});

describe("river creation brush", () => {
  it.each([
    [5, 45],
    [45, 5]
  ])("commits the same land source and coast mouth in either direction: %j", async (start, end) => {
    pack.cells.h[4] = 10;
    pack.cells.fl[4] = 0;
    await stroke(0, start, end);
    document.getElementById("riverCreatorComplete")!.click();
    expect(pack.rivers[0]).toMatchObject({ source: 0, mouth: 3, cells: [0, 1, 2, 3, 4], discharge: 40, parent: 1 });
    expect([...pack.cells.r]).toEqual([1, 1, 1, 1, 0]);
    expect(Rivers.getName).toHaveBeenCalledWith(3);
    expect(Rivers.getSourceWidth).toHaveBeenCalledWith(10);
  });

  it("reaches neighboring water when the user starts on the shore", async () => {
    pack.cells.h[4] = 10;
    await stroke(0, 35, 5);
    document.getElementById("riverCreatorComplete")!.click();
    expect(pack.rivers[0]).toMatchObject({ source: 0, mouth: 3, cells: [0, 1, 2, 3, 4] });
  });

  it("clips a water overshoot and calculates discharge on land without altering the brush history", async () => {
    pack.cells.h[0] = pack.cells.h[1] = 10;
    await stroke(0, 5, 45);
    document.getElementById("riverCreatorComplete")!.click();
    expect(pack.rivers[0]).toMatchObject({ source: 4, mouth: 2, cells: [4, 3, 2, 1], discharge: 30 });
    expect([...pack.cells.r]).toEqual([0, 0, 1, 1, 1]);
    expect(cellRows()).toEqual(["0", "1", "2", "3", "4"]);
  });

  it("keeps the drawn direction when both ends are inland", async () => {
    await stroke(0, 45, 5);
    document.getElementById("riverCreatorComplete")!.click();
    expect(pack.rivers[0]).toMatchObject({ source: 4, mouth: 0, cells: [4, 3, 2, 1, 0] });
  });

  it("does not attach a water mouth to another river occupying that water cell", async () => {
    pack.cells.h[4] = 10;
    pack.cells.r[4] = 7;
    await stroke(0, 45, 5);
    document.getElementById("riverCreatorComplete")!.click();
    expect(pack.rivers[0]).toMatchObject({ parent: 1, basin: 1, source: 0, mouth: 3 });
    expect(pack.cells.r[4]).toBe(7);
  });

  it("preserves land confluences and existing cell ownership", async () => {
    pack.cells.r[4] = 7;
    await stroke(0, 5, 45);
    document.getElementById("riverCreatorComplete")!.click();
    expect(pack.rivers[0]).toMatchObject({ parent: 7, basin: 7, mouth: 3, discharge: 40 });
    expect(pack.cells.r[4]).toBe(7);
  });

  it("preserves a confluence on the coast instead of extending it into the sea", async () => {
    pack.cells.h[4] = 10;
    pack.cells.r[3] = 7;
    await stroke(0, 5, 35);
    document.getElementById("riverCreatorComplete")!.click();
    expect(pack.rivers[0]).toMatchObject({ parent: 7, mouth: 2, cells: [0, 1, 2, 3] });
    expect(pack.cells.r[3]).toBe(7);
    expect(pack.cells.r[4]).toBe(0);
  });

  it("rejects water-only strokes without changing river data", async () => {
    pack.cells.h.fill(10);
    await stroke(0, 5, 45);
    document.getElementById("riverCreatorComplete")!.click();
    expect(pack.rivers).toEqual([]);
    expect([...pack.cells.r]).toEqual([0, 0, 0, 0, 0]);
    expect(tip).toHaveBeenLastCalledWith("A river must include at least one land cell", false, "error");
  });
  it("draws a continuous LMB stroke without duplicates and ignores RMB/MMB", async () => {
    await stroke(0, 5, 45);
    expect(cellRows()).toEqual(["0", "1", "2", "3", "4"]);
    await stroke(0, 15, 25);
    await stroke(1, 5, 45);
    await stroke(2, 5, 45);
    expect(cellRows()).toHaveLength(5);
    expect(document.getElementById("riverBrushPreview")!.getAttribute("points")).toBe("5,10 15,10 25,10 35,10 45,10");
  });

  it("switches cursors and releases LMB while the brush is disabled", async () => {
    expect(document.getElementById("viewbox")!.style.cursor).toBe("crosshair");
    document.getElementById("riverCreatorBrush")!.click();
    expect(document.getElementById("riverCreatorBrush")!.getAttribute("aria-pressed")).toBe("false");
    expect(document.getElementById("viewbox")!.style.cursor).toBe("default");
    await stroke(0, 5, 45);
    expect(cellRows()).toEqual([]);
    expect(mocks.setBrush).toHaveBeenLastCalledWith(false);
    document.getElementById("riverCreatorBrush")!.click();
    await stroke(0, 5, 25);
    expect(cellRows()).toEqual(["0", "1", "2"]);
  });

  it("undoes the last point and removes temporary geometry on cancel", async () => {
    await stroke(0, 5, 25);
    document.getElementById("riverCreatorUndo")!.click();
    expect(cellRows()).toEqual(["0", "1"]);
    mocks.close();
    expect(document.getElementById("riverBrushPreview")).toBeNull();
    expect(document.getElementById("controlCells")).toBeNull();
    expect(document.getElementById("viewbox")!.style.cursor).toBe("default");
    expect(pack.rivers).toEqual([]);
  });
});
