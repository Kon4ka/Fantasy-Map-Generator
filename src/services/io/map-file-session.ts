export interface MapFileTarget {
  id: string;
  name: string;
}

export interface MapFileBridge {
  associate(name: string, digest: string): Promise<MapFileTarget | null>;
  save(id: string, data: string): Promise<MapFileTarget>;
  saveAs(name: string, data: string): Promise<MapFileTarget>;
}

export interface WritableMapFile {
  name: string;
  createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }>;
  getFile(): Promise<File>;
}

interface FilePlatform {
  bridge?: MapFileBridge;
  pickSave?: (name: string) => Promise<WritableMapFile>;
  askName: (name: string) => Promise<string | null>;
  download: (data: string, name: string) => void;
}

/** File access is session state, never part of the map. */
export class MapFileSession {
  private target?: MapFileTarget;
  private handle?: WritableMapFile;
  private revision = 0;
  private association: Promise<void> = Promise.resolve();
  name = "";

  constructor(private platform: FilePlatform) {}

  clear(): void {
    this.revision++;
    this.target = undefined;
    this.handle = undefined;
    this.name = "";
    this.association = Promise.resolve();
  }

  /** Keep the file link across an in-place reload of the same map (agent undo); call the result after loading */
  preserve(): () => void {
    const { target, handle, name, association } = this;
    return () => {
      this.revision++;
      Object.assign(this, { target, handle, name, association });
    };
  }

  associate(file: File, handle?: WritableMapFile): Promise<void> {
    this.clear();
    const revision = this.revision;
    this.name = file.name;
    this.handle = handle;
    this.association = (async () => {
      if (!this.platform.bridge || handle) return;
      const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
      const target = await this.platform.bridge.associate(file.name, digest);
      if (revision === this.revision) this.target = target ?? undefined;
    })().catch(error => console.warn("Map file association failed", error));
    return this.association;
  }

  async save(
    data: string,
    suggestedName: string,
    saveAs = false
  ): Promise<{ name: string; downloaded: boolean } | null> {
    const revision = this.revision;
    await this.association;
    if (revision !== this.revision) return null;
    let target = saveAs ? undefined : this.target;
    let handle = saveAs ? undefined : this.handle;
    const name = this.name || suggestedName;

    if (!target && !handle) {
      if (this.platform.bridge) {
        const chosen = await this.platform.askName(name);
        if (!chosen || revision !== this.revision) return null;
        target = await this.platform.bridge.saveAs(chosen, data);
      } else if (this.platform.pickSave) {
        const suggested = saveAs ? `${name.replace(/\.(map|gz)$/i, "")} - copy.map` : name;
        handle = await this.platform.pickSave(suggested);
        if (revision !== this.revision) return null;
      } else {
        const chosen = await this.platform.askName(name);
        if (!chosen || revision !== this.revision) return null;
        this.platform.download(data, chosen);
        return { name: chosen, downloaded: true };
      }
    } else if (target) {
      target = await this.platform.bridge!.save(target.id, data);
    }

    if (handle) {
      let blob = new Blob([data], { type: "text/plain" });
      if (/\.gz$/i.test(handle.name)) {
        blob = await new Response(blob.stream().pipeThrough(new CompressionStream("gzip"))).blob();
      }
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    }
    const savedName = handle?.name ?? target!.name;
    if (revision === this.revision) {
      this.target = target;
      this.handle = handle;
      this.name = savedName;
    }
    return { name: savedName, downloaded: false };
  }
}

declare global {
  interface Window {
    kontarFiles?: MapFileBridge;
    showSaveFilePicker?: (options: {
      suggestedName: string;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<WritableMapFile>;
    showOpenFilePicker?: (options: {
      multiple: boolean;
      types: { description: string; accept: Record<string, string[]> }[];
    }) => Promise<WritableMapFile[]>;
  }
}
