import { describe, expect, it } from "vitest";
import {
  applyBatteryPreset,
  createBatteryCompartment,
  getBatteryPreset,
} from "./batteries";

describe("battery compartments", () => {
  it("derives a multi-cell tray from the battery envelope", () => {
    const placement = applyBatteryPreset(
      createBatteryCompartment("battery-1", "aa"),
      "aa",
      3,
    );

    expect(placement.cellCount).toBe(3);
    expect(placement.width).toBeGreaterThan(getBatteryPreset("aa").cellLength);
    expect(placement.depth).toBeGreaterThan(
      getBatteryPreset("aa").cellWidth * 3,
    );
  });

  it("keeps a LiPo tray at one slot", () => {
    const placement = applyBatteryPreset(
      createBatteryCompartment("battery-1", "lipo"),
      "lipo",
      4,
    );

    expect(placement.cellCount).toBe(1);
    expect(placement.preset).toBe("lipo");
  });
});
