import type {
  CustomComponentPlacement,
  CustomComponentShape,
  DesignerParameters,
  StepPreview,
} from "./model";

function round(value: number): number {
  return Number(value.toFixed(2));
}

export function getPreviewSize(
  preview: StepPreview,
): readonly [number, number, number] {
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const mesh of preview.meshes) {
    for (let offset = 0; offset < mesh.positions.length; offset += 3) {
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis], mesh.positions[offset + axis]);
        maximum[axis] = Math.max(maximum[axis], mesh.positions[offset + axis]);
      }
    }
  }
  return [0, 1, 2].map((axis) =>
    Math.max(0.01, maximum[axis] - minimum[axis]),
  ) as [number, number, number];
}

export function createCustomComponent(
  parameters: Pick<
    DesignerParameters,
    "bottomThickness" | "standoffHeight" | "pcbThickness"
  >,
  id: string,
  shape: CustomComponentShape,
  name?: string,
  preview?: StepPreview,
): CustomComponentPlacement {
  const [width, height, depth] = preview
    ? getPreviewSize(preview)
    : shape === "cylinder"
      ? [12, 8, 12]
      : [12, 8, 10];
  return {
    id,
    name:
      name ??
      (shape === "box"
        ? "自定义长方体"
        : shape === "cylinder"
          ? "自定义圆柱体"
          : "导入模型"),
    shape,
    width: round(Math.min(300, width)),
    height: round(Math.min(300, height)),
    depth: round(Math.min(300, depth)),
    positionX: 0,
    positionY: round(
      parameters.bottomThickness +
        parameters.standoffHeight +
        parameters.pcbThickness +
        height / 2,
    ),
    positionZ: 0,
    rotationX: 0,
    rotationY: 0,
    rotationZ: 0,
    color: "#4f7f6a",
    sourceName: shape === "model" ? name ?? null : null,
  };
}

export function constrainCustomComponent(
  component: CustomComponentPlacement,
): CustomComponentPlacement {
  const clampDimension = (value: number) => round(Math.min(300, Math.max(0.5, value)));
  const clampPosition = (value: number) => round(Math.min(500, Math.max(-500, value)));
  const clampRotation = (value: number) => round(((value % 360) + 360) % 360);
  const cylinderDiameter = Math.max(component.width, component.depth);
  return {
    ...component,
    width: clampDimension(
      component.shape === "cylinder" ? cylinderDiameter : component.width,
    ),
    height: clampDimension(component.height),
    depth: clampDimension(
      component.shape === "cylinder" ? cylinderDiameter : component.depth,
    ),
    positionX: clampPosition(component.positionX),
    positionY: clampPosition(component.positionY),
    positionZ: clampPosition(component.positionZ),
    rotationX: clampRotation(component.rotationX),
    rotationY: clampRotation(component.rotationY),
    rotationZ: clampRotation(component.rotationZ),
  };
}
