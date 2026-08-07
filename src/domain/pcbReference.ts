import type {
  DesignerParameters,
  PcbMountingHole,
  PcbReference,
} from "./model";

export interface CenteredMountingHole {
  x: number;
  y: number;
  diameter: number;
  elevation?: number;
}

export function getAssemblyMountingHoles(
  parameters: DesignerParameters,
  legacyReference: PcbReference | null,
): CenteredMountingHole[] {
  if (parameters.pcbReferences.length === 0) {
    if (!parameters.parametricPcbEnabled) return [];
    return getCenteredMountingHoles(parameters, legacyReference).map((hole) => ({
      ...hole,
      x: parameters.pcbOffsetX + hole.x,
      y: parameters.pcbOffsetZ + hole.y,
      elevation: parameters.pcbElevation,
    }));
  }
  return parameters.pcbReferences.flatMap((placement) => {
    const angle = (placement.rotation * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    return getCenteredMountingHoles(parameters, placement.reference).map((hole) => ({
      x: placement.offsetX + hole.x * cosine + hole.y * sine,
      y: placement.offsetZ - hole.x * sine + hole.y * cosine,
      diameter: hole.diameter,
      elevation: placement.elevation,
    }));
  });
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
