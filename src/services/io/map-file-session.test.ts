import { describe, expect, it, vi } from "vitest";
import { type MapFileBridge, MapFileSession } from "./map-file-session";

const target = { id: "current", name: "world.map" };
function setup() {
  const bridge: MapFileBridge = {
    associate: vi.fn(async () => target),
    save: vi.fn(async id => ({ id, name: id === "copy" ? "renamed.map" : "world.map" })),
    saveAs: vi.fn(async name => ({ id: "copy", name }))
  };
  const askName = vi.fn(async () => "renamed.map" as string | null);
  const session = new MapFileSession({ bridge, askName, download: vi.fn() });
  return { session, bridge, askName };
}

describe("map file session", () => {
  it("overwrites the associated file without asking for a new name", async () => {
    const { session, bridge, askName } = setup();
    await session.associate(new File(["original"], "world.map"));
    await session.save("edited", "new.map");
    expect(bridge.save).toHaveBeenCalledWith("current", "edited");
    expect(bridge.saveAs).not.toHaveBeenCalled();
    expect(askName).not.toHaveBeenCalled();
  });

  it("Save as creates a named copy and later saves update that copy", async () => {
    const { session, bridge } = setup();
    await session.associate(new File(["original"], "world.map"));
    await session.save("copy data", "new.map", true);
    expect(bridge.saveAs).toHaveBeenCalledWith("renamed.map", "copy data");
    await session.save("copy edited", "new.map");
    expect(bridge.save).toHaveBeenCalledWith("copy", "copy edited");
    expect(session.name).toBe("renamed.map");
  });

  it("cancelling Save as keeps the original target", async () => {
    const { session, bridge, askName } = setup();
    await session.associate(new File(["original"], "world.map"));
    askName.mockResolvedValue(null);
    expect(await session.save("edited", "new.map", true)).toBeNull();
    expect(bridge.saveAs).not.toHaveBeenCalled();
    await session.save("edited", "new.map");
    expect(bridge.save).toHaveBeenCalledWith("current", "edited");
  });

  it("a newly generated map cannot overwrite the previously opened map", async () => {
    const { session, bridge } = setup();
    await session.associate(new File(["original"], "world.map"));
    session.clear();
    await session.save("new world", "new.map");
    expect(bridge.save).not.toHaveBeenCalled();
    expect(bridge.saveAs).toHaveBeenCalledWith("renamed.map", "new world");
  });

  it("a delayed association cannot restore an old target after a new map", async () => {
    const { session, bridge } = setup();
    let resolve!: (value: typeof target) => void;
    vi.mocked(bridge.associate).mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        })
    );
    const pending = session.associate(new File(["original"], "world.map"));
    await vi.waitFor(() => expect(resolve).toBeTypeOf("function"));
    session.clear();
    resolve(target);
    await pending;
    await session.save("new world", "new.map");
    expect(bridge.save).not.toHaveBeenCalled();
  });

  it("native file handles save directly; a cancelled picker preserves the handle", async () => {
    const write = vi.fn<(data: Blob) => Promise<void>>(async () => {});
    const close = vi.fn(async () => {});
    const handle = { name: "local.map", getFile: vi.fn(), createWritable: vi.fn(async () => ({ write, close })) };
    const pickSave = vi.fn(async () => {
      throw new DOMException("Cancelled", "AbortError");
    });
    const session = new MapFileSession({ pickSave, askName: vi.fn(), download: vi.fn() });
    await session.associate(new File(["original"], "local.map"), handle);
    await session.save("edited", "new.map");
    expect(await write.mock.calls[0][0].text()).toBe("edited");
    expect(close).toHaveBeenCalledOnce();
    await expect(session.save("other", "new.map", true)).rejects.toMatchObject({ name: "AbortError" });
    expect(session.name).toBe("local.map");
    await session.save("final", "new.map");
    expect(write).toHaveBeenCalledTimes(2);
  });
});
