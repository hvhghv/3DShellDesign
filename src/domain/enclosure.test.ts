import { describe, expect, it } from "vitest";
import {
  DEFAULT_PARAMETERS,
  deriveEnclosureDimensions,
  validateDesign,
} from "./enclosure";

describe("enclosure domain", () => {
  it("derives enclosure dimensions from PCB and clearance", () => {
    const dimensions = deriveEnclosureDimensions(DEFAULT_PARAMETERS);

    expect(dimensions.insideLength).toBe(104);
    expect(dimensions.insideWidth).toBe(74);
    expect(dimensions.outsideLength).toBe(108);
    expect(dimensions.outsideWidth).toBe(78);
    expect(dimensions.totalHeight).toBe(26);
  });

  it("reports a material wall thickness violation", () => {
    const issues = validateDesign({
      ...DEFAULT_PARAMETERS,
      shellMaterialId: "pc",
      wallThickness: 1,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "wall-too-thin", level: "error" }),
      ]),
    );
  });

  it("reports unsupported snap fit material", () => {
    const issues = validateDesign({
      ...DEFAULT_PARAMETERS,
      shellMaterialId: "pla",
      closureType: "snap",
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "snap-material", level: "warning" }),
      ]),
    );
  });

  it("accepts the default design", () => {
    const blockingIssues = validateDesign(DEFAULT_PARAMETERS).filter(
      (issue) => issue.level === "error",
    );

    expect(blockingIssues).toHaveLength(0);
  });
});

