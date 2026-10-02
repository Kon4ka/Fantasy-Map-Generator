import { translate } from "@/services/localization";
import { downloadFile, ensureEl } from "@/utils";
import { MapFileSession, type WritableMapFile } from "./map-file-session";

const fileTypes = [{ description: "Fantasy Map", accept: { "application/octet-stream": [".map", ".gz"] } }];
const handles = new WeakMap<File, WritableMapFile>();

function askName(name: string): Promise<string | null> {
  return new Promise(resolve => {
    ensureEl("alertMessage").innerHTML = /* html */ `<label for="mapSaveName">File name</label>
      <input id="mapSaveName" type="text" style="width:100%; margin:0.6em 0" translate="no" />
      <p>A new copy will be created. Further saves will update this copy.</p>`;
    const input = ensureEl<HTMLInputElement>("mapSaveName");
    input.value = `${name.replace(/\.(map|gz)$/i, "")} - copy.map`;
    let chosen: string | null = null;
    const confirm = () => {
      const value = input.value.trim();
      if (!value || /[<>:"/\\|?*]/.test(value) || Array.from(value).some(char => char.charCodeAt(0) < 32)) {
        input.setCustomValidity(translate("Enter a valid file name"));
        input.reportValidity();
        return;
      }
      chosen = /\.map$/i.test(value) ? value : `${value}.map`;
      $("#alert").dialog("close");
    };
    input.addEventListener("input", () => input.setCustomValidity(""));
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        confirm();
      }
    });
    $("#alert").dialog({
      title: "Save as…",
      width: "28em",
      resizable: false,
      buttons: [
        { text: "Save", click: confirm },
        { text: "Cancel", click: () => $("#alert").dialog("close") }
      ],
      open: () => {
        input.focus();
        input.select();
      },
      close: () => resolve(chosen)
    });
  });
}

export const MapFiles = new MapFileSession({
  bridge: window.kontarFiles,
  pickSave: window.showSaveFilePicker
    ? name => window.showSaveFilePicker!({ suggestedName: name, types: fileTypes })
    : undefined,
  askName,
  download: (data, name) => downloadFile(data, name)
});

export async function pickWritableMap(): Promise<File | null> {
  try {
    const [handle] = await window.showOpenFilePicker!({ multiple: false, types: fileTypes });
    const file = await handle.getFile();
    handles.set(file, handle);
    return file;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }
}

export const associateMapFile = (file: File): Promise<void> => MapFiles.associate(file, handles.get(file));
