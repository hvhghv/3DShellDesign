import { describe, expect, it } from "vitest";
import { parseKicadPcb } from "./kicadPcb";

const RECTANGULAR_BOARD = `
(kicad_pcb
  (version 20240108)
  (generator pcbnew)
  (general (thickness 1.2))
  (gr_rect (start 20 30) (end 120 100)
    (stroke (width 0.05) (type default))
    (fill none) (layer "Edge.Cuts"))
  (footprint "MountingHole_3.2mm"
    (layer "F.Cu")
    (at 25 35 90)
    (pad "" np_thru_hole circle (at 2 0) (size 3.2 3.2)
      (drill 3.2) (layers "*.Cu" "*.Mask")))
  (footprint "USB_C_Receptacle"
    (layer "F.Cu")
    (at 110 65)
    (pad "A1" thru_hole circle (at 0 0) (size 1 1)
      (drill 0.6) (layers "*.Cu" "*.Mask")))
)
`;

describe("KiCad PCB importer", () => {
  it("extracts board size, thickness and evidence-based mounting holes", () => {
    const result = parseKicadPcb(RECTANGULAR_BOARD, "controller.kicad_pcb");

    expect(result.sourceName).toBe("controller.kicad_pcb");
    expect(result.version).toBe("20240108");
    expect(result.thickness).toBe(1.2);
    expect(result.bounds).toEqual({ minX: 20, minY: 30, maxX: 120, maxY: 100 });
    expect(result.mountingHoles).toHaveLength(1);
    expect(result.mountingHoles[0]).toMatchObject({ x: 25, y: 37, diameter: 3.2 });
  });

  it("includes cardinal extrema for curved Edge.Cuts arcs", () => {
    const result = parseKicadPcb(
      `(kicad_pcb (version 20240108) (general (thickness 1.6))
        (gr_arc (start 10 0) (mid 0 10) (end -10 0)
          (stroke (width 0.05) (type default)) (layer "Edge.Cuts"))
        (gr_line (start -10 0) (end 10 -5)
          (stroke (width 0.05) (type default)) (layer "Edge.Cuts")))`,
      "rounded.kicad_pcb",
    );

    expect(result.bounds.minX).toBeCloseTo(-10);
    expect(result.bounds.maxX).toBeCloseTo(10);
    expect(result.bounds.minY).toBeCloseTo(-5);
    expect(result.bounds.maxY).toBeCloseTo(10);
  });

  it("rejects files without a usable Edge.Cuts outline", () => {
    expect(() =>
      parseKicadPcb(
        `(kicad_pcb (version 20240108) (general (thickness 1.6)))`,
        "empty.kicad_pcb",
      ),
    ).toThrow("Edge.Cuts");
  });
});

