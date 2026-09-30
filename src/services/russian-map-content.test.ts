import { describe, expect, it, vi } from "vitest";

vi.stubGlobal("location", { search: "" });
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
vi.stubGlobal("window", globalThis);

const { localizeGeneratedName, transliterateToRussian } = await import("./russian-map-content");

describe("Russian map content localization", () => {
  it("transliterates generated proper names", () => {
    expect(transliterateToRussian("Southland")).toBe("Соутланд");
    expect(transliterateToRussian("Clitford")).toBe("Клитфорд");
  });

  it("translates generated zone templates and transliterates their subject", () => {
    expect(localizeGeneratedName("Traisisian Invasion")).toBe("Вторжение: Трайсисиан");
    expect(localizeGeneratedName("Koldalgud Fault")).toBe("Разлом: Колдалгуд");
  });

  it("translates generated religion templates", () => {
    expect(localizeGeneratedName("Treham Coven")).toBe("Ковен Трехам");
    expect(localizeGeneratedName("Elladan Forefathers")).toBe("Праотцы Елладан");
  });
});
