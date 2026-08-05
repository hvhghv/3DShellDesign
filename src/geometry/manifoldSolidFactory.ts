import type {
  Manifold as ManifoldSolid,
  ManifoldToplevel,
  SimplePolygon,
} from "manifold-3d";
import { deriveEnclosureDimensions, getPanelMountingPoints } from "../domain/enclosure";
import type {
  DesignerParameters,
  EnclosureDimensions,
  EnclosureFace,
  PcbReference,
} from "../domain/model";
import { getClosurePoints, MAGNET_GEOMETRY } from "../domain/magnetSupport";
import {
  getPanelPlacement,
  getRotatedCutoutSize,
  resolveAntennaFace,
  resolveConnectorFace,
} from "../domain/placements";
import { getCenteredMountingHoles } from "../domain/pcbReference";
import { getVentPatternPoints } from "../domain/patterns";
import {
  getAntennaDefinition,
  getConnectorDefinition,
  getFastenerDefinition,
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

function addMagnetSupports(
  module: ManifoldToplevel,
  source: ManifoldSolid,
  parameters: DesignerParameters,
  outsideLength: number,
  outsideWidth: number,
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
        const columnBottom = Math.max(0, parameters.bottomThickness - 0.2);
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
    result = subtractAndDispose(
      result,
      createFaceCutter(
        module,
        face,
        panel.offsetU,
        panel.offsetV,
        panel.width - 4,
        panel.height - 4,
        3.5,
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
      const radius = panel.mountingType === "screw" ? 1.3 : 2.15;
      for (const [pointU, pointV] of getPanelMountingPoints(panel)) {
        result = subtractAndDispose(
          result,
          createFaceCutter(
            module,
            face,
            panel.offsetU + pointU,
            panel.offsetV + pointV,
            radius * 2,
            radius * 2,
            radius,
            parameters,
            dimensions,
          ),
        );
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

function buildBase(
  module: ManifoldToplevel,
  parameters: DesignerParameters,
  pcbReference: PcbReference | null,
): ManifoldSolid {
  const dimensions = deriveEnclosureDimensions(parameters);
  const fastener = getFastenerDefinition(parameters.closureFastenerId);
  const wallHeight = parameters.baseHeight - parameters.bottomThickness;
  if (wallHeight <= 0.5) {
    throw new Error("下壳高度必须大于底板厚度");
  }
  const innerRadius = Math.max(0.5, parameters.cornerRadius - parameters.wallThickness);
  let base = extrudePlate(
    module,
    dimensions.outsideLength,
    dimensions.outsideWidth,
    parameters.cornerRadius,
    parameters.bottomThickness,
  );
  const wall = extrudeRing(
    module,
    dimensions.outsideLength,
    dimensions.outsideWidth,
    dimensions.insideLength,
    dimensions.insideWidth,
    parameters.cornerRadius,
    innerRadius,
    wallHeight,
    parameters.bottomThickness,
  );
  base = unionAndDispose(base, wall);
  base = applyVentPattern(module, base, parameters);

  if (parameters.enclosureTemplateId === "wall-mount") {
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

  if (parameters.standoffHeight > 0.5) {
    for (const hole of getCenteredMountingHoles(parameters, pcbReference)) {
      base = addBossWithPilotHole(
        module,
        base,
        hole.x,
        hole.y,
        parameters.bottomThickness,
        parameters.standoffHeight,
        Math.max(3.2, hole.diameter / 2 + 1.4),
        Math.max(0.8, hole.diameter / 2 - 0.25),
      );
    }
  }

  if (parameters.closureType === "screw") {
    const bossHeight = Math.max(
      5,
      parameters.baseHeight - parameters.bottomThickness - 2,
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
              parameters.bottomThickness,
              bossHeight,
              fastener.bossDiameter / 2,
              fastener.recessDiameter / 2,
            )
          : addSolidBoss(
              module,
              base,
              x,
              y,
              parameters.bottomThickness,
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
          parameters.bottomThickness + bossHeight - fastener.recessDepth,
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
    );
  }

  base = applyBasePanelFeatures(module, base, parameters, dimensions);

  for (const placement of parameters.connectorPlacements) {
    if (placement.surface === "panel") continue;
    const face = resolveConnectorFace(placement, parameters);
    if (face === "top") continue;
    const connector = getConnectorDefinition(placement.definitionId);
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
    if (face === "top") continue;
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

function buildLid(
  module: ManifoldToplevel,
  parameters: DesignerParameters,
): ManifoldSolid {
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
      const openingSource = new module.CrossSection(
        roundedRectangle(panel.width - 4, panel.height - 4, 3.5),
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
        const support = cubeAt(
          module,
          [8, 8, parameters.lidThickness],
          panel.offsetU + x - 4,
          panel.offsetV + y - 4,
          lipHeight,
        );
        lid = unionAndDispose(lid, support);
        const radius = panel.mountingType === "screw" ? 1.3 : 2.15;
        const depth =
          panel.mountingType === "screw"
            ? parameters.lidThickness + 0.4
            : Math.min(1.2, parameters.lidThickness);
        const z =
          panel.mountingType === "screw"
            ? lipHeight - 0.2
            : lipHeight + parameters.lidThickness - depth;
        lid = subtractAndDispose(
          lid,
            cylinderAt(
              module,
              radius,
              depth,
              panel.offsetU + x,
              panel.offsetV + y,
              z,
            ),
        );
      }
    }
  }

  const points = getClosurePoints(
    dimensions.outsideLength,
    dimensions.outsideWidth,
    parameters.wallThickness,
  );
  if (parameters.closureType === "screw") {
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
  }

  for (const placement of parameters.connectorPlacements) {
    if (placement.surface === "panel") continue;
    if (resolveConnectorFace(placement, parameters) !== "top") continue;
    const connector = getConnectorDefinition(placement.definitionId);
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
    3.2,
    selectedPanel.thickness,
  );
  if (selectedPanel.mountingType !== "slide") {
    const radius = selectedPanel.mountingType === "screw" ? 1.3 : 2.15;
    const depth = selectedPanel.thickness + 0.4;
    const z = -0.2;
    for (const [x, y] of getPanelMountingPoints(selectedPanel)) {
      panel = subtractAndDispose(
        panel,
        cylinderAt(module, radius, depth, x, y, z),
      );
    }
  }
  for (const placement of parameters.connectorPlacements) {
    if (
      placement.surface !== "panel" ||
      placement.panelId !== selectedPanel.id
    ) continue;
    const connector = getConnectorDefinition(placement.definitionId);
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
