import type { DesignerParameters, EnclosureFace } from "./model";
import { getFaceLabel, isEnclosureFace } from "./placements";

export function normalizeRemovableFaces(
  value: unknown,
  primaryFace: EnclosureFace,
): EnclosureFace[] {
  const faces = Array.isArray(value)
    ? value.filter((face): face is EnclosureFace => isEnclosureFace(face))
    : [];
  const unique = Array.from(new Set(faces));
  if (!unique.includes(primaryFace)) unique.unshift(primaryFace);
  return unique.length > 0 ? unique : [primaryFace];
}

export function getRemovableFaces(
  parameters: Pick<DesignerParameters, "lidFace" | "removableFaces">,
): EnclosureFace[] {
  return normalizeRemovableFaces(parameters.removableFaces, parameters.lidFace);
}

export function isRemovableFace(
  parameters: Pick<DesignerParameters, "lidFace" | "removableFaces">,
  face: EnclosureFace,
): boolean {
  return getRemovableFaces(parameters).includes(face);
}

export function formatRemovableFaces(
  parameters: Pick<DesignerParameters, "lidFace" | "removableFaces">,
): string {
  return getRemovableFaces(parameters).map(getFaceLabel).join("、");
}
