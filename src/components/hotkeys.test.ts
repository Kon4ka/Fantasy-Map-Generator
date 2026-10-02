// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  openStates: vi.fn(),
  save: vi.fn(),
  saveAs: vi.fn(),
  toggleLayer: vi.fn()
}));
vi.mock("@/components/options/options-panel", () => ({ hideOptions: vi.fn() }));
vi.mock("@/controllers", () => ({
  Controllers: { Omnibar: { open: mocks.open }, StatesEditor: { open: mocks.openStates } }
}));
vi.mock("@/services", () => ({ Services: { Save: { toMachine: mocks.save, toMachineAs: mocks.saveAs } } }));
vi.mock("@/services/autosave", () => ({ toggleSaveReminder: vi.fn() }));
vi.mock("./app-info", () => ({ showInfo: vi.fn() }));
vi.mock("./dialog/dialog-helpers", () => ({ closeDialogs: vi.fn() }));
vi.mock("./options/tabs/layers-tab", () => ({
  getLayerByShortcut: (code: string) => (code === "KeyS" ? "states" : undefined)
}));
vi.mock("./zoom", () => ({ changeMapZoom: vi.fn(), panMap: vi.fn(), setMapZoom: vi.fn() }));

import "./hotkeys";

function press(
  target: Element,
  code: string,
  key = code,
  modifiers: KeyboardEventInit = {}
): { keydown: KeyboardEvent; keyup: KeyboardEvent } {
  const init = { code, key, bubbles: true, cancelable: true, ...modifiers };
  const keydown = new KeyboardEvent("keydown", init);
  const keyup = new KeyboardEvent("keyup", init);
  target.dispatchEvent(keydown);
  target.dispatchEvent(keyup);
  return { keydown, keyup };
}

beforeEach(() => {
  document.body.innerHTML = '<button id="regenerateRivers">Regenerate</button><input id="field" />';
  mocks.open.mockClear();
  mocks.openStates.mockClear();
  mocks.save.mockClear();
  mocks.saveAs.mockClear();
  mocks.toggleLayer.mockClear();
  vi.stubGlobal("Layers", { toggle: mocks.toggleLayer });
  window.dispatchEvent(new Event("blur"));
});

describe("modified S shortcuts", () => {
  it("leaves focused dropdown options to the native select, not map shortcuts", () => {
    const select = document.createElement("select");
    select.innerHTML = '<option tabindex="0">State</option>';
    document.body.append(select);
    const option = select.options[0];
    option.focus();
    expect(document.activeElement).toBe(option);
    press(option, "KeyS", "s");
    press(option, "KeyS", "s", { ctrlKey: true });
    expect(mocks.toggleLayer).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("Ctrl+Shift+S creates a named copy instead of overwriting", () => {
    press(document.body, "KeyS", "S", { ctrlKey: true, shiftKey: true });
    expect(mocks.saveAs).toHaveBeenCalledOnce();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.toggleLayer).not.toHaveBeenCalled();
  });
  it("keeps Ctrl+S as the map save shortcut", () => {
    press(document.body, "KeyS", "s", { ctrlKey: true });
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("leaves Win+Shift+S to the operating system", () => {
    press(document.body, "KeyS", "s", { metaKey: true, shiftKey: true });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.saveAs).not.toHaveBeenCalled();
    expect(mocks.openStates).not.toHaveBeenCalled();
    expect(mocks.toggleLayer).not.toHaveBeenCalled();
  });

  it("ignores the screenshot keyup when Windows has already released the modifiers", () => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyS", key: "S", metaKey: true, shiftKey: true, bubbles: true })
    );
    document.body.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS", key: "s", bubbles: true }));
    expect(mocks.toggleLayer).not.toHaveBeenCalled();
    expect(mocks.openStates).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("ignores keyup without a matching keydown after returning from the screenshot overlay", () => {
    window.dispatchEvent(new Event("blur"));
    document.body.dispatchEvent(new KeyboardEvent("keyup", { code: "KeyS", key: "s", bubbles: true }));
    expect(mocks.toggleLayer).not.toHaveBeenCalled();
  });

  it("still toggles states with plain S and opens their editor with Shift+S", () => {
    press(document.body, "KeyS", "s");
    expect(mocks.toggleLayer).toHaveBeenCalledExactlyOnceWith("states");
    press(document.body, "KeyS", "S", { shiftKey: true });
    expect(mocks.openStates).toHaveBeenCalledOnce();
    expect(mocks.toggleLayer).toHaveBeenCalledOnce();
  });
});

describe("Space opens the search", () => {
  it("from the plain map", () => {
    press(document.body, "Space", " ");
    expect(mocks.open).toHaveBeenCalledTimes(1);
  });

  it("leaves the Space to a focused button, whose activation it is", () => {
    const button = document.getElementById("regenerateRivers")!;
    button.focus();
    const { keydown, keyup } = press(button, "Space", " ");
    expect(keydown.defaultPrevented).toBe(false);
    expect(keyup.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(button);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it.each(["ctrlKey", "metaKey", "altKey", "shiftKey"])("ignores Space held with %s", modifier => {
    press(document.body, "Space", " ", { [modifier]: true });
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("leaves a text field alone", () => {
    const field = document.getElementById("field")!;
    field.focus();
    const { keydown } = press(field, "Space", " ");
    expect(keydown.defaultPrevented).toBe(false);
    expect(mocks.open).not.toHaveBeenCalled();
  });
});
