import type {
  DesignerParameters,
  PcbMountingHole,
  PcbReference,
} from "./model";

export interface CenteredMountingHole {
  x: number;
  y: number;
  diameter: number;
}

export function getCenteredMountingHoles(
  parameters: DesignerParameters,
  reference: PcbReference | null,
): CenteredMountingHole[] {
  if (reference) {
    const centerX = (reference.bounds.minX + reference.bounds.maxX) / 2;
    const centerY = (reference.bounds.minY + reference.bounds.maxY) / 2;
    return reference.mountingHoles.map((hole: PcbMountingHole) => ({
      x: hole.x - centerX,
      y: hole.y - centerY,
      diameter: hole.diameter,
    }));
  }

  const mountingX = Math.max(2, parameters.pcbLength / 2 - 5);
  const mountingY = Math.max(2, parameters.pcbWidth / 2 - 5);
  return [
    { x: -mountingX, y: -mountingY, diameter: 3.2 },
    { x: mountingX, y: -mountingY, diameter: 3.2 },
    { x: -mountingX, y: mountingY, diameter: 3.2 },
    { x: mountingX, y: mountingY, diameter: 3.2 },
  ];
}
