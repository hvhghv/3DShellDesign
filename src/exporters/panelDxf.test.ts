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

  it("writes screw head recesses on a separate pocket layer", () => {
    const dxf = createPanelDxf({
      ...DEFAULT_PARAMETERS,
      panelPlacements: DEFAULT_PARAMETERS.panelPlacements.map((panel) => ({
        ...panel,
        screwHeadRecessEnabled: true,
      })),
    });

    expect(dxf.match(/\r\nCIRCLE\r\n/g)).toHaveLength(8);
    expect(dxf.match(/\r\n8\r\nPOCKET\r\n/g)).toHaveLength(4);
  });

  it("uses non-cut layers for magnets and integrated snap posts", () => {
    const magneticDxf = createPanelDxf({
      ...DEFAULT_PARAMETERS,
      panelPlacements: DEFAULT_PARAMETERS.panelPlacements.map((panel) => ({
        ...panel,
        mountingType: "magnet",
      })),
    });
    expect(magneticDxf.match(/\r\n8\r\nBACK_POCKET\r\n/g)).toHaveLength(4);

    const snapDxf = createPanelDxf({
      ...DEFAULT_PARAMETERS,
      panelPlacements: DEFAULT_PARAMETERS.panelPlacements.map((panel) => ({
        ...panel,
        mountingType: "snap",
      })),
    });
    expect(snapDxf.match(/\r\n8\r\nSNAP_POST\r\n/g)).toHaveLength(4);
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

  it("omits surface-mounted keypad footprints from the CUT layer", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    const dxf = createPanelDxf({
      ...DEFAULT_PARAMETERS,
      connectorPlacements: [
        {
          ...connector,
          definitionId: "membrane-switch-1key",
          surface: "panel",
          panelId: "panel-1",
          cutoutWidth: 20,
          cutoutHeight: 23,
        },
      ],
    });

    expect(dxf.match(/\r\nLWPOLYLINE\r\n/g)).toHaveLength(1);
    expect(dxf.match(/\r\nCIRCLE\r\n/g)).toHaveLength(4);
  });

  it("includes physical antenna cutouts mounted to the panel", () => {
    const dxf = createPanelDxf({
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
      ],
    });

    expect(dxf.match(/\r\nCIRCLE\r\n/g)).toHaveLength(5);
    expect(dxf).toContain("\r\n40\r\n3.4\r\n");
  });
});
