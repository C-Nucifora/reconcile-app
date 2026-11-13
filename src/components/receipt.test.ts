import { afterEach, describe, expect, it, vi } from "vitest";
import { compressImage } from "../lib/imageStore";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function photo(type = "image/jpeg"): File {
  return new File(["fictional image bytes"], "fictional-receipt", { type });
}

function imageRuntime(width = 3200, height = 2400) {
  class Bitmap {
    width = width;
    height = height;
    close = vi.fn();
  }
  const bitmap = new Bitmap();
  const decode = vi.fn().mockResolvedValue(bitmap);
  const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
  const encoded = new Blob(["fictional reencoded pixels"], { type: "image/jpeg" });
  const canvas = {
    width: 0, height: 0,
    getContext: vi.fn().mockReturnValue(context),
    toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(encoded)),
  };
  vi.stubGlobal("ImageBitmap", Bitmap);
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal("document", { createElement: vi.fn(() => canvas) });
  return { bitmap, decode, canvas, context, encoded };
}

describe("receipt file boundary", () => {
  it("rejects empty, oversized and unsupported files before decoding", async () => {
    const { decode } = imageRuntime();
    const oversized = photo();
    Object.defineProperty(oversized, "size", { value: 10 * 1024 * 1024 + 1 });
    for (const file of [photo("image/svg+xml"), photo("text/html"), photo("image/gif"), photo(""), new File([], "empty.jpg", { type: "image/jpeg" }), oversized]) {
      await expect(compressImage(file)).rejects.toThrow(/JPEG, PNG or WebP/);
    }
    expect(decode).not.toHaveBeenCalled();
  });

  it("handles corrupt bytes even when their declared type is allowed", async () => {
    const { decode, canvas } = imageRuntime();
    decode.mockRejectedValue(new Error("image decode failed"));
    await expect(compressImage(photo())).rejects.toThrow("image decode failed");
    expect(canvas.getContext).not.toHaveBeenCalled();
  });

  it("rejects excessive decoded dimensions and releases the bitmap", async () => {
    const { bitmap, canvas } = imageRuntime(10_000, 10_000);
    await expect(compressImage(photo())).rejects.toThrow(/dimensions/);
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(canvas.getContext).not.toHaveBeenCalled();
  });

  it.each(["image/jpeg", "image/png", "image/webp"])("reencodes %s as a bounded JPEG without copying source bytes", async (type) => {
    const { bitmap, canvas, context, encoded } = imageRuntime();
    expect(await compressImage(photo(type))).toBe(encoded);
    expect([canvas.width, canvas.height]).toEqual([1600, 1200]);
    expect(context.fillStyle).toBe("white");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1600, 1200);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1600, 1200);
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/jpeg", 0.8);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("releases decoded data when canvas allocation or JPEG encoding fails", async () => {
    const { bitmap, canvas } = imageRuntime();
    canvas.getContext.mockReturnValueOnce(null);
    await expect(compressImage(photo())).rejects.toThrow(/processed/);
    canvas.toBlob.mockImplementationOnce((callback) => callback(null));
    await expect(compressImage(photo())).rejects.toThrow(/processed/);
    expect(bitmap.close).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])("revokes the fallback decode URL on failure=%s", async (fail) => {
    const { canvas } = imageRuntime();
    vi.stubGlobal("createImageBitmap", undefined);
    const createURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fictional-decode");
    const revokeURL = vi.spyOn(URL, "revokeObjectURL");
    vi.stubGlobal("Image", class {
      width = 100;
      height = 100;
      onload = () => {};
      onerror = () => {};
      set src(_value: string) { queueMicrotask(() => fail ? this.onerror() : this.onload()); }
    });
    if (fail) {
      await expect(compressImage(photo())).rejects.toThrow(/decode/);
      expect(canvas.getContext).not.toHaveBeenCalled();
    } else {
      await expect(compressImage(photo())).resolves.toBeInstanceOf(Blob);
    }
    expect(createURL).toHaveBeenCalledOnce();
    expect(revokeURL).toHaveBeenCalledWith("blob:fictional-decode");
  });
});
