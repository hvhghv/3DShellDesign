import type {
  Manifold as ManifoldSolid,
  ManifoldToplevel,
  SimplePolygon,
} from "manifold-3d";
import { deriveEnclosureDimensions, getPanelMountingPoints } from "../domain/enclosure";
import type { DesignerParameters, PcbReference } from "../domain/model";
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

function closurePoints(
  outsideLength: number,
  outsideWidth: number,
  wallThickness: number,
): Array<[number, number]> {
  const x = outsideLength / 2 - wallThickness - 4.5;
  const y = outsideWidth / 2 - wallThickness - 4.5;
  return [
    [-x, -y],
    [x, -y],
    [-x, y],
    [x, y],
  ];
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
    for (const [x, y] of closurePoints(
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
    for (const [x, y] of closurePoints(
      dimensions.outsideLength,
      dimensions.outsideWidth,
      parameters.wallThickness,
    )) {
      const support = cylinderAt(
        module,
        4.4,
        3,
        x,
        y,
        parameters.baseHeight - 3,
      );
      base = unionAndDispose(base, support);
      const pocket = cylinderAt(
        module,
        3.15,
        2,
        x,
        y,
        parameters.baseHeight - 1.8,
      );
      base = subtractAndDispose(base, pocket);
    }
  }

  if (parameters.typeCPortEnabled) {
    const connector = getConnectorDefinition(parameters.connectorDefinitionId);
    const portCenterZ =
      parameters.bottomThickness +
      parameters.standoffHeight +
      parameters.pcbThickness / 2 +
      connector.placementAnchor.heightAboveBoardCenter;
    let cutter: ManifoldSolid;
    if (connector.panelCutout.shape === "circle") {
      cutter = module.Manifold.cylinder(
        parameters.wallThickness * 3,
        parameters.typeCPortWidth / 2,
        parameters.typeCPortWidth / 2,
        32,
        false,
      );
      cutter = rotateAndDispose(cutter, 90, 0, 0);
      cutter = translateAndDispose(
        cutter,
        parameters.typeCPortOffset,
        dimensions.outsideWidth / 2 + parameters.wallThickness,
        portCenterZ,
      );
    } else {
      cutter = cubeAt(
        module,
        [
          parameters.typeCPortWidth,
          parameters.wallThickness * 3,
          parameters.typeCPortHeight,
        ],
        parameters.typeCPortOffset - parameters.typeCPortWidth / 2,
        dimensions.outsideWidth / 2 - parameters.wallThickness,
        portCenterZ - parameters.typeCPortHeight / 2,
      );
    }
    base = subtractAndDispose(base, cutter);
  }

  if (parameters.antennaEnabled) {
    const antenna = getAntennaDefinition(parameters.antennaDefinitionId);
    if (antenna.enclosureCutout) {
      const antennaCenterZ =
        parameters.bottomThickness +
        parameters.standoffHeight +
        parameters.pcbThickness / 2 +
        antenna.heightAboveBoardCenter;
      let cutter = module.Manifold.cylinder(
        parameters.wallThickness * 3,
        antenna.enclosureCutout.diameter / 2,
        antenna.enclosureCutout.diameter / 2,
        32,
        false,
      );
      cutter = rotateAndDispose(cutter, -90, 0, 0);
      cutter = translateAndDispose(
        cutter,
        parameters.antennaOffset,
        -dimensions.outsideWidth / 2 - parameters.wallThickness,
        antennaCenterZ,
      );
      base = subtractAndDispose(base, cutter);
    }
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
  if (parameters.panelEnabled) {
    const outer = new module.CrossSection(
      roundedRectangle(
        dimensions.outsideLength,
        dimensions.outsideWidth,
        parameters.cornerRadius,
      ),
    );
    const opening = new module.CrossSection(
      roundedRectangle(
        dimensions.panelLength - 4,
        dimensions.panelWidth - 4,
        3.5,
      ),
    );
    const border = outer.subtract(opening);
    outer.delete();
    opening.delete();
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

  if (parameters.panelEnabled) {
    if (parameters.panelMountingType === "slide") {
      for (const y of [
        -dimensions.panelWidth / 2 - 1.2,
        dimensions.panelWidth / 2,
      ]) {
        const rail = cubeAt(
          module,
          [dimensions.panelLength + 2, 1.2, 1.5],
          -(dimensions.panelLength + 2) / 2,
          y,
          lipHeight + parameters.lidThickness,
        );
        lid = unionAndDispose(lid, rail);
      }
    } else {
      for (const [x, y] of getPanelMountingPoints(parameters)) {
        const support = cubeAt(
          module,
          [8, 8, parameters.lidThickness],
          x - 4,
          y - 4,
          lipHeight,
        );
        lid = unionAndDispose(lid, support);
        const radius = parameters.panelMountingType === "screw" ? 1.3 : 2.15;
        const depth =
          parameters.panelMountingType === "screw"
            ? parameters.lidThickness + 0.4
            : Math.min(1.2, parameters.lidThickness);
        const z =
          parameters.panelMountingType === "screw"
            ? lipHeight - 0.2
            : lipHeight + parameters.lidThickness - depth;
        lid = subtractAndDispose(
          lid,
          cylinderAt(module, radius, depth, x, y, z),
        );
      }
    }
  }

  const points = closurePoints(
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
      const pocket = cylinderAt(module, 3.15, 1.9, x, y, 0);
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
  return lid;
}

function buildPanel(
  module: ManifoldToplevel,
  parameters: DesignerParameters,
): ManifoldSolid {
  if (!parameters.panelEnabled) {
    throw new Error("当前设计未启用独立面板");
  }
  const dimensions = deriveEnclosureDimensions(parameters);
  let panel = extrudePlate(
    module,
    dimensions.panelLength,
    dimensions.panelWidth,
    3.2,
    parameters.panelThickness,
  );
  if (parameters.panelMountingType !== "slide") {
    const radius = parameters.panelMountingType === "screw" ? 1.3 : 2.15;
    const depth = parameters.panelThickness + 0.4;
    const z = -0.2;
    for (const [x, y] of getPanelMountingPoints(parameters)) {
      panel = subtractAndDispose(
        panel,
        cylinderAt(module, radius, depth, x, y, z),
      );
    }
  }
  return panel;
}

export function buildSolidPart(
  module: ManifoldToplevel,
  parameters: DesignerParameters,
  part: SolidPart,
  pcbReference: PcbReference | null = null,
): ManifoldSolid {
  if (part === "base") return buildBase(module, parameters, pcbReference);
  if (part === "lid") return buildLid(module, parameters);
  return buildPanel(module, parameters);
}
