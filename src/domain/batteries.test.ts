import { describe, expect, it } from "vitest";
import {
  applyBatteryPreset,
  BATTERY_TERMINAL_ALLOWANCE,
  createBatteryCompartment,
  getBatteryCompartmentLayout,
  getBatteryMaxRailHeight,
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
    expect(placement.width).toBeGreaterThan(
      getBatteryPreset("aa").cellLength + BATTERY_TERMINAL_ALLOWANCE * 2,
    );
    expect(placement.depth).toBeGreaterThan(
      getBatteryPreset("aa").cellWidth * 3,
    );
  });

  it("keeps cylindrical tray rails below the battery centerline", () => {
    const placement = createBatteryCompartment("battery-1", "aa");
    const preset = getBatteryPreset("aa");
    const layout = getBatteryCompartmentLayout({
      ...placement,
      height: preset.cellHeight,
    });

    expect(placement.height).toBe(getBatteryMaxRailHeight(preset));
    expect(layout.railHeight).toBeLessThan(preset.cellHeight / 2);
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
