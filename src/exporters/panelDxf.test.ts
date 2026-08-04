import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../domain/enclosure";
import { createPanelDxf } from "./panelDxf";

describe("panel DXF exporter", () => {
  it("writes a closed millimeter outline and four fixing holes", () => {
    const dxf = createPanelDxf(DEFAULT_PARAMETERS);
    expect(dxf).toContain("$INSUNITS\r\n70\r\n4");
    expect(dxf).toContain("LWPOLYLINE");
    expect(dxf.match(/\r\nCIRCLE\r\n/g)).toHaveLength(4);
    expect(dxf).toContain("\r\n70\r\n1\r\n");
  });

  it("omits holes for a slide-in panel", () => {
    const dxf = createPanelDxf({
      ...DEFAULT_PARAMETERS,
      panelPlacements: DEFAULT_PARAMETERS.panelPlacements.map((panel) => ({
        ...panel,
        mountingType: "slide",
      })),
    });
    expect(dxf).not.toContain("\r\nCIRCLE\r\n");
  });

  it("includes circular and rounded connector cutouts mounted to the panel", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    const dxf = createPanelDxf({
      ...DEFAULT_PARAMETERS,
      connectorPlacements: [
        { ...connector, surface: "panel", panelId: "panel-1" },
        {
          ...connector,
          id: "connector-2",
          definitionId: "dc-5521-jack",
          surface: "panel",
          panelId: "panel-1",
          offsetU: 18,
          cutoutWidth: 9,
          cutoutHeight: 9,
        },
      ],
    });

    expect(dxf.match(/\r\nLWPOLYLINE\r\n/g)).toHaveLength(2);
    expect(dxf.match(/\r\nCIRCLE\r\n/g)).toHaveLength(5);
  });
});
