import { describe, expect, it } from "vitest";
import { looksLikeSvg, svgIsInert } from "@/lib/svg-safe";

const ok = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#39ff14"/></svg>`;

describe("lib/svg-safe", () => {
  it("accepts a plain inert SVG", () => {
    expect(looksLikeSvg(ok)).toBe(true);
    expect(svgIsInert(ok)).toBe(true);
  });
  it.each([
    ["script", ok.replace("</svg>", "<script>alert(1)</script></svg>")],
    ["event handler", ok.replace("<circle", '<circle onload="alert(1)"')],
    ["foreignObject", ok.replace("</svg>", "<foreignObject/></svg>")],
    ["external href", ok.replace("</svg>", '<image href="https://evil.example/x.png"/></svg>')],
    ["entities", `<!DOCTYPE svg [<!ENTITY x "y">]>${ok}`],
    ["css @import", ok.replace("</svg>", "<style>@import url(x)</style></svg>")],
  ])("rejects %s", (_name, svg) => {
    expect(svgIsInert(svg)).toBe(false);
  });
  it("looksLikeSvg is false for non-svg", () => {
    expect(looksLikeSvg("<html></html>")).toBe(false);
  });
});
