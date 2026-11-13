import { afterEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppProvider } from "./AppContext";
import { emptyState } from "./storage";

afterEach(() => vi.unstubAllGlobals());

it("shows a warning and disables editing without overwriting corrupt saved data", () => {
  const raw = '{"groups":[{"id":"fictional","people":[],"expenses":[null]}],"schemaVersion":1}';
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => raw, setItem });
  const html = renderToStaticMarkup(<AppProvider><button>Edit</button></AppProvider>);
  expect(html).toContain('role="alert"');
  expect(html).toContain("original has been preserved");
  expect(html).toContain('disabled=""');
  expect(setItem).not.toHaveBeenCalled();
});

it("leaves supported records editable and performs no mount-time write", () => {
  const setItem = vi.fn();
  vi.stubGlobal("localStorage", { getItem: () => JSON.stringify(emptyState()), setItem });
  const html = renderToStaticMarkup(<AppProvider><button>Edit</button></AppProvider>);
  expect(html).not.toContain('role="alert"');
  expect(html).not.toContain('disabled=""');
  expect(setItem).not.toHaveBeenCalled();
});
