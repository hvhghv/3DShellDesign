import type {
  Manifold as ManifoldSolid,
  ManifoldToplevel,
  SimplePolygon,
} from "manifold-3d";
import {
  deriveEnclosureDimensions,
  getPanelMountingPoints,
  PANEL_SCREW_CLEARANCE_RADIUS,
  PANEL_SCREW_PILOT_RADIUS,
  PANEL_SCREW_TAB_RADIUS,
} from "../domain/enclosure";
import type {
  BatteryMountFace,
  DesignerParameters,
  EnclosureDimensions,
  EnclosureFace,
  PcbReference,
} from "../domain/model";
import { getClosurePoints, MAGNET_GEOMETRY } from "../domain/magnetSupport";
import {
  getPanelPlacement,
  getPanelInnerCornerRadius,
  getPanelOpeningSize,
  getRotatedCutoutSize,
  resolveAntennaFace,
  resolveConnectorFace,
} from "../domain/placements";
import { getAssemblyMountingHoles } from "../domain/pcbReference";
import { getVentPatternPoints } from "../domain/patterns";
import {
  getPanelMagnetPocketDepth,
  getPanelScrewMountingTab,
  PANEL_MAGNET_RADIUS,
  PANEL_SNAP_LIP_DEPTH,
  PANEL_SNAP_LIP_RADIUS,
  PANEL_SNAP_POST_DEPTH,
  PANEL_SNAP_POST_RADIUS,
  PANEL_SNAP_SOCKET_RADIUS,
} from "../domain/panelMounting";
import {
  getClosureScrewHeadRecessDepth,
  getClosureScrewHeadRecessRadius,
  getPanelScrewHeadRecessDepth,
  PANEL_SCREW_HEAD_RECESS_RADIUS,
} from "../domain/screwRecess";
import { getRemovableFaces } from "../domain/removableFaces";
import { getBatteryCompartmentLayout } from "../domain/batteries";
import { getPcbMountingEnvelopes } from "../domain/pcbMounting";
import {
  getEffectivePcbRailLayout,
  getPcbRailCavityReach,
  getPcbRailDirection,
} from "../domain/pcbRailDirection";
import {
  getAntennaDefinition,
  getConnectorDefinition,
  getFastenerDefinition,
  hasThroughPanelCutout,
  supportsDisplayScrewMounting,
} from "../libraries/components";

export type SolidPart = "base" | "lid" | "panel";

function roundedRectangle(
  width: number,
  depth: number,
  radius: number,
  segmentsPerCorner = 8,
): SimplePolygon {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const safeRadius = Math.max(
    0.01,
    Math.min(radius, halfWidth - 0.01, halfDepth - 0.01),
  );
  const centers: Array<[number, number, number]> = [
    [halfWidth - safeRadius, halfDepth - safeRadius, 0],
    [-halfWidth + safeRadius, halfDepth - safeRadius, 90],
    [-halfWidth + safeRadius, -halfDepth + safeRadius, 180],
    [halfWidth - safeRadius, -halfDepth + safeRadius, 270],
  ];
  const points: SimplePolygon = [];

  for (const [centerX, centerY, startAngle] of centers) {
    for (let segment = 0; segment < segmentsPerCorner; segment += 1) {
      const angle =
        ((startAngle + (segment / segmentsPerCorner) * 90) * Math.PI) / 180;
      points.push([
        centerX + Math.cos(angle) * safeRadius,
        centerY + Math.sin(angle) * safeRadius,
      ]);
    }
  }
  return points;
}

function translateAndDispose(
  solid: ManifoldSolid,
  x: number,
  y: number,
  z: number,
): ManifoldSolid {
  const translated = solid.translate(x, y, z);
  solid.delete();
  return translated;
}

function unionAndDispose(
  first: ManifoldSolid,
  second: ManifoldSolid,
): ManifoldSolid {
  const result = first.add(second);
  first.delete();
  second.delete();
  return result;
}

function subtractAndDispose(
  source: ManifoldSolid,
  cutter: ManifoldSolid,
): ManifoldSolid {
  const result = source.subtract(cutter);
  source.delete();
  cutter.delete();
  return result;
}

function extrudePlate(
  module: ManifoldToplevel,
  width: number,
  depth: number,
  radius: number,
  height: number,
  z = 0,
): ManifoldSolid {
  const section = new module.CrossSection(roundedRectangle(width, depth, radius));
  let solid = section.extrude(height);
  section.delete();
  if (z !== 0) solid = translateAndDispose(solid, 0, 0, z);
  return solid;
}

function extrudeRing(
  module: ManifoldToplevel,
  outerWidth: number,
  outerDepth: number,
  innerWidth: number,
  innerDepth: number,
  outerRadius: number,
  innerRadius: number,
  height: number,
  z = 0,
): ManifoldSolid {
  const outer = new module.CrossSection(
    roundedRectangle(outerWidth, outerDepth, outerRadius),
  );
  const inner = new module.CrossSection(
    roundedRectangle(innerWidth, innerDepth, innerRadius),
  );
  const ring = outer.subtract(inner);
  outer.delete();
  inner.delete();
  let solid = ring.extrude(height);
  ring.delete();
  if (z !== 0) solid = translateAndDispose(solid, 0, 0, z);
  return solid;
}

function cylinderAt(
  module: ManifoldToplevel,
  radius: number,
  height: number,
  x: number,
  y: number,
  z: number,
  segments = 32,
): ManifoldSolid {
  const cylinder = module.Manifold.cylinder(height, radius, radius, segments, false);
  return translateAndDispose(cylinder, x, y, z);
}

function rotateAndDispose(
  solid: ManifoldSolid,
  x: number,
  y: number,
  z: number,
): ManifoldSolid {
  const rotated = solid.rotate(x, y, z);
  solid.delete();
  return rotated;
}

function cubeAt(
  module: ManifoldToplevel,
  size: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): ManifoldSolid {
  const cube = module.Manifold.cube(size, false);
  return translateAndDispose(cube, x, y, z);
}

function centeredCubeAt(
  module: ManifoldToplevel,
  size: readonly [number, number, number],
  x: number,
  y: number,
  z: number,
): ManifoldSolid {
  return cubeAt(
    module,
    size,
    x - size[0] / 2,
    y - size[1] / 2,
    z - size[2] / 2,
  );
}

function createFaceCutter(
  module: ManifoldToplevel,
  face: Exclude<EnclosureFace, "top">,
  u: number,
  v: number,
  width: number,
  height: number,
  radius: number,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
): ManifoldSolid {
  const thickness =
    face === "bottom" ? parameters.bottomThickness : parameters.wallThickness;
  const depth = thickness * 3;
  let cutter =
    Math.abs(width - height) < 0.001 && radius >= width / 2 - 0.01
      ? module.Manifold.cylinder(depth, width / 2, width / 2, 32, false)
      : extrudePlate(
          module,
          width,
          height,
          Math.min(radius, width / 2, height / 2),
          depth,
        );

  if (face === "front") {
    cutter = rotateAndDispose(cutter, 90, 0, 0);
    return translateAndDispose(
      cutter,
      u,
      dimensions.outsideWidth / 2 + thickness,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "back") {
    cutter = rotateAndDispose(cutter, -90, 0, 0);
    return translateAndDispose(
      cutter,
      u,
      -dimensions.outsideWidth / 2 - thickness,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "right") {
    cutter = rotateAndDispose(cutter, 90, 0, 0);
    cutter = rotateAndDispose(cutter, 0, 0, 90);
    return translateAndDispose(
      cutter,
      dimensions.outsideLength / 2 - thickness,
      u,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "left") {
    cutter = rotateAndDispose(cutter, 90, 0, 0);
    cutter = rotateAndDispose(cutter, 0, 0, -90);
    return translateAndDispose(
      cutter,
      -dimensions.outsideLength / 2 + thickness,
      u,
      parameters.baseHeight / 2 + v,
    );
  }
  return translateAndDispose(cutter, u, v, -thickness);
}

function createFacePocketCutter(
  module: ManifoldToplevel,
  face: Exclude<EnclosureFace, "top">,
  u: number,
  v: number,
  width: number,
  height: number,
  radius: number,
  depth: number,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
): ManifoldSolid {
  const safeDepth = Math.max(0.1, depth + 0.1);
  let cutter = extrudePlate(
    module,
    width,
    height,
    Math.min(radius, width / 2, height / 2),
    safeDepth,
  );

  if (face === "front") {
    cutter = rotateAndDispose(cutter, 90, 0, 0);
    return translateAndDispose(
      cutter,
      u,
      dimensions.outsideWidth / 2 + 0.05,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "back") {
    cutter = rotateAndDispose(cutter, -90, 0, 0);
    return translateAndDispose(
      cutter,
      u,
      -dimensions.outsideWidth / 2 - 0.05,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "right") {
    cutter = rotateAndDispose(cutter, 90, 0, 0);
    cutter = rotateAndDispose(cutter, 0, 0, 90);
    return translateAndDispose(
      cutter,
      dimensions.outsideLength / 2 - depth - 0.05,
      u,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "left") {
    cutter = rotateAndDispose(cutter, 90, 0, 0);
    cutter = rotateAndDispose(cutter, 0, 0, -90);
    return translateAndDispose(
      cutter,
      -dimensions.outsideLength / 2 + depth + 0.05,
      u,
      parameters.baseHeight / 2 + v,
    );
  }
  return translateAndDispose(cutter, u, v, -0.05);
}

function createFaceAxialCylinder(
  module: ManifoldToplevel,
  face: Exclude<EnclosureFace, "top">,
  u: number,
  v: number,
  radius: number,
  depth: number,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
): ManifoldSolid {
  let solid = module.Manifold.cylinder(depth, radius, radius, 32, false);
  if (face === "front") {
    solid = rotateAndDispose(solid, 90, 0, 0);
    return translateAndDispose(
      solid,
      u,
      dimensions.outsideWidth / 2 + 0.05,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "back") {
    solid = rotateAndDispose(solid, -90, 0, 0);
    return translateAndDispose(
      solid,
      u,
      -dimensions.outsideWidth / 2 - 0.05,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "right") {
    solid = rotateAndDispose(solid, 90, 0, 0);
    solid = rotateAndDispose(solid, 0, 0, 90);
    return translateAndDispose(
      solid,
      dimensions.outsideLength / 2 - depth + 0.05,
      u,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "left") {
    solid = rotateAndDispose(solid, 90, 0, 0);
    solid = rotateAndDispose(solid, 0, 0, -90);
    return translateAndDispose(
      solid,
      -dimensions.outsideLength / 2 + depth - 0.05,
      u,
      parameters.baseHeight / 2 + v,
    );
  }
  return translateAndDispose(solid, u, v, -0.05);
}

function createFaceAxialBox(
  module: ManifoldToplevel,
  face: Exclude<EnclosureFace, "top">,
  u: number,
  v: number,
  width: number,
  height: number,
  depth: number,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
): ManifoldSolid {
  let solid = module.Manifold.cube([width, height, depth], true);
  if (face === "front") {
    solid = rotateAndDispose(solid, 90, 0, 0);
    return translateAndDispose(
      solid,
      u,
      dimensions.outsideWidth / 2 - depth / 2 + 0.05,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "back") {
    solid = rotateAndDispose(solid, -90, 0, 0);
    return translateAndDispose(
      solid,
      u,
      -dimensions.outsideWidth / 2 + depth / 2 - 0.05,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "right") {
    solid = rotateAndDispose(solid, 90, 0, 0);
    solid = rotateAndDispose(solid, 0, 0, 90);
    return translateAndDispose(
      solid,
      dimensions.outsideLength / 2 - depth / 2 + 0.05,
      u,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "left") {
    solid = rotateAndDispose(solid, 90, 0, 0);
    solid = rotateAndDispose(solid, 0, 0, -90);
    return translateAndDispose(
      solid,
      -dimensions.outsideLength / 2 + depth / 2 - 0.05,
      u,
      parameters.baseHeight / 2 + v,
    );
  }
  return translateAndDispose(solid, u, v, depth / 2 - 0.05);
}

function createTopCutter(
  module: ManifoldToplevel,
  u: number,
  v: number,
  width: number,
  height: number,
  radius: number,
  parameters: DesignerParameters,
  lipHeight: number,
): ManifoldSolid {
  const depth = parameters.lidThickness * 3;
  const cutter =
    Math.abs(width - height) < 0.001 && radius >= width / 2 - 0.01
      ? module.Manifold.cylinder(depth, width / 2, width / 2, 32, false)
      : extrudePlate(
          module,
          width,
          height,
          Math.min(radius, width / 2, height / 2),
          depth,
        );
  return translateAndDispose(
    cutter,
    u,
    v,
    lipHeight - parameters.lidThickness,
  );
}

function getSolidFaceSize(
  face: EnclosureFace,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
): readonly [number, number] {
  if (face === "top" || face === "bottom") {
    return [dimensions.outsideLength, dimensions.outsideWidth];
  }
  if (face === "front" || face === "back") {
    return [dimensions.outsideLength, parameters.baseHeight];
  }
  return [dimensions.outsideWidth, parameters.baseHeight];
}

function getSolidInteriorBottomZ(parameters: DesignerParameters): number {
  return getRemovableFaces(parameters).includes("bottom")
    ? 0
    : parameters.bottomThickness;
}

function createLocalLidCutout(
  module: ManifoldToplevel,
  u: number,
  v: number,
  width: number,
  height: number,
  radius: number,
  depth: number,
): ManifoldSolid {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  const cutter =
    Math.abs(width - height) < 0.001 && safeRadius >= width / 2 - 0.01
      ? module.Manifold.cylinder(depth, width / 2, width / 2, 32, false)
      : extrudePlate(module, width, height, safeRadius, depth);
  return translateAndDispose(cutter, u, v, -0.2);
}

function createHorizontalCutout(
  module: ManifoldToplevel,
  u: number,
  v: number,
  width: number,
  height: number,
  radius: number,
  depth: number,
  z: number,
): ManifoldSolid {
  const cutter = createLocalLidCutout(
    module,
    u,
    v,
    width,
    height,
    radius,
    depth,
  );
  return translateAndDispose(cutter, 0, 0, z + 0.2);
}

function addBossWithPilotHole(
  module: ManifoldToplevel,
  source: ManifoldSolid,
  x: number,
  y: number,
  z: number,
  height: number,
  outerRadius: number,
  holeRadius: number,
): ManifoldSolid {
  const boss = cylinderAt(module, outerRadius, height, x, y, z);
  let result = unionAndDispose(source, boss);
  const pilot = cylinderAt(
    module,
    holeRadius,
    Math.max(1, height - 1),
    x,
    y,
    z + 1,
  );
  result = subtractAndDispose(result, pilot);
  return result;
}

function addSolidBoss(
  module: ManifoldToplevel,
  source: ManifoldSolid,
  x: number,
  y: number,
  z: number,
  height: number,
  outerRadius: number,
): ManifoldSolid {
  return unionAndDispose(
    source,
    cylinderAt(module, outerRadius, height, x, y, z),
  );
}

function rotateLocalPoint(
  u: number,
  v: number,
  rotation: 0 | 90 | 180 | 270,
): readonly [number, number] {
  if (rotation === 90) return [-v, u];
  if (rotation === 180) return [-u, -v];
  if (rotation === 270) return [v, -u];
  return [u, v];
}

function getDisplayMountingPoints(
  pcbWidth: number,
  pcbHeight: number,
): ReadonlyArray<readonly [number, number]> {
  const inset = Math.min(3, Math.max(1.4, Math.min(pcbWidth, pcbHeight) * 0.18));
  const u = Math.max(1.2, pcbWidth / 2 - inset);
  const v = Math.max(1.2, pcbHeight / 2 - inset);
  return [
    [-u, -v],
    [u, -v],
    [-u, v],
    [u, v],
  ];
}

function addMagnetSupports(
  module: ManifoldToplevel,
  source: ManifoldSolid,
  parameters: DesignerParameters,
  outsideLength: number,
  outsideWidth: number,
  interiorBottomZ: number,
): ManifoldSolid {
  const geometry = MAGNET_GEOMETRY;
  const points = getClosurePoints(
    outsideLength,
    outsideWidth,
    parameters.wallThickness,
  );
  const supportBottom = parameters.baseHeight - geometry.supportThickness;
  let result = source;

  if (parameters.magnetSupportType === "perimeter-flange") {
    const edgeOffset = parameters.wallThickness - geometry.wallOverlap;
    const outerLength = outsideLength - edgeOffset * 2;
    const outerWidth = outsideWidth - edgeOffset * 2;
    const innerLength = outerLength - geometry.perimeterFlangeWidth * 2;
    const innerWidth = outerWidth - geometry.perimeterFlangeWidth * 2;
    const flange = extrudeRing(
      module,
      outerLength,
      outerWidth,
      innerLength,
      innerWidth,
      Math.max(0.5, parameters.cornerRadius - edgeOffset),
      Math.max(
        0.5,
        parameters.cornerRadius - edgeOffset - geometry.perimeterFlangeWidth,
      ),
      geometry.supportThickness,
      supportBottom,
    );
    result = unionAndDispose(result, flange);
  } else {
    for (const [x, y] of points) {
      let support: ManifoldSolid;
      if (parameters.magnetSupportType === "floor-column") {
        const columnBottom = Math.max(0, interiorBottomZ - 0.2);
        support = cylinderAt(
          module,
          geometry.floorColumnRadius,
          parameters.baseHeight - columnBottom,
          x,
          y,
          columnBottom,
        );
      } else if (parameters.magnetSupportType === "wall-bracket") {
        support = cubeAt(
          module,
          [
            geometry.wallBracketWidth,
            geometry.supportSize,
            geometry.supportThickness,
          ],
          x - geometry.wallBracketWidth / 2,
          y - geometry.supportSize / 2,
          supportBottom,
        );
        const rib = cubeAt(
          module,
          [
            geometry.wallBracketRibThickness,
            geometry.supportSize,
            geometry.supportThickness + geometry.wallBracketRibDrop,
          ],
          x - geometry.wallBracketRibThickness / 2,
          y - geometry.supportSize / 2,
          supportBottom - geometry.wallBracketRibDrop,
        );
        support = unionAndDispose(support, rib);
      } else {
        support = cubeAt(
          module,
          [geometry.supportSize, geometry.supportSize, geometry.supportThickness],
          x - geometry.supportSize / 2,
          y - geometry.supportSize / 2,
          supportBottom,
        );
      }
      result = unionAndDispose(result, support);
    }
  }

  for (const [x, y] of points) {
    const pocket = cylinderAt(
      module,
      geometry.pocketRadius,
      geometry.basePocketDepth + 0.2,
      x,
      y,
      parameters.baseHeight - geometry.basePocketDepth,
    );
    result = subtractAndDispose(result, pocket);
  }
  return result;
}

function createFaceRail(
  module: ManifoldToplevel,
  face: EnclosureFace,
  u: number,
  v: number,
  length: number,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
  topZ = 0,
): ManifoldSolid {
  let rail = module.Manifold.cube([length, 1.5, 1.2], true);
  if (face === "front" || face === "back") {
    rail = rotateAndDispose(rail, 90, 0, 0);
  } else if (face === "right" || face === "left") {
    rail = rotateAndDispose(rail, 90, 0, 0);
    rail = rotateAndDispose(rail, 0, 0, 90);
  }

  if (face === "top") return translateAndDispose(rail, u, v, topZ + 0.4);
  if (face === "bottom") return translateAndDispose(rail, u, v, -0.4);
  if (face === "front") {
    return translateAndDispose(
      rail,
      u,
      dimensions.outsideWidth / 2 + 0.4,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "back") {
    return translateAndDispose(
      rail,
      u,
      -dimensions.outsideWidth / 2 - 0.4,
      parameters.baseHeight / 2 + v,
    );
  }
  if (face === "right") {
    return translateAndDispose(
      rail,
      dimensions.outsideLength / 2 + 0.4,
      u,
      parameters.baseHeight / 2 + v,
    );
  }
  return translateAndDispose(
    rail,
    -dimensions.outsideLength / 2 - 0.4,
    u,
    parameters.baseHeight / 2 + v,
  );
}

function applyBasePanelFeatures(
  module: ManifoldToplevel,
  source: ManifoldSolid,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
): ManifoldSolid {
  let result = source;
  for (const panel of parameters.panelPlacements) {
    if (panel.face === "top") continue;
    const face = panel.face;
    const [openingWidth, openingHeight] = getPanelOpeningSize(panel);
    if (panel.insetDepth > 0) {
      result = subtractAndDispose(
        result,
        createFacePocketCutter(
          module,
          face,
          panel.offsetU,
          panel.offsetV,
          panel.width + 0.3,
          panel.height + 0.3,
          panel.cornerRadius + 0.15,
          panel.insetDepth,
          parameters,
          dimensions,
        ),
      );
    }
    result = subtractAndDispose(
      result,
      createFaceCutter(
        module,
        face,
        panel.offsetU,
        panel.offsetV,
        openingWidth,
        openingHeight,
        getPanelInnerCornerRadius(panel),
        parameters,
        dimensions,
      ),
    );

    if (panel.mountingType === "slide") {
      for (const pointV of [-panel.height / 2 - 1.2, panel.height / 2 + 1.2]) {
        result = unionAndDispose(
          result,
          createFaceRail(
            module,
            face,
            panel.offsetU,
            panel.offsetV + pointV,
            panel.width + 2,
            parameters,
            dimensions,
          ),
        );
      }
    } else {
      for (const [pointU, pointV] of getPanelMountingPoints(panel)) {
        if (panel.mountingType === "screw") {
          const surfaceThickness =
            face === "bottom"
              ? parameters.bottomThickness
              : parameters.wallThickness;
          const tabDepth = surfaceThickness + 0.1;
          const bridge = getPanelScrewMountingTab(
            panel,
            pointU,
            pointV,
            PANEL_SCREW_TAB_RADIUS,
          );
          result = unionAndDispose(
            result,
            createFaceAxialBox(
              module,
              face,
              panel.offsetU + bridge.centerU,
              panel.offsetV + bridge.centerV,
              bridge.width,
              bridge.height,
              tabDepth,
              parameters,
              dimensions,
            ),
          );
          result = subtractAndDispose(
            result,
            createFaceAxialCylinder(
              module,
              face,
              panel.offsetU + pointU,
              panel.offsetV + pointV,
              PANEL_SCREW_PILOT_RADIUS,
              tabDepth + 0.2,
              parameters,
              dimensions,
            ),
          );
        } else if (panel.mountingType === "magnet") {
          const surfaceThickness =
            face === "bottom"
              ? parameters.bottomThickness
              : parameters.wallThickness;
          const pocketDepth = getPanelMagnetPocketDepth(surfaceThickness);
          result = subtractAndDispose(
            result,
            createFacePocketCutter(
              module,
              face,
              panel.offsetU + pointU,
              panel.offsetV + pointV,
              PANEL_MAGNET_RADIUS * 2,
              PANEL_MAGNET_RADIUS * 2,
              PANEL_MAGNET_RADIUS,
              pocketDepth,
              parameters,
              dimensions,
            ),
          );
        } else {
          result = subtractAndDispose(
            result,
            createFaceCutter(
              module,
              face,
              panel.offsetU + pointU,
              panel.offsetV + pointV,
              PANEL_SNAP_SOCKET_RADIUS * 2,
              PANEL_SNAP_SOCKET_RADIUS * 2,
              PANEL_SNAP_SOCKET_RADIUS,
              parameters,
              dimensions,
            ),
          );
        }
      }
    }
  }
  return result;
}

function tubeAlongX(
  module: ManifoldToplevel,
  length: number,
  outerRadius: number,
  innerRadius: number,
  x: number,
  y: number,
  z: number,
): ManifoldSolid {
  let outer = module.Manifold.cylinder(length, outerRadius, outerRadius, 32, false);
  outer = rotateAndDispose(outer, 0, 90, 0);
  outer = translateAndDispose(outer, x, y, z);
  let inner = module.Manifold.cylinder(length + 0.4, innerRadius, innerRadius, 24, false);
  inner = rotateAndDispose(inner, 0, 90, 0);
  inner = translateAndDispose(inner, x - 0.2, y, z);
  return subtractAndDispose(outer, inner);
}

function applyVentPattern(
  module: ManifoldToplevel,
  source: ManifoldSolid,
  parameters: DesignerParameters,
): ManifoldSolid {
  let result = source;
  for (const point of getVentPatternPoints(parameters)) {
    let cutter: ManifoldSolid;
    if (point.shape === "slot") {
      const straightLength = Math.max(0.1, point.width - point.height);
      cutter = cubeAt(
        module,
        [straightLength, point.height, parameters.bottomThickness + 0.4],
        point.x - straightLength / 2,
        point.y - point.height / 2,
        -0.2,
      );
      for (const x of [
        point.x - straightLength / 2,
        point.x + straightLength / 2,
      ]) {
        cutter = unionAndDispose(
          cutter,
          cylinderAt(
            module,
            point.height / 2,
            parameters.bottomThickness + 0.4,
            x,
            point.y,
            -0.2,
          ),
        );
      }
    } else {
      cutter = cylinderAt(
        module,
        point.width / 2,
        parameters.bottomThickness + 0.4,
        point.x,
        point.y,
        -0.2,
        point.shape === "hexagon" ? 6 : 32,
      );
    }
    result = subtractAndDispose(result, cutter);
  }
  return result;
}

function applyBatteryCompartments(
  module: ManifoldToplevel,
  source: ManifoldSolid,
  parameters: DesignerParameters,
  face: BatteryMountFace,
  mountZ: number,
): ManifoldSolid {
  let result = source;
  for (const placement of parameters.batteryCompartments.filter(
    (compartment) => compartment.face === face,
  )) {
    const layout = getBatteryCompartmentLayout(placement);
    let tray: ManifoldSolid | null = null;
    const addTrayPart = (part: ManifoldSolid) => {
      tray = tray ? unionAndDispose(tray, part) : part;
    };
    const dimensions = deriveEnclosureDimensions(parameters);
    const mountedOnTop = face === "top";
    const mountedOnBottom = face === "bottom";
    const mountedOnSide = !mountedOnTop && !mountedOnBottom;
    const partZ = (height: number) =>
      mountedOnTop ? mountZ - height : mountedOnBottom ? mountZ - 0.1 : -0.1;
    const partHeight = (height: number) => height + 0.1;
    const openSide = placement.insertionSide;

    if (layout.preset.shape === "cylinder") {
      const railHeight = layout.railHeight + 0.1;
      const z = partZ(railHeight);
      const innerWidth = Math.max(2, placement.width - placement.wallThickness * 2);
      const contactBlockWidth = Math.max(
        placement.wallThickness,
        layout.terminalAllowance,
      );
      const contactBlockDepth = Math.max(
        3,
        Math.min(
          layout.preset.cellWidth + placement.clearance * 2,
          layout.lanePitch > 0
            ? layout.lanePitch - placement.wallThickness
            : layout.innerDepth,
        ),
      );

      addTrayPart(
        cubeAt(
          module,
          [placement.width, placement.wallThickness, partHeight(layout.railHeight)],
          -placement.width / 2,
          -placement.depth / 2,
          z,
        ),
      );
      addTrayPart(
        cubeAt(
          module,
          [placement.width, placement.wallThickness, partHeight(layout.railHeight)],
          -placement.width / 2,
          placement.depth / 2 - placement.wallThickness,
          z,
        ),
      );

      for (let index = 1; index < layout.laneCenters.length; index += 1) {
        const dividerY =
          (layout.laneCenters[index - 1] + layout.laneCenters[index]) / 2 -
          placement.wallThickness / 2;
        addTrayPart(
          cubeAt(
            module,
            [innerWidth, placement.wallThickness, partHeight(layout.railHeight)],
            -innerWidth / 2,
            dividerY,
            z,
          ),
        );
      }

      for (const laneCenter of layout.laneCenters) {
        for (const side of ["left", "right"] as const) {
          const isOpen = openSide === side;
          const height = isOpen
            ? Math.max(1, layout.railHeight * 0.32)
            : layout.railHeight;
          addTrayPart(
            cubeAt(
              module,
              [
                contactBlockWidth * (isOpen ? 0.55 : 1),
                contactBlockDepth,
                partHeight(height),
              ],
              side === "left"
                ? -placement.width / 2
                : placement.width / 2 - contactBlockWidth * (isOpen ? 0.55 : 1),
              laneCenter - contactBlockDepth / 2,
              partZ(height),
            ),
          );
        }
      }
    } else {
      const innerWidth = Math.max(2, placement.width - placement.wallThickness * 2);
      const innerDepth = Math.max(2, placement.depth - placement.wallThickness * 2);
      addTrayPart(
        cubeAt(
          module,
          [placement.width, placement.wallThickness, partHeight(placement.height)],
          -placement.width / 2,
          -placement.depth / 2,
          partZ(placement.height),
        ),
      );
      addTrayPart(
        cubeAt(
          module,
          [placement.width, placement.wallThickness, partHeight(placement.height)],
          -placement.width / 2,
          placement.depth / 2 - placement.wallThickness,
          partZ(placement.height),
        ),
      );
      const closedX =
        openSide === "right"
          ? -placement.width / 2
          : placement.width / 2 - placement.wallThickness;
      addTrayPart(
        cubeAt(
          module,
          [placement.wallThickness, placement.depth, partHeight(placement.height)],
          closedX,
          -placement.depth / 2,
          partZ(placement.height),
        ),
      );
      const openX =
        openSide === "right"
          ? placement.width / 2 - placement.wallThickness * 0.65
          : -placement.width / 2;
      const entryGuideHeight = Math.max(1, placement.height * 0.28);
      addTrayPart(
        cubeAt(
          module,
          [
            placement.wallThickness * 0.65,
            placement.depth,
            partHeight(entryGuideHeight),
          ],
          openX,
          -placement.depth / 2,
          partZ(entryGuideHeight),
        ),
      );
      if (placement.cellCount > 1 && placement.preset !== "lipo") {
        const spacing = innerDepth / placement.cellCount;
        for (let index = 1; index < placement.cellCount; index += 1) {
          addTrayPart(
            cubeAt(
              module,
              [innerWidth, placement.wallThickness, partHeight(placement.height)],
              -innerWidth / 2,
              -innerDepth / 2 + spacing * index - placement.wallThickness / 2,
              partZ(placement.height),
            ),
          );
        }
      }
    }

    if (placement.retentionType === "elastic") {
      const postRadius = Math.max(0.7, placement.wallThickness * 0.45);
      const hookHeight = Math.max(2.4, placement.wallThickness * 1.9);
      const hookX =
        openSide === "right"
          ? placement.width / 2 - Math.max(placement.wallThickness * 2, 3)
          : -placement.width / 2 + Math.max(placement.wallThickness * 2, 3);
      for (const y of [
        -placement.depth / 2 - postRadius * 1.4,
        placement.depth / 2 + postRadius * 1.4,
      ]) {
        addTrayPart(
          cylinderAt(module, postRadius, partHeight(hookHeight), hookX, y, partZ(hookHeight), 20),
        );
      }
    } else if (placement.retentionType === "clip") {
      const clipHeight = Math.max(0.7, placement.wallThickness * 0.55);
      const clipDepth = Math.max(1.2, placement.wallThickness * 1.1);
      const clipZ = mountedOnTop
        ? mountZ - placement.height * 0.7 - clipHeight
        : mountZ + placement.height * 0.7;
      for (const y of [
        -placement.depth / 2 + placement.wallThickness,
        placement.depth / 2 - placement.wallThickness - clipDepth,
      ]) {
        addTrayPart(
          cubeAt(
            module,
            [Math.max(6, placement.width * 0.22), clipDepth, clipHeight],
            -Math.max(6, placement.width * 0.22) / 2,
            y,
            clipZ,
          ),
        );
      }
    }

    if (!tray) continue;
    if (placement.rotation !== 0) {
      tray = rotateAndDispose(tray, 0, 0, placement.rotation);
    }
    if (mountedOnSide) {
      if (face === "front") {
        tray = rotateAndDispose(tray, 90, 0, 0);
        tray = translateAndDispose(
          tray,
          placement.offsetX,
          dimensions.insideWidth / 2,
          parameters.baseHeight / 2 + placement.offsetZ,
        );
      } else if (face === "back") {
        tray = rotateAndDispose(tray, -90, 0, 0);
        tray = translateAndDispose(
          tray,
          placement.offsetX,
          -dimensions.insideWidth / 2,
          parameters.baseHeight / 2 + placement.offsetZ,
        );
      } else if (face === "right") {
        tray = rotateAndDispose(tray, 0, -90, 0);
        tray = translateAndDispose(
          tray,
          dimensions.insideLength / 2,
          parameters.baseHeight / 2 + placement.offsetZ,
          placement.offsetX,
        );
      } else if (face === "left") {
        tray = rotateAndDispose(tray, 0, 90, 0);
        tray = translateAndDispose(
          tray,
          -dimensions.insideLength / 2,
          parameters.baseHeight / 2 + placement.offsetZ,
          placement.offsetX,
        );
      }
    } else {
      tray = translateAndDispose(tray, placement.offsetX, placement.offsetZ, 0);
    }
    result = unionAndDispose(result, tray);
  }
  return result;
}

function applyPcbRailMountingFeatures(
  module: ManifoldToplevel,
  source: ManifoldSolid,
  parameters: DesignerParameters,
  pcbReference: PcbReference | null,
): ManifoldSolid {
  if (parameters.pcbMountingType === "screw") return source;

  let result = source;
  for (const envelope of getPcbMountingEnvelopes(parameters, pcbReference)) {
    const layout = getEffectivePcbRailLayout(parameters, envelope);
    const railDirection = getPcbRailDirection(parameters, envelope.rotation);
    let rails: ManifoldSolid | null = null;
    const addRailPart = (part: ManifoldSolid) => {
      rails = rails ? unionAndDispose(rails, part) : part;
    };
    const addCenteredBox = (
      size: readonly [number, number, number],
      centerX: number,
      centerY: number,
      centerZ: number,
    ) => {
      addRailPart(
        cubeAt(
          module,
          size,
          centerX - size[0] / 2,
          centerY - size[1] / 2,
          centerZ - size[2] / 2,
        ),
      );
    };

    const faceReach = getPcbRailCavityReach(parameters);
    const railLength = layout.railLength + faceReach;
    const railCenterX =
      layout.openSideSign * (layout.stopWidth / 2 + faceReach / 2);
    const slotClearance = Math.max(
      0.035,
      Math.min(parameters.pcbRailClearance * 0.2, 0.08),
    );
    const ledgeCaptureOverlap = Math.min(
      layout.travelWidth / 2,
      Math.max(layout.ledgeOverlap, parameters.pcbRailWidth * 0.85),
    );
    const lipCaptureOverlap = Math.min(
      layout.travelWidth / 2,
      Math.max(layout.lipOverlap, parameters.pcbRailWidth * 0.78),
    );
    const lowerLedgeZ = layout.boardBottom - layout.ledgeThickness / 2 + 0.04;
    const topLipZ =
      layout.boardTop + slotClearance + layout.lipThickness / 2;
    const stopBottomZ = lowerLedgeZ - layout.ledgeThickness / 2;
    const stopTopZ = topLipZ + layout.lipThickness / 2;
    const stopHeight = stopTopZ - stopBottomZ;
    const stopCenterZ = (stopTopZ + stopBottomZ) / 2;
    const sideWebDepth = Math.max(
      0.8,
      faceReach > 0.12 ? faceReach - Math.min(slotClearance, 0.08) : faceReach,
    );
    const closedEdgeX = -layout.openSideSign * (layout.travelLength / 2);
    const stopLength = layout.stopWidth + faceReach;
    const stopCenterX =
      closedEdgeX + layout.openSideSign * (layout.stopWidth / 2 - faceReach / 2);

    for (const sideSign of [-1, 1] as const) {
      const ledgeDepth = faceReach + ledgeCaptureOverlap;
      const ledgeCenterY =
        sideSign *
        (layout.travelWidth / 2 + faceReach / 2 - ledgeCaptureOverlap / 2);
      addCenteredBox(
        [railLength, ledgeDepth, layout.ledgeThickness],
        railCenterX,
        ledgeCenterY,
        lowerLedgeZ,
      );
      const lipDepth = faceReach + lipCaptureOverlap;
      const lipCenterY =
        sideSign *
        (layout.travelWidth / 2 + faceReach / 2 - lipCaptureOverlap / 2);
      addCenteredBox(
        [railLength, lipDepth, layout.lipThickness],
        railCenterX,
        lipCenterY,
        topLipZ,
      );
      const sideWebCenterY =
        sideSign * (layout.travelWidth / 2 + faceReach - sideWebDepth / 2);
      addCenteredBox(
        [railLength, sideWebDepth, stopHeight],
        railCenterX,
        sideWebCenterY,
        stopCenterZ,
      );
    }

    addCenteredBox(
      [
        stopLength,
        layout.travelWidth + faceReach * 2,
        stopHeight,
      ],
      stopCenterX,
      0,
      stopCenterZ,
    );

    if (parameters.pcbMountingType === "rail-elastic") {
      const bandRadius = Math.max(
        0.35,
        Math.min(0.9, parameters.pcbElasticBandWidth * 0.22),
      );
      const anchorRadius = Math.max(0.9, parameters.pcbRailWidth * 0.3);
      const anchorHeight = Math.max(2.8, parameters.pcbElasticBandWidth + 1);
      const retainerGap = Math.max(0.08, Math.min(0.18, bandRadius * 0.2));
      const retainerRadius =
        anchorRadius + Math.max(0.75, bandRadius * 1.15);
      const retainerHeight = Math.max(
        0.8,
        Math.min(anchorHeight * 0.36, bandRadius * 1.55),
      );
      const anchorX =
        closedEdgeX +
        layout.openSideSign *
          Math.max(parameters.pcbStopWidth * 0.65, anchorRadius + 1.6);
      const topZ = layout.boardTop + bandRadius + 0.08;
      const bottomZ = layout.boardBottom - bandRadius - 0.08;
      const bottomRetainerCenterZ = Math.max(
        layout.boardBottom - anchorHeight + retainerHeight / 2,
        bottomZ - bandRadius - retainerGap - retainerHeight / 2,
      );
      const topRetainerCenterZ = Math.min(
        layout.boardTop + anchorHeight - retainerHeight / 2,
        topZ + bandRadius + retainerGap + retainerHeight / 2,
      );
      const laneOffset = Math.max(
        parameters.pcbElasticBandWidth * 1.8,
        Math.min(layout.travelWidth * 0.28, layout.travelWidth / 2 - 8),
      );
      const laneYs =
        laneOffset > 0
          ? [-laneOffset, laneOffset]
          : [-layout.travelWidth * 0.2, layout.travelWidth * 0.2];
      for (const laneY of laneYs) {
        const anchorOverlap = 0.1;
        addRailPart(
          cylinderAt(
            module,
            anchorRadius,
            anchorHeight,
            anchorX,
            laneY,
            layout.boardTop - anchorOverlap,
            20,
          ),
        );
        addRailPart(
          cylinderAt(
            module,
            retainerRadius,
            retainerHeight,
            anchorX,
            laneY,
            topRetainerCenterZ - retainerHeight / 2,
            24,
          ),
        );
        addRailPart(
          cylinderAt(
            module,
            anchorRadius,
            anchorHeight,
            anchorX,
            laneY,
            layout.boardBottom - anchorHeight + anchorOverlap,
            20,
          ),
        );
        addRailPart(
          cylinderAt(
            module,
            retainerRadius,
            retainerHeight,
            anchorX,
            laneY,
            bottomRetainerCenterZ - retainerHeight / 2,
            24,
          ),
        );
      }
    }

    if (!rails) continue;
    const axisRotation = railDirection.axis === "z" ? 90 : 0;
    if (axisRotation !== 0 || envelope.rotation !== 0) {
      rails = rotateAndDispose(rails, 0, 0, axisRotation + envelope.rotation);
    }
    rails = translateAndDispose(rails, envelope.offsetX, envelope.offsetZ, 0);
    result = unionAndDispose(result, rails);
  }

  return result;
}

function applyFixedTopFaceFeatures(
  module: ManifoldToplevel,
  source: ManifoldSolid,
  parameters: DesignerParameters,
): ManifoldSolid {
  let result = source;
  const cutDepth = parameters.lidThickness + 0.4;
  const cutZ = parameters.baseHeight - 0.2;

  for (const panel of parameters.panelPlacements.filter(
    (placement) => placement.face === "top",
  )) {
    const inset = panel.insetDepth > 0;
    const [openingWidth, openingHeight] = getPanelOpeningSize(panel);
    result = subtractAndDispose(
      result,
      createHorizontalCutout(
        module,
        panel.offsetU,
        panel.offsetV,
        inset ? panel.width + 0.3 : openingWidth,
        inset ? panel.height + 0.3 : openingHeight,
        inset ? panel.cornerRadius + 0.15 : getPanelInnerCornerRadius(panel),
        cutDepth,
        cutZ,
      ),
    );
  }

  for (const placement of parameters.connectorPlacements) {
    if (placement.surface === "panel") continue;
    if (resolveConnectorFace(placement, parameters) !== "top") continue;
    const connector = getConnectorDefinition(placement.definitionId);
    if (!hasThroughPanelCutout(connector)) continue;
    const [width, height] = getRotatedCutoutSize(placement);
    result = subtractAndDispose(
      result,
      createHorizontalCutout(
        module,
        placement.offsetU,
        placement.offsetV,
        width,
        height,
        connector.panelCutout.shape === "circle"
          ? width / 2
          : connector.panelCutout.cornerRadius,
        cutDepth,
        cutZ,
      ),
    );
  }

  for (const placement of parameters.antennaPlacements) {
    const antenna = getAntennaDefinition(placement.definitionId);
    if (
      !antenna.enclosureCutout ||
      placement.surface === "panel" ||
      resolveAntennaFace(placement, parameters) !== "top"
    ) {
      continue;
    }
    result = subtractAndDispose(
      result,
      createHorizontalCutout(
        module,
        placement.offsetU,
        placement.offsetV,
        placement.cutoutDiameter,
        placement.cutoutDiameter,
        placement.cutoutDiameter / 2,
        cutDepth,
        cutZ,
      ),
    );
  }

  return result;
}

function buildBase(
  module: ManifoldToplevel,
  parameters: DesignerParameters,
  pcbReference: PcbReference | null,
): ManifoldSolid {
  const dimensions = deriveEnclosureDimensions(parameters);
  const removableFaces = getRemovableFaces(parameters);
  const removableFaceSet = new Set<EnclosureFace>(removableFaces);
  const isRemovableFace = (face: EnclosureFace) => removableFaceSet.has(face);
  const fastener = getFastenerDefinition(parameters.closureFastenerId);
  const interiorBottomZ = getSolidInteriorBottomZ(parameters);
  const wallHeight = parameters.baseHeight - interiorBottomZ;
  if (wallHeight <= 0.5) {
    throw new Error("主体高度必须大于底面厚度");
  }
  const innerRadius = Math.max(0.5, parameters.cornerRadius - parameters.wallThickness);
  let base = extrudeRing(
    module,
    dimensions.outsideLength,
    dimensions.outsideWidth,
    dimensions.insideLength,
    dimensions.insideWidth,
    parameters.cornerRadius,
    innerRadius,
    wallHeight,
    interiorBottomZ,
  );
  if (!isRemovableFace("bottom")) {
    base = unionAndDispose(
      extrudePlate(
        module,
        dimensions.outsideLength,
        dimensions.outsideWidth,
        parameters.cornerRadius,
        parameters.bottomThickness,
      ),
      base,
    );
  }
  if (!isRemovableFace("top")) {
    base = unionAndDispose(
      base,
      extrudePlate(
        module,
        dimensions.outsideLength,
        dimensions.outsideWidth,
        parameters.cornerRadius,
        parameters.lidThickness,
        parameters.baseHeight,
      ),
    );
    base = applyFixedTopFaceFeatures(module, base, parameters);
  }
  for (const removableFace of removableFaces) {
    if (removableFace === "top") continue;
    if (removableFace === "bottom") {
      continue;
    }
    const openingWidth =
      removableFace === "left" || removableFace === "right"
        ? dimensions.insideWidth
        : dimensions.insideLength;
    const openingHeight = Math.max(
      2,
      parameters.baseHeight - interiorBottomZ - parameters.wallThickness,
    );
    base = subtractAndDispose(
      base,
      createFaceCutter(
        module,
        removableFace,
        0,
        interiorBottomZ / 2,
        openingWidth,
        openingHeight,
        Math.min(innerRadius, openingWidth / 2, openingHeight / 2),
        parameters,
        dimensions,
      ),
    );
  }
  base = applyVentPattern(module, base, parameters);
  if (!isRemovableFace("bottom")) {
    base = applyBatteryCompartments(
      module,
      base,
      parameters,
      "bottom",
      parameters.bottomThickness,
    );
  }
  for (const face of ["front", "back", "left", "right"] as const) {
    base = applyBatteryCompartments(module, base, parameters, face, 0);
  }
  base = applyPcbRailMountingFeatures(module, base, parameters, pcbReference);

  if (parameters.enclosureTemplateId === "wall-mount" && !isRemovableFace("bottom")) {
    for (const x of [
      -dimensions.outsideLength / 2 - 6,
      dimensions.outsideLength / 2 + 6,
    ]) {
      const ear = cubeAt(
        module,
        [12, 14, parameters.bottomThickness],
        x - 6,
        -7,
        0,
      );
      base = unionAndDispose(base, ear);
      const hole = cylinderAt(
        module,
        2.2,
        parameters.bottomThickness + 0.4,
        x,
        0,
        -0.2,
      );
      base = subtractAndDispose(base, hole);
    }
  }

  if (parameters.closureType === "slide") {
    for (const y of [
      -dimensions.insideWidth / 2 + 0.8,
      dimensions.insideWidth / 2 - 2.4,
    ]) {
      const rail = cubeAt(
        module,
        [dimensions.insideLength - 10, 1.6, 2],
        -(dimensions.insideLength - 10) / 2,
        y,
        parameters.baseHeight - 3,
      );
      base = unionAndDispose(base, rail);
    }
  }

  if (parameters.closureType === "hinge") {
    const hingeY = -dimensions.outsideWidth / 2;
    const hingeZ = parameters.baseHeight - 0.8;
    for (const x of [
      -dimensions.outsideLength / 2 + 6,
      dimensions.outsideLength / 2 - 20,
    ]) {
      base = unionAndDispose(
        base,
        tubeAlongX(module, 14, 3.2, 1.35, x, hingeY, hingeZ),
      );
    }
  }

  if (parameters.closureType === "pin") {
    const pinZ = parameters.baseHeight - 0.8;
    for (const y of [
      -dimensions.outsideWidth / 2,
      dimensions.outsideWidth / 2,
    ]) {
      for (const x of [
        -dimensions.outsideLength / 2 + 6,
        dimensions.outsideLength / 2 - 20,
      ]) {
        base = unionAndDispose(
          base,
          tubeAlongX(module, 14, 3.2, 1.35, x, y, pinZ),
        );
      }
    }
  }

  if (parameters.closureType === "latch") {
    const receiverV = parameters.baseHeight / 2 - 2.2;
    for (const face of ["front", "back"] as const) {
      base = subtractAndDispose(
        base,
        createFaceCutter(
          module,
          face,
          0,
          receiverV,
          18,
          2.4,
          0.8,
          parameters,
          dimensions,
        ),
      );
    }
  }

  if (parameters.closureType === "spring-latch") {
    if (isRemovableFace("top")) {
      for (const [x, y] of getClosurePoints(
        dimensions.outsideLength,
        dimensions.outsideWidth,
        parameters.wallThickness,
      )) {
        const signX = x >= 0 ? 1 : -1;
        const signY = y >= 0 ? 1 : -1;
        base = unionAndDispose(
          base,
          cylinderAt(module, 4.2, 1.2, x, y, parameters.baseHeight - 1.2, 32),
        );
        base = unionAndDispose(
          base,
          cylinderAt(module, 1.1, 4.4, x, y, parameters.baseHeight - 0.1, 24),
        );
        base = unionAndDispose(
          base,
          centeredCubeAt(
            module,
            [10, 2.3, 2.2],
            x - signX * 4.4,
            y + signY * 3,
            parameters.baseHeight - 1.35,
          ),
        );
        base = unionAndDispose(
          base,
          centeredCubeAt(
            module,
            [2.2, 8, 2.2],
            x - signX * 9.1,
            y,
            parameters.baseHeight - 1.35,
          ),
        );
      }
    }
    for (const removableFace of removableFaces) {
      if (removableFace === "top" || removableFace === "bottom") continue;
      const [faceWidth, faceHeight] = getSolidFaceSize(
        removableFace,
        parameters,
        dimensions,
      );
      for (const [u, v] of getClosurePoints(
        faceWidth,
        faceHeight,
        parameters.wallThickness,
      )) {
        base = unionAndDispose(
          base,
          createFaceRail(
            module,
            removableFace,
            u,
            v,
            Math.min(12, faceWidth * 0.28),
            parameters,
            dimensions,
          ),
        );
      }
    }
  }

  if (
    parameters.standoffHeight > 0.5 &&
    parameters.pcbMountingType !== "rail-elastic"
  ) {
    for (const hole of getAssemblyMountingHoles(parameters, pcbReference)) {
      const bossHeight = parameters.standoffHeight + (hole.elevation ?? 0);
      if (bossHeight <= 0.5) continue;
      base = addBossWithPilotHole(
        module,
        base,
        hole.x,
        hole.y,
        interiorBottomZ,
        bossHeight,
        Math.max(3.2, hole.diameter / 2 + 1.4),
        Math.max(0.8, hole.diameter / 2 - 0.25),
      );
    }
  }

  if (parameters.closureType === "screw") {
    const bossHeight = Math.max(
      5,
      parameters.baseHeight - interiorBottomZ - 2,
    );
    for (const [x, y] of getClosurePoints(
      dimensions.outsideLength,
      dimensions.outsideWidth,
      parameters.wallThickness,
    )) {
      base =
        fastener.recessDepth === null
          ? addBossWithPilotHole(
              module,
              base,
              x,
              y,
              interiorBottomZ,
              bossHeight,
              fastener.bossDiameter / 2,
              fastener.recessDiameter / 2,
            )
          : addSolidBoss(
              module,
              base,
              x,
              y,
              interiorBottomZ,
              bossHeight,
              fastener.bossDiameter / 2,
            );
      if (fastener.recessDepth !== null) {
        const recessRadius =
          fastener.baseRecess === "hex-nut"
            ? fastener.recessDiameter / Math.sqrt(3)
            : fastener.recessDiameter / 2;
        const recess = cylinderAt(
          module,
          recessRadius,
          fastener.recessDepth,
          x,
          y,
          interiorBottomZ + bossHeight - fastener.recessDepth,
          fastener.baseRecess === "hex-nut" ? 6 : 32,
        );
        base = subtractAndDispose(base, recess);
      }
    }
  }

  if (parameters.closureType === "magnet") {
    base = addMagnetSupports(
      module,
      base,
      parameters,
      dimensions.outsideLength,
      dimensions.outsideWidth,
      interiorBottomZ,
    );
  }

  base = applyBasePanelFeatures(module, base, parameters, dimensions);

  for (const placement of parameters.connectorPlacements) {
    if (placement.surface === "panel") continue;
    const face = resolveConnectorFace(placement, parameters);
    if (face === "top" || isRemovableFace(face)) continue;
    const connector = getConnectorDefinition(placement.definitionId);
    if (!hasThroughPanelCutout(connector)) continue;
    const [width, height] = getRotatedCutoutSize(placement);
    base = subtractAndDispose(
      base,
      createFaceCutter(
        module,
        face,
        placement.offsetU,
        placement.offsetV,
        width,
        height,
        connector.panelCutout.shape === "circle"
          ? width / 2
          : connector.panelCutout.cornerRadius,
        parameters,
        dimensions,
      ),
    );
  }

  for (const placement of parameters.antennaPlacements) {
    const antenna = getAntennaDefinition(placement.definitionId);
    if (!antenna.enclosureCutout || placement.surface === "panel") continue;
    const face = resolveAntennaFace(placement, parameters);
    if (face === "top" || isRemovableFace(face)) continue;
    base = subtractAndDispose(
      base,
      createFaceCutter(
        module,
        face,
        placement.offsetU,
        placement.offsetV,
        placement.cutoutDiameter,
        placement.cutoutDiameter,
        placement.cutoutDiameter / 2,
        parameters,
        dimensions,
      ),
    );
  }

  return base;
}

function buildFlatLidFace(
  module: ManifoldToplevel,
  parameters: DesignerParameters,
): ManifoldSolid {
  const dimensions = deriveEnclosureDimensions(parameters);
  const face = parameters.lidFace;
  const [faceWidth, faceHeight] = getSolidFaceSize(face, parameters, dimensions);
  const cornerRadius =
    face === "top" || face === "bottom"
      ? parameters.cornerRadius
      : Math.min(parameters.cornerRadius, faceHeight / 2 - 0.1);
  let lid = extrudePlate(
    module,
    faceWidth,
    faceHeight,
    cornerRadius,
    parameters.lidThickness,
  );
  const cutDepth = parameters.lidThickness + 0.4;

  for (const placement of parameters.connectorPlacements) {
    if (placement.surface === "panel") continue;
    if (resolveConnectorFace(placement, parameters) !== face) continue;
    const connector = getConnectorDefinition(placement.definitionId);
    if (!hasThroughPanelCutout(connector)) continue;
    const [width, height] = getRotatedCutoutSize(placement);
    lid = subtractAndDispose(
      lid,
      createLocalLidCutout(
        module,
        placement.offsetU,
        placement.offsetV,
        width,
        height,
        connector.panelCutout.shape === "circle"
          ? width / 2
          : connector.panelCutout.cornerRadius,
        cutDepth,
      ),
    );
  }

  for (const placement of parameters.antennaPlacements) {
    const antenna = getAntennaDefinition(placement.definitionId);
    if (!antenna.enclosureCutout || placement.surface === "panel") continue;
    if (resolveAntennaFace(placement, parameters) !== face) continue;
    lid = subtractAndDispose(
      lid,
      createLocalLidCutout(
        module,
        placement.offsetU,
        placement.offsetV,
        placement.cutoutDiameter,
        placement.cutoutDiameter,
        placement.cutoutDiameter / 2,
        cutDepth,
      ),
    );
  }

  const fastener = getFastenerDefinition(parameters.closureFastenerId);
  const points = getClosurePoints(faceWidth, faceHeight, parameters.wallThickness);
  if (parameters.closureType === "screw") {
    const headRecessDepth = getClosureScrewHeadRecessDepth(parameters);
    for (const [u, v] of points) {
      lid = subtractAndDispose(
        lid,
        createLocalLidCutout(
          module,
          u,
          v,
          fastener.clearanceDiameter,
          fastener.clearanceDiameter,
          fastener.clearanceDiameter / 2,
          cutDepth,
        ),
      );
      if (headRecessDepth > 0) {
        lid = subtractAndDispose(
          lid,
          createLocalLidCutout(
            module,
            u,
            v,
            getClosureScrewHeadRecessRadius(fastener.clearanceDiameter) * 2,
            getClosureScrewHeadRecessRadius(fastener.clearanceDiameter) * 2,
            getClosureScrewHeadRecessRadius(fastener.clearanceDiameter),
            headRecessDepth + 0.1,
          ),
        );
      }
    }
  } else if (parameters.closureType === "magnet") {
    for (const [u, v] of points) {
      lid = subtractAndDispose(
        lid,
        createLocalLidCutout(
          module,
          u,
          v,
          MAGNET_GEOMETRY.pocketRadius * 2,
          MAGNET_GEOMETRY.pocketRadius * 2,
          MAGNET_GEOMETRY.pocketRadius,
          MAGNET_GEOMETRY.lidPocketDepth,
        ),
      );
    }
  } else if (parameters.closureType === "spring-latch") {
    for (const [u, v] of points) {
      const signU = u >= 0 ? 1 : -1;
      lid = unionAndDispose(
        lid,
        cylinderAt(module, 3.35, 0.75, u, v, -0.75, 32),
      );
      lid = unionAndDispose(
        lid,
        centeredCubeAt(module, [11, 3, 1.4], u - signU * 4.2, v, -0.7),
      );
    }
  }

  return lid;
}

function buildLid(
  module: ManifoldToplevel,
  parameters: DesignerParameters,
): ManifoldSolid {
  if (parameters.lidFace !== "top") return buildFlatLidFace(module, parameters);

  const dimensions = deriveEnclosureDimensions(parameters);
  const fastener = getFastenerDefinition(parameters.closureFastenerId);
  const innerRadius = Math.max(0.5, parameters.cornerRadius - parameters.wallThickness);
  const lipHeight = 2.2;
  const lipOuterLength = dimensions.insideLength - 0.45;
  const lipOuterWidth = dimensions.insideWidth - 0.45;
  let lid: ManifoldSolid;
  if (parameters.closureType === "slide") {
    const railLength = lipOuterLength - 6;
    lid = cubeAt(
      module,
      [railLength, 1.2, lipHeight],
      -railLength / 2,
      -lipOuterWidth / 2,
      0,
    );
    const secondRail = cubeAt(
      module,
      [railLength, 1.2, lipHeight],
      -railLength / 2,
      lipOuterWidth / 2 - 1.2,
      0,
    );
    lid = unionAndDispose(lid, secondRail);
  } else {
    lid = extrudeRing(
      module,
      lipOuterLength,
      lipOuterWidth,
      lipOuterLength - 2.2,
      lipOuterWidth - 2.2,
      innerRadius,
      Math.max(0.5, innerRadius - 1.1),
      lipHeight,
    );
  }

  let plate: ManifoldSolid;
  const topPanels = parameters.panelPlacements.filter((panel) => panel.face === "top");
  if (topPanels.length > 0) {
    let border = new module.CrossSection(
      roundedRectangle(
        dimensions.outsideLength,
        dimensions.outsideWidth,
        parameters.cornerRadius,
      ),
    );
    for (const panel of topPanels) {
      const inset = panel.insetDepth > 0;
      const [openingWidth, openingHeight] = getPanelOpeningSize(panel);
      const openingSource = new module.CrossSection(
        roundedRectangle(
          inset ? panel.width + 0.3 : openingWidth,
          inset ? panel.height + 0.3 : openingHeight,
          inset ? panel.cornerRadius + 0.15 : getPanelInnerCornerRadius(panel),
        ),
      );
      const opening = openingSource.translate(panel.offsetU, panel.offsetV);
      openingSource.delete();
      const nextBorder = border.subtract(opening);
      border.delete();
      opening.delete();
      border = nextBorder;
    }
    plate = border.extrude(parameters.lidThickness);
    border.delete();
    plate = translateAndDispose(plate, 0, 0, lipHeight);
  } else {
    plate = extrudePlate(
      module,
      dimensions.outsideLength,
      dimensions.outsideWidth,
      parameters.cornerRadius,
      parameters.lidThickness,
      lipHeight,
    );
  }
  lid = unionAndDispose(lid, plate);
  lid = applyBatteryCompartments(module, lid, parameters, "top", lipHeight);

  for (const panel of topPanels) {
    if (panel.insetDepth <= 0) continue;
    const [openingWidth, openingHeight] = getPanelOpeningSize(panel);
    let support = extrudeRing(
      module,
      panel.width + 0.3,
      panel.height + 0.3,
      openingWidth,
      openingHeight,
      panel.cornerRadius + 0.15,
      getPanelInnerCornerRadius(panel),
      parameters.lidThickness - panel.insetDepth,
      lipHeight,
    );
    support = translateAndDispose(support, panel.offsetU, panel.offsetV, 0);
    lid = unionAndDispose(lid, support);
  }

  for (const panel of topPanels) {
    if (panel.mountingType === "slide") {
      for (const y of [-panel.height / 2 - 1.2, panel.height / 2]) {
        const rail = cubeAt(
          module,
          [panel.width + 2, 1.2, 1.5],
          panel.offsetU - (panel.width + 2) / 2,
          panel.offsetV + y,
          lipHeight + parameters.lidThickness,
        );
        lid = unionAndDispose(lid, rail);
      }
    } else {
      for (const [x, y] of getPanelMountingPoints(panel)) {
        if (panel.mountingType === "screw") {
          const depth = parameters.lidThickness + 0.1;
          const bridge = getPanelScrewMountingTab(
            panel,
            x,
            y,
            PANEL_SCREW_TAB_RADIUS,
          );
          lid = unionAndDispose(
            lid,
            cubeAt(
              module,
              [bridge.width, bridge.height, depth],
              panel.offsetU + bridge.centerU - bridge.width / 2,
              panel.offsetV + bridge.centerV - bridge.height / 2,
              lipHeight - 0.05,
            ),
          );
          lid = subtractAndDispose(
            lid,
            cylinderAt(
              module,
              PANEL_SCREW_PILOT_RADIUS,
              depth + 0.2,
              panel.offsetU + x,
              panel.offsetV + y,
              lipHeight - 0.15,
            ),
          );
        } else if (panel.mountingType === "magnet") {
          const support = cubeAt(
            module,
            [8, 8, parameters.lidThickness],
            panel.offsetU + x - 4,
            panel.offsetV + y - 4,
            lipHeight,
          );
          lid = unionAndDispose(lid, support);
           const depth = getPanelMagnetPocketDepth(parameters.lidThickness);
          lid = subtractAndDispose(
            lid,
            cylinderAt(
              module,
              PANEL_MAGNET_RADIUS,
              depth,
              panel.offsetU + x,
              panel.offsetV + y,
              lipHeight + parameters.lidThickness - depth,
            ),
          );
        } else {
          const supportDepth = PANEL_SNAP_POST_DEPTH;
          const support = cubeAt(
            module,
            [7, 7, supportDepth + 0.1],
            panel.offsetU + x - 3.5,
            panel.offsetV + y - 3.5,
            lipHeight - supportDepth,
          );
          lid = unionAndDispose(lid, support);
          lid = subtractAndDispose(
            lid,
            cylinderAt(
              module,
              PANEL_SNAP_SOCKET_RADIUS,
              supportDepth + parameters.lidThickness + 0.4,
              panel.offsetU + x,
              panel.offsetV + y,
              lipHeight - supportDepth - 0.2,
            ),
          );
        }
      }
    }
  }

  const points = getClosurePoints(
    dimensions.outsideLength,
    dimensions.outsideWidth,
    parameters.wallThickness,
  );
  if (parameters.closureType === "screw") {
    const headRecessDepth = getClosureScrewHeadRecessDepth(parameters);
    for (const [x, y] of points) {
      const hole = cylinderAt(
        module,
        fastener.clearanceDiameter / 2,
        lipHeight + parameters.lidThickness + 2,
        x,
        y,
        -1,
      );
      lid = subtractAndDispose(lid, hole);
      if (headRecessDepth > 0) {
        const headPocket = cylinderAt(
          module,
          getClosureScrewHeadRecessRadius(fastener.clearanceDiameter),
          headRecessDepth + 0.1,
          x,
          y,
          lipHeight + parameters.lidThickness - headRecessDepth,
        );
        lid = subtractAndDispose(lid, headPocket);
      }
    }
  } else if (parameters.closureType === "magnet") {
    for (const [x, y] of points) {
      const pocket = cylinderAt(
        module,
        MAGNET_GEOMETRY.pocketRadius,
        MAGNET_GEOMETRY.lidPocketDepth,
        x,
        y,
        0,
      );
      lid = subtractAndDispose(lid, pocket);
    }
  } else if (parameters.closureType === "snap") {
    const frontTab = cubeAt(
      module,
      [10, 2.4, 4.5],
      -5,
      dimensions.outsideWidth / 2 - 2.4,
      0,
    );
    const backTab = cubeAt(
      module,
      [10, 2.4, 4.5],
      -5,
      -dimensions.outsideWidth / 2,
      0,
    );
    lid = unionAndDispose(lid, frontTab);
    lid = unionAndDispose(lid, backTab);
  } else if (parameters.closureType === "latch") {
    const tabHeight = 7;
    const frontTab = cubeAt(
      module,
      [16, 1.4, tabHeight],
      -8,
      dimensions.outsideWidth / 2 - 1.4,
      -3,
    );
    const backTab = cubeAt(
      module,
      [16, 1.4, tabHeight],
      -8,
      -dimensions.outsideWidth / 2,
      -3,
    );
    const frontHook = cubeAt(
      module,
      [18, 1.4, 1.2],
      -9,
      dimensions.outsideWidth / 2 - 0.2,
      -2.8,
    );
    const backHook = cubeAt(
      module,
      [18, 1.4, 1.2],
      -9,
      -dimensions.outsideWidth / 2 - 1.2,
      -2.8,
    );
    lid = unionAndDispose(lid, frontTab);
    lid = unionAndDispose(lid, backTab);
    lid = unionAndDispose(lid, frontHook);
    lid = unionAndDispose(lid, backHook);
  } else if (parameters.closureType === "spring-latch") {
    for (const [x, y] of points) {
      const signX = x >= 0 ? 1 : -1;
      lid = unionAndDispose(
        lid,
        cylinderAt(module, 3.35, 0.75, x, y, -0.75, 32),
      );
      lid = unionAndDispose(
        lid,
        centeredCubeAt(module, [11, 3, 1.4], x - signX * 4.2, y, -0.7),
      );
    }
  } else if (parameters.closureType === "slide") {
    const stop = cubeAt(
      module,
      [4, dimensions.insideWidth - 6, 2.8],
      dimensions.insideLength / 2 - 4,
      -(dimensions.insideWidth - 6) / 2,
      0,
    );
    lid = unionAndDispose(lid, stop);
  } else if (parameters.closureType === "hinge") {
    lid = unionAndDispose(
      lid,
      tubeAlongX(
        module,
        20,
        3.2,
        1.35,
        -10,
        -dimensions.outsideWidth / 2,
        1.4,
      ),
    );
  } else if (parameters.closureType === "pin") {
    for (const y of [
      -dimensions.outsideWidth / 2,
      dimensions.outsideWidth / 2,
    ]) {
      lid = unionAndDispose(
        lid,
        tubeAlongX(module, 20, 3.2, 1.35, -10, y, 1.4),
      );
    }
  }

  for (const placement of parameters.connectorPlacements) {
    if (placement.surface === "panel") continue;
    if (resolveConnectorFace(placement, parameters) !== "top") continue;
    const connector = getConnectorDefinition(placement.definitionId);
    if (!hasThroughPanelCutout(connector)) continue;
    const [width, height] = getRotatedCutoutSize(placement);
    lid = subtractAndDispose(
      lid,
      createTopCutter(
        module,
        placement.offsetU,
        placement.offsetV,
        width,
        height,
        connector.panelCutout.shape === "circle"
          ? width / 2
          : connector.panelCutout.cornerRadius,
        parameters,
        lipHeight,
      ),
    );
  }
  for (const placement of parameters.antennaPlacements) {
    const antenna = getAntennaDefinition(placement.definitionId);
    if (
      !antenna.enclosureCutout ||
      placement.surface === "panel" ||
      resolveAntennaFace(placement, parameters) !== "top"
    ) continue;
    lid = subtractAndDispose(
      lid,
      createTopCutter(
        module,
        placement.offsetU,
        placement.offsetV,
        placement.cutoutDiameter,
        placement.cutoutDiameter,
        placement.cutoutDiameter / 2,
        parameters,
        lipHeight,
      ),
    );
  }
  return lid;
}

function buildPanel(
  module: ManifoldToplevel,
  parameters: DesignerParameters,
  panelId: string | null,
): ManifoldSolid {
  const selectedPanel = getPanelPlacement(parameters, panelId);
  if (!selectedPanel) throw new Error("当前设计没有可导出的面板");
  let panel = extrudePlate(
    module,
    selectedPanel.width,
    selectedPanel.height,
    selectedPanel.cornerRadius,
    selectedPanel.thickness,
  );
  if (selectedPanel.mountingType !== "slide") {
    for (const [x, y] of getPanelMountingPoints(selectedPanel)) {
      if (selectedPanel.mountingType === "screw") {
        panel = subtractAndDispose(
          panel,
          cylinderAt(
            module,
            PANEL_SCREW_CLEARANCE_RADIUS,
            selectedPanel.thickness + 0.4,
            x,
            y,
            -0.2,
          ),
        );
        const headRecessDepth = getPanelScrewHeadRecessDepth(selectedPanel);
        if (headRecessDepth > 0) {
          panel = subtractAndDispose(
            panel,
            cylinderAt(
              module,
              PANEL_SCREW_HEAD_RECESS_RADIUS,
              headRecessDepth + 0.1,
              x,
              y,
              selectedPanel.thickness - headRecessDepth,
            ),
          );
        }
      } else if (selectedPanel.mountingType === "magnet") {
        const pocketDepth = getPanelMagnetPocketDepth(selectedPanel.thickness);
        panel = subtractAndDispose(
          panel,
          cylinderAt(
            module,
            PANEL_MAGNET_RADIUS,
            pocketDepth + 0.1,
            x,
            y,
            -0.1,
          ),
        );
      } else {
        panel = unionAndDispose(
          panel,
          cylinderAt(
            module,
            PANEL_SNAP_POST_RADIUS,
            PANEL_SNAP_POST_DEPTH,
            x,
            y,
            -PANEL_SNAP_POST_DEPTH,
          ),
        );
        let lip = module.Manifold.cylinder(
          PANEL_SNAP_LIP_DEPTH,
          PANEL_SNAP_LIP_RADIUS,
          PANEL_SNAP_POST_RADIUS,
          32,
          false,
        );
        lip = translateAndDispose(
          lip,
          x,
          y,
          -PANEL_SNAP_POST_DEPTH - PANEL_SNAP_LIP_DEPTH + 0.2,
        );
        panel = unionAndDispose(panel, lip);
      }
    }
  }
  for (const placement of parameters.connectorPlacements) {
    if (
      placement.surface !== "panel" ||
      placement.panelId !== selectedPanel.id
    ) continue;
    const connector = getConnectorDefinition(placement.definitionId);
    if (!hasThroughPanelCutout(connector)) continue;
    const [width, height] = getRotatedCutoutSize(placement);
    let cutter =
      connector.panelCutout.shape === "circle"
        ? cylinderAt(
            module,
            width / 2,
            selectedPanel.thickness + 0.4,
            placement.offsetU,
            placement.offsetV,
            -0.2,
          )
        : extrudePlate(
            module,
            width,
            height,
            connector.panelCutout.cornerRadius,
            selectedPanel.thickness + 0.4,
            -0.2,
          );
    if (connector.panelCutout.shape !== "circle") {
      cutter = translateAndDispose(
        cutter,
        placement.offsetU,
        placement.offsetV,
        0,
      );
    }
    panel = subtractAndDispose(panel, cutter);
  }
  for (const placement of parameters.connectorPlacements) {
    if (
      placement.surface !== "panel" ||
      placement.panelId !== selectedPanel.id ||
      placement.displayMountingType !== "screw"
    ) continue;
    const connector = getConnectorDefinition(placement.definitionId);
    if (!connector.displaySpec || !supportsDisplayScrewMounting(connector)) {
      continue;
    }
    const bossRadius = 2.55;
    const bossDepth = Math.max(2.8, Math.min(5, connector.visualGeometry.depth - 0.6));
    const safeU = selectedPanel.width / 2 - bossRadius - 0.4;
    const safeV = selectedPanel.height / 2 - bossRadius - 0.4;
    for (const [localU, localV] of getDisplayMountingPoints(
      connector.displaySpec.pcbWidth,
      connector.displaySpec.pcbHeight,
    )) {
      const [rotatedU, rotatedV] = rotateLocalPoint(
        localU,
        localV,
        placement.rotation,
      );
      const x = placement.offsetU + rotatedU;
      const y = placement.offsetV + rotatedV;
      if (Math.abs(x) > safeU || Math.abs(y) > safeV) continue;
      panel = addBossWithPilotHole(
        module,
        panel,
        x,
        y,
        -bossDepth,
        bossDepth,
        bossRadius,
        PANEL_SCREW_PILOT_RADIUS,
      );
    }
  }
  for (const placement of parameters.antennaPlacements) {
    if (placement.surface !== "panel" || placement.panelId !== selectedPanel.id) {
      continue;
    }
    const antenna = getAntennaDefinition(placement.definitionId);
    if (!antenna.enclosureCutout || placement.cutoutDiameter <= 0) continue;
    panel = subtractAndDispose(
      panel,
      cylinderAt(
        module,
        placement.cutoutDiameter / 2,
        selectedPanel.thickness + 0.4,
        placement.offsetU,
        placement.offsetV,
        -0.2,
      ),
    );
  }
  return panel;
}

export function buildSolidPart(
  module: ManifoldToplevel,
  parameters: DesignerParameters,
  part: SolidPart,
  pcbReference: PcbReference | null = null,
  panelId: string | null = null,
): ManifoldSolid {
  if (part === "base") return buildBase(module, parameters, pcbReference);
  if (part === "lid") return buildLid(module, parameters);
  return buildPanel(module, parameters, panelId);
}
