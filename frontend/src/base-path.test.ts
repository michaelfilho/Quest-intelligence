import { expect, test } from "vitest";
import { normalizeBasePath } from "../../shared/base-path";
test("base raiz e /core/ são normalizadas sem duplicar barras", () => {
  expect(normalizeBasePath()).toBe("/");
  expect(normalizeBasePath("/core")).toBe("/core/");
  expect(normalizeBasePath("/core/")).toBe("/core/");
});
test("base recusa origem externa, dupla barra e injeção em cookie", () => {
  for (const value of ["https://exemplo", "//core/", "/core; Secure", "/core/../", "/core\r\n"]) expect(() => normalizeBasePath(value)).toThrow();
});
