import { describe, expect, it } from "vitest";
import { ENCLOSURE_TEMPLATES, getEnclosureTemplate } from "./templates";

describe("enclosure templates", () => {
  it("provides four distinct template recipes", () => {
    expect(ENCLOSURE_TEMPLATES).toHaveLength(4);
    expect(new Set(ENCLOSURE_TEMPLATES.map((item) => item.id)).size).toBe(4);
    expect(getEnclosureTemplate("wall-mount").parameterOverrides).toMatchObject({
      closureType: "screw",
    });
    expect(getEnclosureTemplate("wall-mount").parameterOverrides).not.toHaveProperty(
      "panelPlacements",
    );
  });
});
