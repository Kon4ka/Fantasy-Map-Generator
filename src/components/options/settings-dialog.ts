// Floating window with the rarely used settings: map generation, interface and About. The map stays usable under it
import { ensureEl } from "@/utils/nodeUtils";

export type SettingsSection = "map" | "interface" | "about";

const dialog = () => ensureEl("settingsDialog");
let returnFocus: HTMLElement | null = null;
let initialized = false;

function open(section: SettingsSection = "map"): void {
  if (!initialized) initialize();
  returnFocus = document.activeElement as HTMLElement | null;
  dialog().hidden = false;
  select(section);
  ensureEl("settingsClose").focus();
}

function close(): void {
  dialog().hidden = true;
  returnFocus?.focus();
  returnFocus = null;
}

function select(section: SettingsSection): void {
  for (const page of dialog().querySelectorAll<HTMLElement>("[data-settings-section]")) {
    page.hidden = page.dataset.settingsSection !== section;
  }
  for (const button of dialog().querySelectorAll<HTMLElement>("[data-settings-nav]")) {
    button.classList.toggle("active", button.dataset.settingsNav === section);
  }
}

function initialize(): void {
  initialized = true;
  const root = dialog();
  $(root).find(".settings-window").draggable({ handle: ".settings-header", cancel: "button", containment: "window" });
  root.addEventListener("click", event => {
    const target = event.target as HTMLElement;
    if (target.closest("#settingsClose")) return close();
    const nav = target.closest<HTMLElement>("[data-settings-nav]");
    if (nav) select(nav.dataset.settingsNav as SettingsSection);
  });
  // Esc closes the window only, not the panel or dialogs behind it
  root.addEventListener("keydown", event => {
    if (event.key !== "Escape") return;
    event.stopPropagation();
    close();
  });
  root.addEventListener("keyup", event => {
    if (event.key === "Escape") event.stopPropagation();
  });
}

export const SettingsDialog = { open, close };
