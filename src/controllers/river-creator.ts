import { type D3DragEvent, drag, select } from "d3";
import { closeDialogs, destroyDialog } from "@/components/dialog/dialog-helpers";
import { Layers } from "@/components/layers";
import { clearMainTip, tip } from "@/components/tooltips";
import { applyDefaultViewboxEvents } from "@/components/viewbox-events";
import { setMapBrushActive } from "@/components/zoom";
import { Controllers } from "@/controllers";
import type { Point } from "@/generators/voronoi";
import { ensureEl, last, rn } from "../utils";
import { getRiverBrushCells, orientRiverBrushCells } from "./river-brush";

let creatorCells: number[] = [];
let brushActive = false;

let isCellsLayerForced = false; // the cells layer is turned on for the editing mode

function open(): void {
  if (customization) return;
  closeDialogs();
  Layers.show("rivers");

  isCellsLayerForced = !Layers.isOn("cells");
  Layers.show("cells");

  select("#debug").append("g").attr("id", "controlCells");
  select("#debug").append("polyline").attr("id", "riverBrushPreview");

  creatorCells = [];
  renderDialog();
  setBrushActive(true);

  $("#riverCreator").dialog({
    title: "Create River",
    resizable: false,
    position: { my: "left top", at: "left+10 top+10", of: "#map" },
    close: closeRiverCreator
  });
}

function renderDialog(): void {
  destroyDialog("riverCreator");

  const html = /* html */ `<div id="riverCreator" class="dialog">
    <div id="riverCreatorMode" style="max-width: 24em; white-space: normal"></div>
    <div id="riverCreatorBody" class="table"></div>
    <div id="riverCreatorBottom">
      <button id="riverCreatorBrush" data-tip="Toggle river brush" aria-pressed="true"><i class="icon-brush"></i> Brush</button>
      <button id="riverCreatorUndo" data-tip="Remove the last river point" class="icon-ccw"></button>
      <button id="riverCreatorComplete" data-tip="Complete river creation" class="icon-check"></button>
      <button id="riverCreatorCancel" data-tip="Cancel the creation" class="icon-cancel"></button>
    </div>
  </div>`;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", html);

  // add listeners — dropped together with the dialog HTML on close
  ensureEl("riverCreatorComplete").addEventListener("click", addRiver);
  ensureEl("riverCreatorBrush").addEventListener("click", () => setBrushActive(!brushActive));
  ensureEl("riverCreatorUndo").addEventListener("click", () => {
    const cell = creatorCells.at(-1);
    if (cell !== undefined) removeCell(cell);
  });
  ensureEl("riverCreatorCancel").addEventListener("click", cancelCreation);
  ensureEl("riverCreatorBody").addEventListener("click", onBodyClick);
}

function cancelCreation(): void {
  $("#riverCreator").dialog("close");
}

function onBodyClick(ev: Event): void {
  const el = ev.target as HTMLElement;
  const cl = el.classList;
  const cell = +(el.parentNode as HTMLElement).dataset.cell!;
  if (cl.contains("editFlux")) pack.cells.fl[cell] = +(el as HTMLInputElement).value;
  else if (cl.contains("icon-trash-empty")) removeCell(cell);
}

function setBrushActive(active: boolean): void {
  brushActive = active;
  applyDefaultViewboxEvents();
  setMapBrushActive(active);
  const button = ensureEl("riverCreatorBrush");
  button.classList.toggle("pressed", active);
  button.setAttribute("aria-pressed", String(active));
  const message = active
    ? "Draw in either direction with the left mouse button. The water-connected end becomes the mouth. Middle mouse button pans the map."
    : "Brush is off. Drag the map normally, or enable the brush to continue the river.";
  ensureEl("riverCreatorMode").textContent = message;
  tip(message, true);
  if (!active) return;

  select<SVGGElement, unknown>("#viewbox")
    .style("cursor", "crosshair")
    .on("click", null)
    .call(
      drag<SVGGElement, unknown>()
        .container(function () {
          return this;
        })
        .filter((event: MouseEvent) => !event.button && !event.ctrlKey)
        .on("start", drawStroke)
    );
}

function drawStroke(event: D3DragEvent<SVGGElement, unknown, unknown>): void {
  let previous: Point = [event.x, event.y];
  const paint = (point: Point): void => {
    if (!brushActive) return;
    const cells = getRiverBrushCells(previous, point, (x, y) => Pack.findCell(x, y));
    for (const cell of cells) {
      if (!creatorCells.includes(cell)) addCell(cell);
    }
    drawCells(creatorCells);
    previous = point;
  };
  paint(previous);
  event.on("drag", (move: D3DragEvent<SVGGElement, unknown, unknown>) => paint([move.x, move.y]));
}

function addCell(cell: number): void {
  creatorCells.push(cell);

  const flux = pack.cells.fl[cell];
  const line = `<div class="editorLine" data-cell="${cell}">
      <span>Cell ${cell}</span>
      <span data-tip="Set flux affects river width" style="margin-left: 0.4em">Flux</span>
      <input type="number" min=0 value="${flux}" class="editFlux" style="width: 5em"/>
      <span data-tip="Remove the cell" class="icon-trash-empty pointer"></span>
    </div>`;
  ensureEl("riverCreatorBody").insertAdjacentHTML("beforeend", line);
}

function removeCell(cell: number): void {
  creatorCells = creatorCells.filter(c => c !== cell);
  drawCells(creatorCells);
  ensureEl("riverCreatorBody").querySelector(`div[data-cell='${cell}']`)?.remove();
}

function drawCells(cells: number[]): void {
  select("#riverBrushPreview").attr("points", cells.map(cell => pack.cells.p[cell].join(",")).join(" "));
  select("#debug")
    .select("#controlCells")
    .selectAll(`polygon`)
    .data(cells)
    .join("polygon")
    .attr("points", (d: number) => String(Pack.getPolygon(d)))
    .attr("class", "current");
}

function addRiver(): void {
  const { rivers: packRivers, cells } = pack;
  const riverCells = orientRiverBrushCells(creatorCells, cells);
  if (riverCells.length < 2) {
    tip("Add at least 2 cells", false, "error");
    return;
  }

  if (!riverCells.some(cell => cells.h[cell] >= 20)) {
    tip("A river must include at least one land cell", false, "error");
    return;
  }

  const riverId = Rivers.getNextId(packRivers);
  const waterMouth = cells.h[last(riverCells)] < 20;
  const parent = (!waterMouth && cells.r[last(riverCells)]) || riverId;

  riverCells.forEach(cell => {
    if (cells.h[cell] >= 20 && !cells.r[cell]) cells.r[cell] = riverId;
  });

  const source = riverCells[0];
  const mouth = waterMouth || parent !== riverId ? riverCells[riverCells.length - 2] : last(riverCells);
  const sourceWidth = Rivers.getSourceWidth(cells.fl[source]);
  const defaultWidthFactor = rn(1 / (options.map.graph.points / 10000) ** 0.25, 2);
  const widthFactor = 1.2 * defaultWidthFactor;

  const meanderedPoints = Rivers.addMeandering(riverCells);

  const discharge = cells.fl[mouth]; // m3 in second
  const length = Rivers.getApproximateLength(meanderedPoints as unknown as Point[]);
  const width = Rivers.getWidth(
    Rivers.getOffset({
      flux: discharge,
      pointIndex: meanderedPoints.length,
      widthFactor,
      startingWidth: sourceWidth
    })
  );
  const name = Rivers.getName(mouth);
  const basin = Rivers.getBasin(parent);

  packRivers.push({
    i: riverId,
    source,
    mouth,
    discharge,
    length,
    width,
    widthFactor,
    sourceWidth,
    parent,
    cells: riverCells,
    basin,
    name,
    type: "River"
  });
  Layers.draw("rivers");
  void Controllers.RiverEditor.open(`river${riverId}`);
}

function closeRiverCreator(): void {
  brushActive = false;
  select("#debug").select("#controlCells").remove();
  select("#riverBrushPreview").remove();
  applyDefaultViewboxEvents();
  clearMainTip();

  if (isCellsLayerForced) Layers.hide("cells");
  isCellsLayerForced = false;

  destroyDialog("riverCreator");
}

export const RiverCreator = { open };
