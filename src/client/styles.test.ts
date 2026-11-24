import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(import.meta.dirname, "styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** What the first rule with this selector declares, one declaration each, spacing aside. */
function declared(selector: string): string[] {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`styles.css has no rule for ${selector}`);
  return css
    .slice(css.indexOf("{", start) + 1, css.indexOf("}", start))
    .split(";")
    .map((d) => d.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

describe("the dark colours", () => {
  // Dark is written twice: once for a device that asks for it, once for a Member who chose it.
  it("are the same whether the device asks for dark or the Member chose it", () => {
    const deviceAsks = declared(':root:not([data-theme="light"])');
    const memberChose = declared(':root[data-theme="dark"]');
    expect(deviceAsks).toContain("color-scheme: dark");
    expect(memberChose).toEqual(deviceAsks);
  });
});
