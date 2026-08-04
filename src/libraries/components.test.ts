import { describe, expect, it } from "vitest";
import {
  ANTENNA_DEFINITIONS,
  CONNECTOR_DEFINITIONS,
  FASTENER_DEFINITIONS,
  getAntennaDefinition,
  getConnectorDefinition,
  getFastenerDefinition,
} from "./components";

describe("component library", () => {
  it("contains unique, manufacturing-complete connector definitions", () => {
    expect(new Set(CONNECTOR_DEFINITIONS.map((item) => item.id)).size).toBe(
      CONNECTOR_DEFINITIONS.length,
    );
    expect(CONNECTOR_DEFINITIONS.map((item) => item.category)).toEqual(
      expect.arrayContaining(["usb", "power", "network", "terminal", "fpc"]),
    );
    for (const definition of CONNECTOR_DEFINITIONS) {
      expect(definition.panelCutout.width).toBeGreaterThan(0);
      expect(definition.panelCutout.height).toBeGreaterThan(0);
      expect(definition.keepoutVolumes.length).toBeGreaterThan(0);
      expect(definition.metadata.bomName).not.toBe("");
    }
  });

  it("provides screw, heat-set insert and hex nut closure recipes", () => {
    expect(FASTENER_DEFINITIONS.map((item) => item.baseRecess)).toEqual(
      expect.arrayContaining(["pilot", "heat-set", "hex-nut"]),
    );
    expect(getFastenerDefinition("m3-heat-set").recessDepth).toBe(5);
    expect(getConnectorDefinition("dc-5521-jack").panelCutout.shape).toBe("circle");
  });

  it("provides external and internal antenna recipes with RF keepouts", () => {
    expect(new Set(ANTENNA_DEFINITIONS.map((item) => item.id)).size).toBe(
      ANTENNA_DEFINITIONS.length,
    );
    expect(ANTENNA_DEFINITIONS.map((item) => item.placement)).toEqual(
      expect.arrayContaining(["rear-bulkhead", "inner-rear-wall", "pcb-rear-edge"]),
    );
    for (const definition of ANTENNA_DEFINITIONS) {
      expect(definition.keepoutVolume.width).toBeGreaterThan(definition.visualGeometry.width);
      expect(definition.metadata.frequencyBand).not.toBe("");
      expect(definition.metadata.bomName).not.toBe("");
    }
    expect(getAntennaDefinition("sma-bulkhead-whip").enclosureCutout?.diameter).toBe(6.8);
    expect(getAntennaDefinition("pcb-edge-antenna").enclosureCutout).toBeNull();
  });
});
