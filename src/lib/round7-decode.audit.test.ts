import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "./imageStore";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const photo = (type = "image/png") => new File(["fictional round 7 pixels"], "round7-receipt", { type });

function fallbackRuntime(width = 3200, height = 2400) {
  const control = { width, height, hold: false, fail: false, throwAt: "" };
  const liveURLs = new Set<string>();
  let nextURL = 0;
  const createURL = vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    const url = `blob:fictional-round7-${++nextURL}`;
    liveURLs.add(url);
    return url;
  });
  const revokeURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => { liveURLs.delete(url); });
  const images: FallbackImage[] = [];
  class FallbackImage {
    width = control.width;
    height = control.height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      if (control.throwAt === "constructor") throw new Error("fictional Image constructor failure");
      images.push(this);
    }
    set src(_url: string) {
      if (control.throwAt === "src") throw new Error("fictional Image src failure");
      if (!control.hold) {
        const fail = control.fail;
        queueMicrotask(() => fail ? this.onerror?.() : this.onload?.());
      }
    }
  }
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const encoded = new Blob(["fictional encoded JPEG"], { type: "image/jpeg" });
  const canvas = {
    width: 0, height: 0,
    getContext: vi.fn<() => typeof context | null>(() => context),
    toBlob: vi.fn((callback: (blob: Blob | null) => void, _type: string, _quality: number) => callback(encoded)),
  };
  const createCanvas = vi.fn(() => canvas);
  vi.stubGlobal("createImageBitmap", undefined);
  vi.stubGlobal("ImageBitmap", undefined);
  vi.stubGlobal("Image", FallbackImage);
  vi.stubGlobal("document", { createElement: createCanvas });
  function expectURLsReleased() {
    expect(liveURLs.size).toBe(0);
    expect(revokeURL.mock.calls.map(([url]) => url).sort()).toEqual(
      createURL.mock.results.filter((result) => result.type === "return").map((result) => result.value).sort(),
    );
  }
  return { control, images, createURL, revokeURL, liveURLs, canvas, createCanvas, context, encoded, expectURLsReleased };
}

describe("round 7 fallback decode ownership and recovery", { timeout: 1000 }, () => {
  it.each([false, true])("keeps a pending decoder's URL alive until settlement, failure=%s", async (fail) => {
    const runtime = fallbackRuntime();
    runtime.control.hold = true;
    const file = photo();
    const pending = compressImage(file);
    // Attach rejection handling before releasing the controlled decoder.
    const result = fail ? expect(pending).rejects.toThrow(/decode/) : expect(pending).resolves.toBe(runtime.encoded);
    try {
      expect(runtime.createURL).toHaveBeenCalledExactlyOnceWith(file);
      expect(runtime.liveURLs.size).toBe(1);
      expect(runtime.revokeURL).not.toHaveBeenCalled();
      expect(runtime.createCanvas).not.toHaveBeenCalled();
    } finally {
      if (fail) runtime.images[0].onerror?.();
      else runtime.images[0].onload?.();
      await result;
    }
    runtime.expectURLsReleased();
    expect(runtime.createCanvas).toHaveBeenCalledTimes(fail ? 0 : 1);
  });

  it("isolates two URLs when concurrent fallback decodes finish in reverse order", async () => {
    const runtime = fallbackRuntime();
    runtime.control.hold = true;
    const first = compressImage(photo());
    const second = compressImage(photo());
    const firstResult = expect(first).rejects.toThrow(/decode/);
    const secondResult = expect(second).resolves.toBe(runtime.encoded);
    try {
      runtime.images[1].onload?.();
      await secondResult;
      expect([...runtime.liveURLs]).toEqual(["blob:fictional-round7-1"]);
      expect(runtime.revokeURL.mock.calls).toEqual([["blob:fictional-round7-2"]]);
      expect(runtime.context.drawImage).toHaveBeenCalledExactlyOnceWith(runtime.images[1], 0, 0, 1600, 1200);
    } finally {
      runtime.images[0].onerror?.();
      await firstResult;
    }
    runtime.expectURLsReleased();
  });

  it.each(["constructor", "src"])("revokes the allocated URL after a synchronous Image %s exception and permits retry", async (stage) => {
    const runtime = fallbackRuntime();
    runtime.control.throwAt = stage;
    await expect(compressImage(photo())).rejects.toThrow(`fictional Image ${stage} failure`);
    runtime.expectURLsReleased();
    expect(runtime.createCanvas).not.toHaveBeenCalled();
    runtime.control.throwAt = "";
    await expect(compressImage(photo())).resolves.toBe(runtime.encoded);
    runtime.expectURLsReleased();
  });

  it("recovers from failed URL allocation without revoking an unallocated URL", async () => {
    const runtime = fallbackRuntime();
    runtime.createURL.mockImplementationOnce(() => { throw new Error("fictional URL allocation failure"); });
    await expect(compressImage(photo())).rejects.toThrow(/URL allocation/);
    expect(runtime.images).toHaveLength(0);
    expect(runtime.revokeURL).not.toHaveBeenCalled();
    await expect(compressImage(photo())).resolves.toBe(runtime.encoded);
    runtime.expectURLsReleased();
  });

  it.each([
    [0, 100], [100, 0], [8001, 5000], [5000, 8001], [10_000_000, 5],
  ])("refuses fallback raster %i x %i before allocating a canvas", async (width, height) => {
    const runtime = fallbackRuntime(width, height);
    await expect(compressImage(photo())).rejects.toThrow(/dimensions/);
    expect(runtime.createCanvas).not.toHaveBeenCalled();
    runtime.expectURLsReleased();
  });

  it.each([
    [8000, 5000, 1600, 1000],
    [5000, 8000, 1000, 1600],
    [1601, 1, 1600, 1],
    [1, 1601, 1, 1600],
    [3200, 2401, 1600, 1201],
    [1600, 1599, 1600, 1599],
    [1, 1, 1, 1],
  ])("accepts fallback raster %i x %i and draws at %i x %i", async (width, height, targetWidth, targetHeight) => {
    const runtime = fallbackRuntime(width, height);
    await expect(compressImage(photo())).resolves.toBe(runtime.encoded);
    expect([runtime.canvas.width, runtime.canvas.height]).toEqual([targetWidth, targetHeight]);
    expect(runtime.context.drawImage).toHaveBeenCalledExactlyOnceWith(runtime.images[0], 0, 0, targetWidth, targetHeight);
    expect(runtime.canvas.toBlob).toHaveBeenCalledExactlyOnceWith(expect.any(Function), "image/jpeg", 0.8);
    runtime.expectURLsReleased();
  });

  it.each(["image/jpeg", "image/png", "image/webp"])("allows an exact 10 MiB declared %s file through the fallback", async (type) => {
    const runtime = fallbackRuntime(1, 1);
    const file = photo(type);
    // Override metadata only. No large input or pixel allocation is performed.
    Object.defineProperty(file, "size", { value: 10 * 1024 * 1024 });
    await expect(compressImage(file)).resolves.toBe(runtime.encoded);
    expect(runtime.createURL).toHaveBeenCalledExactlyOnceWith(file);
    runtime.expectURLsReleased();
  });

  it("releases the decode URL before a deferred JPEG encoder settles", async () => {
    const runtime = fallbackRuntime();
    let finishEncoding: ((blob: Blob | null) => void) | undefined;
    let markEncodingStarted!: () => void;
    const encodingStarted = new Promise<void>((resolve) => { markEncodingStarted = resolve; });
    runtime.canvas.toBlob.mockImplementationOnce((callback) => {
      finishEncoding = callback;
      markEncodingStarted();
    });
    const pending = compressImage(photo());
    const result = expect(pending).resolves.toBe(runtime.encoded);
    try {
      await encodingStarted;
      expect(finishEncoding).toBeTypeOf("function");
      expect(runtime.context.drawImage).toHaveBeenCalledOnce();
      runtime.expectURLsReleased();
    } finally {
      finishEncoding?.(runtime.encoded);
      await result;
    }
    runtime.expectURLsReleased();
  });

  it("survives repeated decode, canvas and encode failures before a successful retry", async () => {
    const runtime = fallbackRuntime();
    for (let repeat = 0; repeat < 2; repeat++) {
      runtime.control.fail = true;
      await expect(compressImage(photo())).rejects.toThrow(/decode/);
      runtime.control.fail = false;
      runtime.expectURLsReleased();

      runtime.canvas.getContext.mockReturnValueOnce(null);
      await expect(compressImage(photo())).rejects.toThrow(/processed/);
      runtime.expectURLsReleased();

      runtime.canvas.toBlob.mockImplementationOnce((callback) => callback(null));
      await expect(compressImage(photo())).rejects.toThrow(/processed/);
      runtime.expectURLsReleased();

      runtime.canvas.toBlob.mockImplementationOnce(() => { throw new Error("fictional JPEG encoder failure"); });
      await expect(compressImage(photo())).rejects.toThrow(/JPEG encoder/);
      runtime.expectURLsReleased();
    }
    await expect(compressImage(photo("image/webp"))).resolves.toBe(runtime.encoded);
    expect(runtime.images).toHaveLength(9);
    expect(runtime.createCanvas).toHaveBeenCalledTimes(7);
    expect(runtime.context.drawImage).toHaveBeenCalledTimes(5);
    expect(runtime.canvas.toBlob).toHaveBeenCalledTimes(5);
    runtime.expectURLsReleased();
  });

  it.each(["allocation", "context", "fill", "draw"])("releases the fallback URL when canvas %s throws, then recovers", async (stage) => {
    const runtime = fallbackRuntime();
    const fail = () => { throw new Error(`fictional canvas ${stage} failure`); };
    if (stage === "allocation") runtime.createCanvas.mockImplementationOnce(fail);
    if (stage === "context") runtime.canvas.getContext.mockImplementationOnce(fail);
    if (stage === "fill") runtime.context.fillRect.mockImplementationOnce(fail);
    if (stage === "draw") runtime.context.drawImage.mockImplementationOnce(fail);
    await expect(compressImage(photo())).rejects.toThrow(`fictional canvas ${stage} failure`);
    expect(runtime.canvas.toBlob).not.toHaveBeenCalled();
    runtime.expectURLsReleased();
    await expect(compressImage(photo())).resolves.toBe(runtime.encoded);
    runtime.expectURLsReleased();
  });
});
