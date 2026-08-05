import type { DesignerParameters, PanelPlacement } from "./model";

export const SCREW_HEAD_RECESS_FLOOR = 0.4;
export const DEFAULT_SCREW_HEAD_RECESS_DEPTH = 1.2;
export const PANEL_SCREW_HEAD_RECESS_RADIUS = 2.65;

export function getMaxScrewHeadRecessDepth(thickness: number): number {
  return Math.max(0.1, thickness - SCREW_HEAD_RECESS_FLOOR);
}

export function clampScrewHeadRecessDepth(
  thickness: number,
  depth: number,
): number {
  const safeDepth = Number.isFinite(depth)
    ? depth
    : DEFAULT_SCREW_HEAD_RECESS_DEPTH;
  return Math.min(
    getMaxScrewHeadRecessDepth(thickness),
    Math.max(0.1, safeDepth),
  );
}

export function getPanelScrewHeadRecessDepth(
  panel: Pick<
    PanelPlacement,
    "thickness" | "screwHeadRecessEnabled" | "screwHeadRecessDepth"
  >,
): number {
  return panel.screwHeadRecessEnabled
    ? clampScrewHeadRecessDepth(panel.thickness, panel.screwHeadRecessDepth)
    : 0;
}

export function getClosureScrewHeadRecessDepth(
  parameters: Pick<
    DesignerParameters,
    | "lidThickness"
    | "closureScrewHeadRecessEnabled"
    | "closureScrewHeadRecessDepth"
  >,
): number {
  return parameters.closureScrewHeadRecessEnabled
    ? clampScrewHeadRecessDepth(
        parameters.lidThickness,
        parameters.closureScrewHeadRecessDepth,
      )
    : 0;
}

export function getClosureScrewHeadRecessRadius(
  clearanceDiameter: number,
): number {
  return clearanceDiameter / 2 + 1.35;
}
