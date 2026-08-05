import { describe, expect, it } from "vitest";
import {
  getPanelMagnetPocketDepth,
  getPanelScrewMountingTab,
  PANEL_MAGNET_DEPTH,
  PANEL_MOUNTING_POCKET_FLOOR,
  PANEL_SCREW_BRIDGE_WIDTH,
} from "./panelMounting";

describe("panel mounting mechanics", () => {
  it("preserves a material floor under a magnetic pocket", () => {
    expect(getPanelMagnetPocketDepth(2)).toBe(PANEL_MAGNET_DEPTH);
    expect(getPanelMagnetPocketDepth(1)).toBeCloseTo(
      1 - PANEL_MOUNTING_POCKET_FLOOR,
    );
  });

  it("joins a flat panel screw tab into the nearest retained border", () => {
    const bridge = getPanelScrewMountingTab(
      { width: 60, height: 40, borderWidth: 2 },
      25,
      15,
      4,
    );

    expect(bridge.centerU).toBeGreaterThan(25);
    expect(bridge.centerV).toBe(15);
    expect(bridge.height).toBe(PANEL_SCREW_BRIDGE_WIDTH);
    expect(bridge.centerU + bridge.width / 2).toBeGreaterThan(28);
    expect(bridge.centerU - bridge.width / 2).toBeLessThan(25);
  });

  it("uses a vertical tab bridge when that border is closer", () => {
    const bridge = getPanelScrewMountingTab(
      { width: 80, height: 40, borderWidth: 2 },
      20,
      -15,
      4,
    );

    expect(bridge.centerU).toBe(20);
    expect(bridge.centerV).toBeLessThan(-15);
    expect(bridge.width).toBe(PANEL_SCREW_BRIDGE_WIDTH);
    expect(bridge.height).toBeGreaterThanOrEqual(PANEL_SCREW_BRIDGE_WIDTH);
  });
});
