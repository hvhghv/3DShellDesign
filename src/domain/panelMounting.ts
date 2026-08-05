export const PANEL_MAGNET_RADIUS = 2.15;
export const PANEL_MAGNET_DEPTH = 1.2;
export const PANEL_MOUNTING_POCKET_FLOOR = 0.4;

export const PANEL_SCREW_BRIDGE_WIDTH = 5.2;
export const PANEL_SCREW_BRIDGE_OVERLAP = 1.2;

export const PANEL_SNAP_SOCKET_RADIUS = 2.1;
export const PANEL_SNAP_POST_RADIUS = 1.65;
export const PANEL_SNAP_LIP_RADIUS = 2.05;
export const PANEL_SNAP_POST_DEPTH = 2.4;
export const PANEL_SNAP_LIP_DEPTH = 0.6;

export function getPanelMagnetPocketDepth(thickness: number): number {
  return Math.max(
    0.1,
    Math.min(PANEL_MAGNET_DEPTH, thickness - PANEL_MOUNTING_POCKET_FLOOR),
  );
}

export interface PanelScrewMountingTab {
  centerU: number;
  centerV: number;
  width: number;
  height: number;
}

export function getPanelScrewMountingTab(
  panel: { width: number; height: number; borderWidth: number },
  pointU: number,
  pointV: number,
  bossRadius: number,
): PanelScrewMountingTab {
  const openingHalfWidth = Math.max(1, panel.width / 2 - panel.borderWidth);
  const openingHalfHeight = Math.max(1, panel.height / 2 - panel.borderWidth);
  const gapU = openingHalfWidth - Math.abs(pointU);
  const gapV = openingHalfHeight - Math.abs(pointV);

  if (gapU <= gapV) {
    const direction = pointU < 0 ? -1 : 1;
    const inner = pointU - direction * bossRadius * 0.5;
    const outer =
      direction *
      Math.max(
        Math.abs(pointU) + bossRadius * 0.5,
        openingHalfWidth + PANEL_SCREW_BRIDGE_OVERLAP,
      );
    return {
      centerU: (inner + outer) / 2,
      centerV: pointV,
      width: Math.abs(outer - inner),
      height: PANEL_SCREW_BRIDGE_WIDTH,
    };
  }

  const direction = pointV < 0 ? -1 : 1;
  const inner = pointV - direction * bossRadius * 0.5;
  const outer =
    direction *
    Math.max(
      Math.abs(pointV) + bossRadius * 0.5,
      openingHalfHeight + PANEL_SCREW_BRIDGE_OVERLAP,
    );
  return {
    centerU: pointU,
    centerV: (inner + outer) / 2,
    width: PANEL_SCREW_BRIDGE_WIDTH,
    height: Math.abs(outer - inner),
  };
}
