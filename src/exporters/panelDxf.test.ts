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
      panelMountingType: "slide",
    });
    expect(dxf).not.toContain("\r\nCIRCLE\r\n");
  });
});
