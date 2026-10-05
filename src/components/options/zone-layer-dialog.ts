// Settings of one user layer (or a new one): name, look, and a way into its zones
import { closeDialogs, confirmationDialog, destroyDialog } from "@/components/dialog/dialog-helpers";
import { tip } from "@/components/tooltips";
import { DEFAULT_ZONE_LAYER, ZoneLayers } from "@/components/zone-layers";
import { zonesFilter } from "@/renderers/draw-zones";
import { ensureEl } from "@/utils/nodeUtils";

const DIALOG_ID = "zoneLayerDialog";

/** Open for an existing layer, or with no name to create one */
function open(name?: string): void {
  closeDialogs(`#${DIALOG_ID}`);
  destroyDialog(DIALOG_ID);
  const style = (name && ZoneLayers.get(name)) || DEFAULT_ZONE_LAYER;
  const isNew = !name;
  ensureEl("dialogs").insertAdjacentHTML("beforeend", render(name ?? "", style, isNew));

  let current = name;
  const field = <T extends HTMLElement>(key: string) => ensureEl<T>(`${DIALOG_ID}_${key}`);
  const read = () => ({
    opacity: Number(field<HTMLInputElement>("opacity").value),
    blur: Number(field<HTMLInputElement>("blur").value),
    stroke: field<HTMLInputElement>("stroke").checked
  });
  const apply = () => {
    if (current) ZoneLayers.update(current, read());
  };
  for (const key of ["opacity", "blur", "stroke"]) field(key).addEventListener("input", apply);
  field<HTMLInputElement>("name").addEventListener("change", event => {
    if (!current) return;
    try {
      current = ZoneLayers.rename(current, (event.target as HTMLInputElement).value);
    } catch (error) {
      tip((error as Error).message, false, "error");
      (event.target as HTMLInputElement).value = current;
    }
  });

  const close = () => $(`#${DIALOG_ID}`).dialog("close");
  /** The brush over the zones of this layer; an empty zone is added to paint if the layer has none */
  const editZones = async (paint: boolean) => {
    if (!current) return;
    const layer = current;
    let target = pack.zones.find(zone => zone.type === layer && !zone.cells.length);
    if (paint && !target) {
      const id = pack.zones.length ? Math.max(...pack.zones.map(zone => zone.i)) + 1 : 0;
      target = { i: id, name: layer, type: layer, color: `url(#hatch${id % 42})`, cells: [] };
      pack.zones.push(target);
    }
    zonesFilter.type = layer;
    close();
    if (paint) await Controllers.ZonesEditor.paint(target?.i ?? pack.zones.find(zone => zone.type === layer)?.i, false);
    else await Controllers.ZonesEditor.open();
  };

  const buttons: Record<string, () => void> = isNew
    ? {
        Create: () => {
          try {
            current = ZoneLayers.create(field<HTMLInputElement>("name").value, read());
            void editZones(true);
          } catch (error) {
            tip((error as Error).message, false, "error");
          }
        },
        Cancel: close
      }
    : {
        Paint: () => void editZones(true),
        "Zones list": () => void editZones(false),
        Delete: () =>
          confirmationDialog({
            title: "Delete layer",
            message: `Remove the layer "${current}"? Its ${ZoneLayers.countZones(current!)} zones stay on the map as ordinary zones.`,
            confirm: "Delete",
            onConfirm: () => {
              ZoneLayers.remove(current!);
              close();
            }
          })
      };

  $(`#${DIALOG_ID}`).dialog({
    title: isNew ? "New layer" : "Layer settings",
    resizable: false,
    width: "22em",
    position: { my: "left top", at: "left+10 top+10", of: "svg" },
    buttons,
    close: () => destroyDialog(DIALOG_ID)
  });
}

function render(name: string, style: typeof DEFAULT_ZONE_LAYER, isNew: boolean): string {
  const escaped = name.replace(/"/g, "&quot;");
  return /* html */ `
    <div id="${DIALOG_ID}" class="dialog" style="display: none">
      <table style="width: 100%">
        <tr data-tip="Layer name; renaming also renames the type of its zones">
          <td>Name</td>
          <td><input id="${DIALOG_ID}_name" value="${escaped}" maxlength="60" style="width: 100%" ${isNew ? "autofocus" : ""} /></td>
        </tr>
        <tr data-tip="Layer opacity, on top of the Zones layer opacity">
          <td>Opacity</td>
          <td><input id="${DIALOG_ID}_opacity" type="range" min="0" max="1" step="0.05" value="${style.opacity}" style="width: 100%" /></td>
        </tr>
        <tr data-tip="Soft edges: good for fog, haze or magic">
          <td>Edge blur</td>
          <td><input id="${DIALOG_ID}_blur" type="range" min="0" max="20" step="0.5" value="${style.blur}" style="width: 100%" /></td>
        </tr>
        <tr data-tip="Draw the zone outlines">
          <td>Outline</td>
          <td><input id="${DIALOG_ID}_stroke" type="checkbox" ${style.stroke ? "checked" : ""} /></td>
        </tr>
      </table>
      ${isNew ? "" : `<p style="margin: .5em 0 0">Zones: ${ZoneLayers.countZones(name)}</p>`}
    </div>`;
}

export const ZoneLayerDialog = { open };
