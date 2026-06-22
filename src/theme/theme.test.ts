import { describe, it, expect } from "vitest";
import { resolveTheme, THEME_KEY } from "./theme";

describe("resolveTheme", () => {
  it("returns light when choice is light, regardless of system preference", () => {
    expect(resolveTheme("light", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("returns dark when choice is dark, regardless of system preference", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
  });

  it("follows the system flag when choice is system", () => {
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
  });
});

describe("THEME_KEY", () => {
  it("is the agreed localStorage key", () => {
    expect(THEME_KEY).toBe("reconcile.theme");
  });
});
