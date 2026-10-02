import { color } from "d3";
import { confirmationDialog, destroyDialog } from "@/components/dialog/dialog-helpers";
import {
  addHeightmapScheme,
  removeHeightmapScheme,
  syncHeightmapSchemeSelect
} from "@/components/heightmap-color-schemes";
import { Layers } from "@/components/layers";
import { tip } from "@/components/tooltips";
import { drawHeights } from "@/renderers/draw-heightmap";
import {
  type ColorStop,
  editableColorRamp,
  encodeColorRamp,
  interpolateColorRamp,
  parseColorRamp
} from "@/utils/heightmap-colors";
import { ensureEl, findEl } from "@/utils/nodeUtils";

const ID = "heightmapColorEditor";
export const HeightmapColorEditor = { open, remove };

function currentOptions() {
  return ensureEl<HTMLSelectElement>("styleElementSelect").value === "oceanHeights"
    ? styles.heightmap.oceanHeights.options
    : styles.heightmap.landHeights.options;
}

function remove(): void {
  const source = currentOptions().scheme;
  if (!parseColorRamp(source)) return;
  confirmationDialog({
    title: "Delete custom color palette",
    message:
      "Delete this custom palette? Layers using it will switch to the Natural palette. Saved map files are not changed.",
    confirm: "Delete",
    onConfirm: () => {
      for (const options of [styles.heightmap.landHeights.options, styles.heightmap.oceanHeights.options]) {
        if (options.scheme === source) options.scheme = "natural";
      }
      removeHeightmapScheme(source);
      syncHeightmapSchemeSelect(currentOptions().scheme);
      Layers.draw("heightmap", "oceanDepths");
    }
  });
}

function open(edit = false): void {
  if (typeof grid === "undefined" || !grid.cells?.h?.length) {
    tip("Map is still loading. Please try again.", false, "warn");
    return;
  }
  if (findEl(ID)) return;
  const options = currentOptions();
  const source = options.scheme;
  const ocean = options === styles.heightmap.oceanHeights.options;
  const ramp = editableColorRamp(source);
  if (!edit) ramp.name = "";
  let selected = ramp.stops[0];
  let previewFrame = 0;
  const root = document.createElement("div");
  root.id = ID;
  root.className = "dialog";
  root.innerHTML = /* html */ `
    <style>
      #${ID} { max-width: calc(100vw - 4em); }
      #${ID} .ramp-settings { display:flex; width:100%; gap:.7em; align-items:center; flex-wrap:wrap; margin:.6em 0; }
      #${ID} .ramp-settings input[type=text] { flex:1; min-width:8em; }
      #${ID} img { display:block; width:100%; height:210px; object-fit:contain; border-radius:6px; }
      #${ID} .ramp-axis { display:flex; width:100%; justify-content:space-between; font-size:.9em; opacity:.8; margin:.5em 0; }
      #${ID} .ramp-track { position:relative; width:calc(100% - 20px); height:30px; margin:0 10px 28px; border-radius:5px; touch-action:none; }
      #${ID} .ramp-stop { position:absolute; top:25px; width:18px; height:23px; padding:0; transform:translateX(-50%); border:2px solid var(--ui-text,white); border-radius:4px; touch-action:none; cursor:ew-resize; }
      #${ID} .ramp-stop[aria-pressed=true] { outline:2px solid currentColor; outline-offset:3px; z-index:1; }
      #${ID} input[type=number] { width:6em; }
      #${ID} input[type=color] { width:3em; }
      #${ID} .ramp-help { font-size:.9em; opacity:.8; margin:.5em 0; }
    </style>
    <div class="ramp-settings">
      <label for="rampName">Name:</label><input id="rampName" type="text" maxlength="80" placeholder="Custom palette" />
      <label for="rampInterpolation">Interpolation:</label><select id="rampInterpolation">
        <option value="linear">Linear</option><option value="smooth">Smooth</option><option value="constant">Constant</option>
      </select>
    </div>
    <img id="rampPreview" alt="Color palette preview" />
    <div class="ramp-axis"><span>${ocean ? "Shallow water" : "High altitude"}</span><span>${ocean ? "Deep water" : "Low altitude"}</span></div>
    <div id="rampTrack" class="ramp-track"></div>
    <div class="ramp-settings">
      <button id="rampAddStop" data-tip="Add color stop">+</button>
      <button id="rampRemoveStop" class="icon-trash" data-tip="Remove color stop"></button>
      <label for="rampPosition">Position:</label><input id="rampPosition" type="number" min="0" max="1" step="0.001" />
      <label for="rampColor">Color:</label><input id="rampColor" type="color" />
      <button id="rampReverse">Reverse</button>
    </div>
    <p class="ramp-help">Drag stops to control transitions. Double-click the gradient to add a stop. Arrow keys move the selected stop.</p>`;
  document.body.append(root);
  const track = ensureEl("rampTrack");
  const position = ensureEl<HTMLInputElement>("rampPosition");
  const colorInput = ensureEl<HTMLInputElement>("rampColor");
  const interpolation = ensureEl<HTMLSelectElement>("rampInterpolation");
  const name = ensureEl<HTMLInputElement>("rampName");
  name.value = ramp.name;
  interpolation.value = ramp.interpolation;

  function refresh(): void {
    const scheme = interpolateColorRamp(ramp);
    track.style.background = `linear-gradient(to right, ${Array.from({ length: 101 }, (_, i) => `${scheme(i / 100)} ${i}%`).join(",")})`;
    for (const [index, stop] of ramp.stops.entries()) {
      const handle = track.children[index] as HTMLButtonElement;
      handle.style.left = `${stop.position * 100}%`;
      handle.style.backgroundColor = stop.color;
      handle.setAttribute("aria-pressed", String(stop === selected));
    }
    position.value = String(selected.position);
    colorInput.value = selected.color;
    ensureEl<HTMLButtonElement>("rampRemoveStop").disabled = ramp.stops.length <= 2;
    ensureEl<HTMLButtonElement>("rampAddStop").disabled = ramp.stops.length >= 32;
    cancelAnimationFrame(previewFrame);
    previewFrame = requestAnimationFrame(() => {
      if (!grid.cells?.h?.length) return;
      ensureEl<HTMLImageElement>("rampPreview").src = drawHeights({
        heights: grid.cells.h,
        width: grid.cellsX,
        height: grid.cellsY,
        scheme,
        renderOcean: ocean,
        oceanOnly: ocean
      });
    });
  }

  function move(stop: ColorStop, value: number): void {
    if (!Number.isFinite(value)) return;
    selected = stop;
    stop.position = Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
    refresh();
  }

  function renderHandles(): void {
    track.replaceChildren(
      ...ramp.stops.map((stop, index) => {
        const handle = document.createElement("button");
        handle.className = "ramp-stop";
        handle.setAttribute("aria-label", `Color stop ${index + 1}`);
        handle.onpointerdown = event => {
          if (event.button !== 0) return;
          selected = stop;
          handle.setPointerCapture(event.pointerId);
          refresh();
          event.preventDefault();
        };
        handle.onpointermove = event => {
          if (!handle.hasPointerCapture(event.pointerId)) return;
          const bounds = track.getBoundingClientRect();
          move(stop, (event.clientX - bounds.left) / bounds.width);
        };
        handle.onpointerup = event => {
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        };
        handle.onclick = () => {
          selected = stop;
          refresh();
        };
        handle.onkeydown = event => {
          if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
          event.preventDefault();
          event.stopPropagation();
          move(stop, stop.position + (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 0.01 : 0.001));
        };
        return handle;
      })
    );
    refresh();
  }

  function add(position: number): void {
    if (ramp.stops.length >= 32) return;
    selected = { position, color: color(interpolateColorRamp(ramp)(position))!.formatHex() };
    ramp.stops.push(selected);
    renderHandles();
  }
  track.ondblclick = event => {
    if (event.target !== track) return;
    const bounds = track.getBoundingClientRect();
    add(Math.round(Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) * 1000) / 1000);
  };
  position.oninput = () => {
    if (position.value !== "") move(selected, +position.value);
  };
  colorInput.oninput = () => {
    selected.color = colorInput.value;
    refresh();
  };
  interpolation.onchange = () => {
    ramp.interpolation = interpolation.value as typeof ramp.interpolation;
    refresh();
  };
  ensureEl("rampAddStop").onclick = () => {
    const next = [...ramp.stops]
      .sort((a, b) => a.position - b.position)
      .find(stop => stop.position > selected.position);
    add((selected.position + (next?.position ?? 1)) / 2);
  };
  ensureEl("rampRemoveStop").onclick = () => {
    if (ramp.stops.length <= 2) return;
    ramp.stops.splice(ramp.stops.indexOf(selected), 1);
    selected = ramp.stops[0];
    renderHandles();
  };
  ensureEl("rampReverse").onclick = () => {
    for (const stop of ramp.stops) stop.position = 1 - stop.position;
    renderHandles();
  };
  renderHandles();
  $(root).dialog({
    title: edit ? "Edit color palette" : "Create color palette",
    width: "36em",
    resizable: false,
    position: { my: "center", at: "center", of: "svg" },
    buttons: {
      [edit ? "Apply" : "Create"]: () => {
        ramp.name = name.value.trim();
        const encoded = encodeColorRamp(ramp);
        if (edit) {
          for (const options of [styles.heightmap.landHeights.options, styles.heightmap.oceanHeights.options]) {
            if (options.scheme === source) options.scheme = encoded;
          }
          removeHeightmapScheme(source);
        } else options.scheme = encoded;
        addHeightmapScheme(encoded);
        Layers.draw("heightmap", "oceanDepths");
        $(root).dialog("close");
      },
      Cancel: () => $(root).dialog("close")
    },
    close: () => {
      cancelAnimationFrame(previewFrame);
      destroyDialog(ID);
    }
  });
}
