import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS, deriveEnclosureDimensions } from "../domain/enclosure";
import { createPanelSvg } from "./panelSvg";

describe("panel SVG exporter", () => {
  it("writes exact millimeter dimensions and a closed cut path", () => {
    const dimensions = deriveEnclosureDimensions(DEFAULT_PARAMETERS);
    const svg = createPanelSvg(DEFAULT_PARAMETERS);
    const width = Number(svg.match(/width="([\d.]+)mm"/)?.[1]);
    const height = Number(svg.match(/height="([\d.]+)mm"/)?.[1]);

    expect(width).toBeCloseTo(dimensions.panelLength, 3);
    expect(height).toBeCloseTo(dimensions.panelWidth, 3);
    expect(svg).toContain("<path");
    expect(svg.match(/<circle /g)).toHaveLength(4);
    expect(svg).toContain(" Z\"");
    expect(svg).toContain("透明亚克力板");
  });

  it("rejects export when the panel is disabled", () => {
    expect(() =>
      createPanelSvg({ ...DEFAULT_PARAMETERS, panelEnabled: false }),
    ).toThrow("未启用独立面板");
  });
});
