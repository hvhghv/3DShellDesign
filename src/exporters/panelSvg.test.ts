import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../domain/enclosure";
import { createPanelSvg } from "./panelSvg";

describe("panel SVG exporter", () => {
  it("writes exact millimeter dimensions and a closed cut path", () => {
    const panel = DEFAULT_PARAMETERS.panelPlacements[0];
    const svg = createPanelSvg(DEFAULT_PARAMETERS);
    const width = Number(svg.match(/width="([\d.]+)mm"/)?.[1]);
    const height = Number(svg.match(/height="([\d.]+)mm"/)?.[1]);

    expect(width).toBeCloseTo(panel.width, 3);
    expect(height).toBeCloseTo(panel.height, 3);
    expect(svg).toContain("<path");
    expect(svg.match(/<circle /g)).toHaveLength(4);
    expect(svg).toContain(" Z\"");
    expect(svg).toContain("透明亚克力板");
  });

  it("rejects export when the panel is disabled", () => {
    expect(() =>
      createPanelSvg({ ...DEFAULT_PARAMETERS, panelPlacements: [] }),
    ).toThrow("没有可导出的面板");
  });

  it("includes connector cutouts mounted to the panel", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    const svg = createPanelSvg({
      ...DEFAULT_PARAMETERS,
      connectorPlacements: [
        { ...connector, surface: "panel", panelId: "panel-1", rotation: 90 },
        {
          ...connector,
          id: "connector-2",
          definitionId: "dc-5521-jack",
          surface: "panel",
          panelId: "panel-1",
          offsetU: 18,
          offsetV: 0,
          cutoutWidth: 9,
          cutoutHeight: 9,
        },
      ],
    });

    expect(svg.match(/<rect /g)).toHaveLength(1);
    expect(svg.match(/<circle /g)).toHaveLength(5);
    expect(svg).toContain('width="7" height="12"');
  });

  it("includes only physical antenna cutouts mounted to the panel", () => {
    const svg = createPanelSvg({
      ...DEFAULT_PARAMETERS,
      antennaPlacements: [
        {
          id: "antenna-1",
          definitionId: "sma-bulkhead-whip",
          surface: "panel",
          panelId: "panel-1",
          offsetU: 10,
          offsetV: -4,
          rotation: 0,
          cutoutDiameter: 6.8,
        },
        {
          id: "antenna-2",
          definitionId: "adhesive-fpc-antenna",
          surface: "panel",
          panelId: "panel-1",
          offsetU: -10,
          offsetV: 4,
          rotation: 0,
          cutoutDiameter: 0,
        },
      ],
    });

    expect(svg.match(/<circle /g)).toHaveLength(5);
    expect(svg).toContain('r="3.4"');
  });

  it("exports only the connectors bound to the requested panel instance", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    const parameters = {
      ...DEFAULT_PARAMETERS,
      panelPlacements: [
        DEFAULT_PARAMETERS.panelPlacements[0],
        {
          ...DEFAULT_PARAMETERS.panelPlacements[0],
          id: "panel-2",
          face: "front" as const,
        },
      ],
      connectorPlacements: [
        { ...connector, surface: "panel" as const, panelId: "panel-1" },
        {
          ...connector,
          id: "connector-2",
          definitionId: "dc-5521-jack",
          surface: "panel" as const,
          panelId: "panel-2",
          cutoutWidth: 9,
          cutoutHeight: 9,
        },
      ],
    };

    expect(createPanelSvg(parameters, "panel-1").match(/<rect /g)).toHaveLength(1);
    expect(createPanelSvg(parameters, "panel-1").match(/<circle /g)).toHaveLength(4);
    expect(createPanelSvg(parameters, "panel-2").match(/<rect /g)).toBeNull();
    expect(createPanelSvg(parameters, "panel-2").match(/<circle /g)).toHaveLength(5);
  });
});
