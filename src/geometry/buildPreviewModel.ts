import * as THREE from "three";
import { deriveEnclosureDimensions, getPanelMountingPoints } from "../domain/enclosure";
import { getMaterial } from "../domain/materials";
import { getClosurePoints, MAGNET_GEOMETRY } from "../domain/magnetSupport";
import type {
  DesignerParameters,
  EnclosureDimensions,
  EnclosureFace,
  PcbReference,
  SelectablePart,
  StepPreview,
} from "../domain/model";
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

const EDGE_COLOR = 0x333936;

function createRoundedShape(width: number, depth: number, radius: number): THREE.Shape {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const safeRadius = Math.min(radius, halfWidth - 0.01, halfDepth - 0.01);
  const shape = new THREE.Shape();

  shape.moveTo(-halfWidth + safeRadius, -halfDepth);
  shape.lineTo(halfWidth - safeRadius, -halfDepth);
  shape.quadraticCurveTo(halfWidth, -halfDepth, halfWidth, -halfDepth + safeRadius);
  shape.lineTo(halfWidth, halfDepth - safeRadius);
  shape.quadraticCurveTo(halfWidth, halfDepth, halfWidth - safeRadius, halfDepth);
  shape.lineTo(-halfWidth + safeRadius, halfDepth);
  shape.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth, halfDepth - safeRadius);
  shape.lineTo(-halfWidth, -halfDepth + safeRadius);
  shape.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth + safeRadius, -halfDepth);
  shape.closePath();

  return shape;
}

function createRoundedHole(
  width: number,
  depth: number,
  radius: number,
  offsetX = 0,
  offsetY = 0,
): THREE.Path {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const safeRadius = Math.min(radius, halfWidth - 0.01, halfDepth - 0.01);
  const hole = new THREE.Path();

  hole.moveTo(offsetX - halfWidth + safeRadius, offsetY - halfDepth);
  hole.quadraticCurveTo(offsetX - halfWidth, offsetY - halfDepth, offsetX - halfWidth, offsetY - halfDepth + safeRadius);
  hole.lineTo(offsetX - halfWidth, offsetY + halfDepth - safeRadius);
  hole.quadraticCurveTo(offsetX - halfWidth, offsetY + halfDepth, offsetX - halfWidth + safeRadius, offsetY + halfDepth);
  hole.lineTo(offsetX + halfWidth - safeRadius, offsetY + halfDepth);
  hole.quadraticCurveTo(offsetX + halfWidth, offsetY + halfDepth, offsetX + halfWidth, offsetY + halfDepth - safeRadius);
  hole.lineTo(offsetX + halfWidth, offsetY - halfDepth + safeRadius);
  hole.quadraticCurveTo(offsetX + halfWidth, offsetY - halfDepth, offsetX + halfWidth - safeRadius, offsetY - halfDepth);
  hole.lineTo(offsetX - halfWidth + safeRadius, offsetY - halfDepth);
  hole.closePath();

  return hole;
}

function createExtrudedGeometry(shape: THREE.Shape, height: number): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: false,
    curveSegments: 12,
  });
  geometry.center();
  geometry.rotateX(-Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createPlateGeometry(
  width: number,
  depth: number,
  height: number,
  radius: number,
): THREE.ExtrudeGeometry {
  return createExtrudedGeometry(createRoundedShape(width, depth, radius), height);
}

function orientGeometryToFace(
  geometry: THREE.BufferGeometry,
  face: EnclosureFace,
): THREE.BufferGeometry {
  if (face === "back") geometry.rotateY(Math.PI);
  else if (face === "right") geometry.rotateY(Math.PI / 2);
  else if (face === "left") geometry.rotateY(-Math.PI / 2);
  else if (face === "top") geometry.rotateX(-Math.PI / 2);
  else if (face === "bottom") geometry.rotateX(Math.PI / 2);
  return geometry;
}

function createFacePlateGeometry(
  width: number,
  height: number,
  thickness: number,
  radius: number,
  face: EnclosureFace,
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(
    createRoundedShape(width, height, radius),
    {
      depth: thickness,
      bevelEnabled: false,
      curveSegments: 12,
    },
  );
  geometry.center();
  orientGeometryToFace(geometry, face);
  geometry.computeVertexNormals();
  return geometry;
}

function createFaceBoxGeometry(
  width: number,
  height: number,
  depth: number,
  face: EnclosureFace,
): THREE.BoxGeometry {
  return orientGeometryToFace(
    new THREE.BoxGeometry(width, height, depth),
    face,
  ) as THREE.BoxGeometry;
}

function createFaceCylinderGeometry(
  radius: number,
  depth: number,
  face: EnclosureFace,
  segments = 28,
): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(radius, radius, depth, segments);
  geometry.rotateX(Math.PI / 2);
  return orientGeometryToFace(geometry, face) as THREE.CylinderGeometry;
}

function createFacePlaneGeometry(
  width: number,
  height: number,
  face: EnclosureFace,
): THREE.PlaneGeometry {
  return orientGeometryToFace(
    new THREE.PlaneGeometry(width, height),
    face,
  ) as THREE.PlaneGeometry;
}

function createFaceDiskGeometry(
  radius: number,
  face: EnclosureFace,
): THREE.CircleGeometry {
  return orientGeometryToFace(
    new THREE.CircleGeometry(radius, 32),
    face,
  ) as THREE.CircleGeometry;
}

function getPreviewFacePosition(
  face: EnclosureFace,
  u: number,
  v: number,
  normalOffset: number,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
  lidY: number,
): [number, number, number] {
  if (face === "top") {
    return [u, lidY + parameters.lidThickness + normalOffset, v];
  }
  if (face === "bottom") return [u, -normalOffset, v];
  if (face === "front") {
    return [u, parameters.baseHeight / 2 + v, dimensions.outsideWidth / 2 + normalOffset];
  }
  if (face === "back") {
    return [u, parameters.baseHeight / 2 + v, -dimensions.outsideWidth / 2 - normalOffset];
  }
  if (face === "right") {
    return [dimensions.outsideLength / 2 + normalOffset, parameters.baseHeight / 2 + v, u];
  }
  return [-dimensions.outsideLength / 2 - normalOffset, parameters.baseHeight / 2 + v, u];
}

function relativePosition(
  position: readonly [number, number, number],
  origin: readonly [number, number, number],
): [number, number, number] {
  return [
    position[0] - origin[0],
    position[1] - origin[1],
    position[2] - origin[2],
  ];
}

function createRingGeometry(
  outerWidth: number,
  outerDepth: number,
  innerWidth: number,
  innerDepth: number,
  height: number,
  outerRadius: number,
  innerRadius: number,
): THREE.ExtrudeGeometry {
  const shape = createRoundedShape(outerWidth, outerDepth, outerRadius);
  shape.holes.push(createRoundedHole(innerWidth, innerDepth, innerRadius));
  return createExtrudedGeometry(shape, height);
}

function standardMaterial(
  color: THREE.ColorRepresentation,
  selected: boolean,
  options?: Partial<THREE.MeshStandardMaterialParameters>,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.04,
    emissive: selected ? 0x42785d : 0x000000,
    emissiveIntensity: selected ? 0.2 : 0,
    side: THREE.DoubleSide,
    ...options,
  });
}

function addMesh(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  partId: SelectablePart,
  position: [number, number, number],
  showEdges = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.partId = partId;
  group.add(mesh);

  if (showEdges) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 28),
      new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.46 }),
    );
    edges.position.copy(mesh.position);
    edges.userData.partId = partId;
    group.add(edges);
  }

  return mesh;
}

function addPreviewOutline(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opacity: number,
  partId: SelectablePart,
  position: [number, number, number],
): THREE.LineSegments {
  const outlineGeometry = new THREE.EdgesGeometry(geometry, 28);
  geometry.dispose();
  const outline = new THREE.LineSegments(
    outlineGeometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthTest: false,
      depthWrite: false,
    }),
  );
  outline.position.set(...position);
  outline.renderOrder = 6;
  outline.userData.partId = partId;
  group.add(outline);
  return outline;
}

function addCylinder(
  group: THREE.Group,
  radius: number,
  height: number,
  position: [number, number, number],
  material: THREE.Material,
  partId: SelectablePart,
  segments = 24,
): THREE.Mesh {
  return addMesh(
    group,
    new THREE.CylinderGeometry(radius, radius, height, segments),
    material,
    partId,
    position,
  );
}

function addClosureFeatures(
  root: THREE.Group,
  parameters: DesignerParameters,
  selectedPart: SelectablePart,
  lidY: number,
  outerLength: number,
  outerWidth: number,
): void {
  const points = getClosurePoints(
    outerLength,
    outerWidth,
    parameters.wallThickness,
  );

  if (parameters.closureType === "screw") {
    const fastener = getFastenerDefinition(parameters.closureFastenerId);
    const bossMaterial = standardMaterial(
      getMaterial(parameters.shellMaterialId).color,
      selectedPart === "base",
    );
    const screwMaterial = standardMaterial(0x48514e, selectedPart === "lid", {
      metalness: 0.62,
      roughness: 0.28,
    });
    for (const [pointX, pointZ] of points) {
      const bossHeight = Math.max(5, parameters.baseHeight - parameters.bottomThickness - 2);
      addCylinder(
        root,
        fastener.bossDiameter / 2,
        bossHeight,
        [pointX, parameters.bottomThickness + bossHeight / 2, pointZ],
        bossMaterial,
        "base",
      );
      addCylinder(
        root,
        fastener.clearanceDiameter / 2,
        parameters.lidThickness + 0.5,
        [pointX, lidY + parameters.lidThickness / 2 + 0.2, pointZ],
        screwMaterial,
        "lid",
      );
    }
  }

  if (parameters.closureType === "magnet") {
    const geometry = MAGNET_GEOMETRY;
    const supportMaterial = standardMaterial(
      getMaterial(parameters.shellMaterialId).color,
      selectedPart === "base",
    );
    const baseMagnetMaterial = standardMaterial(0xc9933d, selectedPart === "base", {
      metalness: 0.72,
      roughness: 0.24,
    });
    const lidMagnetMaterial = standardMaterial(0xc9933d, selectedPart === "lid", {
      metalness: 0.72,
      roughness: 0.24,
    });

    if (parameters.magnetSupportType === "perimeter-flange") {
      const edgeOffset = parameters.wallThickness - geometry.wallOverlap;
      const support = addMesh(
        root,
        createRingGeometry(
          outerLength - edgeOffset * 2,
          outerWidth - edgeOffset * 2,
          outerLength - edgeOffset * 2 - geometry.perimeterFlangeWidth * 2,
          outerWidth - edgeOffset * 2 - geometry.perimeterFlangeWidth * 2,
          geometry.supportThickness,
          Math.max(0.5, parameters.cornerRadius - edgeOffset),
          Math.max(
            0.5,
            parameters.cornerRadius - edgeOffset - geometry.perimeterFlangeWidth,
          ),
        ),
        supportMaterial,
        "base",
        [0, parameters.baseHeight - geometry.supportThickness / 2, 0],
      );
      support.name = "magnet-support-perimeter-flange";
    }

    for (const [pointX, pointZ] of points) {
      if (parameters.magnetSupportType === "floor-column") {
        const height = parameters.baseHeight - parameters.bottomThickness;
        const support = addCylinder(
          root,
          geometry.floorColumnRadius,
          height,
          [pointX, parameters.bottomThickness + height / 2, pointZ],
          supportMaterial,
          "base",
        );
        support.name = "magnet-support-floor-column";
      } else if (parameters.magnetSupportType === "wall-bracket") {
        const shelf = addMesh(
          root,
          new THREE.BoxGeometry(
            geometry.wallBracketWidth,
            geometry.supportThickness,
            geometry.supportSize,
          ),
          supportMaterial,
          "base",
          [
            pointX,
            parameters.baseHeight - geometry.supportThickness / 2,
            pointZ,
          ],
        );
        shelf.name = "magnet-support-wall-bracket";
        const rib = addMesh(
          root,
          new THREE.BoxGeometry(
            geometry.wallBracketRibThickness,
            geometry.supportThickness + geometry.wallBracketRibDrop,
            geometry.supportSize,
          ),
          supportMaterial,
          "base",
          [
            pointX,
            parameters.baseHeight -
              (geometry.supportThickness + geometry.wallBracketRibDrop) / 2,
            pointZ,
          ],
        );
        rib.name = "magnet-support-wall-bracket-rib";
      } else if (parameters.magnetSupportType === "corner-shelf") {
        const support = addMesh(
          root,
          new THREE.BoxGeometry(
            geometry.supportSize,
            geometry.supportThickness,
            geometry.supportSize,
          ),
          supportMaterial,
          "base",
          [
            pointX,
            parameters.baseHeight - geometry.supportThickness / 2,
            pointZ,
          ],
        );
        support.name = "magnet-support-corner-shelf";
      }

      const baseMagnet = addCylinder(
        root,
        geometry.diameter / 2,
        geometry.thickness,
        [pointX, parameters.baseHeight - geometry.thickness / 2 + 0.02, pointZ],
        baseMagnetMaterial,
        "base",
      );
      baseMagnet.name = "base-magnet";
      const lidMagnet = addCylinder(
        root,
        geometry.diameter / 2,
        geometry.thickness,
        [pointX, lidY + geometry.thickness / 2 - 0.02, pointZ],
        lidMagnetMaterial,
        "lid",
      );
      lidMagnet.name = "lid-magnet";
    }
  }

  if (parameters.closureType === "snap") {
    const tabMaterial = standardMaterial(
      getMaterial(parameters.shellMaterialId).color,
      selectedPart === "lid",
    );
    const tabGeometry = new THREE.BoxGeometry(10, 4.5, 2.2);
    addMesh(root, tabGeometry, tabMaterial, "lid", [0, lidY - 1.7, outerWidth / 2 - 1.1]);
    addMesh(
      root,
      tabGeometry.clone(),
      tabMaterial,
      "lid",
      [0, lidY - 1.7, -outerWidth / 2 + 1.1],
    );
  }

  if (parameters.closureType === "slide") {
    const railMaterial = standardMaterial(
      getMaterial(parameters.shellMaterialId).color,
      selectedPart === "lid",
    );
    for (const pointZ of [
      -outerWidth / 2 + parameters.wallThickness + 0.8,
      outerWidth / 2 - parameters.wallThickness - 0.8,
    ]) {
      addMesh(
        root,
        new THREE.BoxGeometry(outerLength - 16, 2, 1.6),
        railMaterial,
        "base",
        [0, parameters.baseHeight - 2, pointZ],
      );
    }
  }

  if (parameters.closureType === "hinge") {
    const hingeMaterial = standardMaterial(0x66706b, selectedPart === "lid", {
      metalness: 0.35,
      roughness: 0.35,
    });
    const createKnuckle = (length: number) =>
      new THREE.CylinderGeometry(3.2, 3.2, length, 28).rotateZ(Math.PI / 2);
    addMesh(
      root,
      createKnuckle(14),
      hingeMaterial,
      "base",
      [-outerLength / 2 + 13, parameters.baseHeight - 0.8, -outerWidth / 2],
    );
    addMesh(
      root,
      createKnuckle(14),
      hingeMaterial,
      "base",
      [outerLength / 2 - 13, parameters.baseHeight - 0.8, -outerWidth / 2],
    );
    addMesh(
      root,
      createKnuckle(20),
      hingeMaterial,
      "lid",
      [0, lidY + 1.4, -outerWidth / 2],
    );
  }
}

export function buildPreviewModel(
  parameters: DesignerParameters,
  selectedPart: SelectablePart,
  exploded: boolean,
  pcbReference: PcbReference | null,
  stepPreview: StepPreview | null = null,
  focusedPart: SelectablePart | null = null,
  selectedFeatureId: string | null = null,
): THREE.Group {
  const root = new THREE.Group();
  root.name = "enclosure-preview";
  const dimensions = deriveEnclosureDimensions(parameters);
  const shellProfile = getMaterial(parameters.shellMaterialId);
  const shellMaterial = standardMaterial(shellProfile.color, selectedPart === "base");
  const lidMaterial = standardMaterial(shellProfile.color, selectedPart === "lid");
  const pcbMaterial = standardMaterial(0x2f7751, selectedPart === "pcb", {
    roughness: 0.46,
  });
  const wallHeight = parameters.baseHeight - parameters.bottomThickness;
  const explodedGap = exploded ? 24 : 0;
  const lidY = parameters.baseHeight + explodedGap;
  const innerRadius = Math.max(0.5, parameters.cornerRadius - parameters.wallThickness);

  addMesh(
    root,
    createPlateGeometry(
      dimensions.outsideLength,
      dimensions.outsideWidth,
      parameters.bottomThickness,
      parameters.cornerRadius,
    ),
    shellMaterial,
    "base",
    [0, parameters.bottomThickness / 2, 0],
  );

  addMesh(
    root,
    createRingGeometry(
      dimensions.outsideLength,
      dimensions.outsideWidth,
      dimensions.insideLength,
      dimensions.insideWidth,
      wallHeight,
      parameters.cornerRadius,
      innerRadius,
    ),
    shellMaterial,
    "base",
    [0, parameters.bottomThickness + wallHeight / 2, 0],
  );

  if (parameters.enclosureTemplateId === "wall-mount") {
    const earMaterial = standardMaterial(shellProfile.color, selectedPart === "base");
    const holeMaterial = standardMaterial(0x252b28, selectedPart === "base");
    for (const x of [
      -dimensions.outsideLength / 2 - 6,
      dimensions.outsideLength / 2 + 6,
    ]) {
      addMesh(
        root,
        new THREE.BoxGeometry(12, parameters.bottomThickness, 14),
        earMaterial,
        "base",
        [x, parameters.bottomThickness / 2, 0],
      );
      addCylinder(
        root,
        2.2,
        parameters.bottomThickness + 0.2,
        [x, parameters.bottomThickness / 2 + 0.1, 0],
        holeMaterial,
        "base",
      );
    }
  }

  if (parameters.ventPattern !== "none") {
    const ventMaterial = standardMaterial(0x252b28, selectedPart === "base", {
      roughness: 0.9,
    });
    for (const point of getVentPatternPoints(parameters)) {
      const geometry =
        point.shape === "slot"
          ? new THREE.ShapeGeometry(
              createRoundedShape(point.width, point.height, point.height / 2),
            )
          : new THREE.CircleGeometry(
              point.width / 2,
              point.shape === "hexagon" ? 6 : 28,
            );
      geometry.rotateX(-Math.PI / 2);
      addMesh(
        root,
        geometry,
        ventMaterial,
        "base",
        [point.x, 0.03, point.y],
        false,
      );
    }
  }

  const lipHeight = 2.2;
  const lipOuterLength = dimensions.insideLength - 0.45;
  const lipOuterWidth = dimensions.insideWidth - 0.45;
  if (parameters.closureType === "slide") {
    for (const pointZ of [-lipOuterWidth / 2, lipOuterWidth / 2]) {
      addMesh(
        root,
        new THREE.BoxGeometry(lipOuterLength - 6, lipHeight, 1.2),
        lidMaterial,
        "lid",
        [0, lidY - lipHeight / 2, pointZ],
      );
    }
  } else {
    addMesh(
      root,
      createRingGeometry(
        lipOuterLength,
        lipOuterWidth,
        lipOuterLength - 2.2,
        lipOuterWidth - 2.2,
        lipHeight,
        innerRadius,
        Math.max(0.5, innerRadius - 1.1),
      ),
      lidMaterial,
      "lid",
      [0, lidY - lipHeight / 2, 0],
    );
  }

  const topPanels = parameters.panelPlacements.filter((panel) => panel.face === "top");
  if (topPanels.length > 0) {
    const lidShape = createRoundedShape(
      dimensions.outsideLength,
      dimensions.outsideWidth,
      parameters.cornerRadius,
    );
    for (const panel of topPanels) {
      lidShape.holes.push(createRoundedHole(
        panel.width - 4,
        panel.height - 4,
        3.5,
        panel.offsetU,
        -panel.offsetV,
      ));
    }
    addMesh(
      root,
      createExtrudedGeometry(lidShape, parameters.lidThickness),
      lidMaterial,
      "lid",
      [0, lidY + parameters.lidThickness / 2, 0],
    );

  } else {
    addMesh(
      root,
      createPlateGeometry(
        dimensions.outsideLength,
        dimensions.outsideWidth,
        parameters.lidThickness,
        parameters.cornerRadius,
      ),
      lidMaterial,
      "lid",
      [0, lidY + parameters.lidThickness / 2, 0],
    );
  }

  for (const panel of parameters.panelPlacements) {
    const face = panel.face;
    const panelProfile = getMaterial(panel.materialId);
    const panelSelected =
      selectedPart === "panel" &&
      (selectedFeatureId === null || selectedFeatureId === panel.id);
    const panelMaterial = standardMaterial(
      panelProfile.color,
      panelSelected,
      {
        transparent: true,
        opacity: panelProfile.id === "aluminum-sheet" ? 1 : 0.66,
        roughness: 0.2,
        metalness: panelProfile.id === "aluminum-sheet" ? 0.72 : 0.02,
      },
    );
    const explodedOffset = exploded ? 8 : 0;
    const panelPosition = getPreviewFacePosition(
      face,
      panel.offsetU,
      panel.offsetV,
      panel.thickness / 2 + explodedOffset,
      parameters,
      dimensions,
      lidY,
    );
    const panelGroup = new THREE.Group();
    panelGroup.position.set(...panelPosition);
    panelGroup.userData = {
      partId: "panel",
      featureId: panel.id,
      featureKind: "panel",
      face,
      baseWidth: panel.width,
      baseHeight: panel.height,
    };
    root.add(panelGroup);
    panelGroup.name = `panel-transform-${panel.id}`;
    const panelMesh = addMesh(
      panelGroup,
      createFacePlateGeometry(
        panel.width,
        panel.height,
        panel.thickness,
        3.2,
        face,
      ),
      panelMaterial,
      "panel",
      [0, 0, 0],
    );
    panelMesh.name = panel.id;
    panelMesh.userData.featureId = panel.id;

    if (face !== "top") {
      const opening = addMesh(
        root,
        createFacePlaneGeometry(
          panel.width - 4,
          panel.height - 4,
          face,
        ),
        standardMaterial(0x202725, selectedPart === "panel", { roughness: 0.82 }),
        "base",
        getPreviewFacePosition(
          face,
          panel.offsetU,
          panel.offsetV,
          0.04,
          parameters,
          dimensions,
          lidY,
        ),
        false,
      );
      opening.name = `panel-opening-${panel.id}`;
      opening.userData.featureId = panel.id;
      opening.userData.featureKind = "panel";
      opening.renderOrder = 4;
    }

    const targetPart: SelectablePart = face === "top" ? "lid" : "base";
    if (panel.mountingType === "slide") {
      for (const pointV of [
        -panel.height / 2 - 0.6,
        panel.height / 2 + 0.6,
      ]) {
        addMesh(
          root,
          createFaceBoxGeometry(
            panel.width + 2,
            1.5,
            1.2,
            face,
          ),
          face === "top" ? lidMaterial : shellMaterial,
          targetPart,
          getPreviewFacePosition(
            face,
            panel.offsetU,
            panel.offsetV + pointV,
            0.6,
            parameters,
            dimensions,
            lidY,
          ),
        );
      }
    } else {
      const fixingMaterial = standardMaterial(
        panel.mountingType === "screw" ? 0x59615d : 0xc9933d,
        panelSelected,
        { metalness: 0.7, roughness: 0.26 },
      );
      for (const [pointU, pointV] of getPanelMountingPoints(panel)) {
        addMesh(
          root,
          createFaceCylinderGeometry(
            panel.mountingType === "screw" ? 1.3 : 2.15,
            Math.min(1.4, panel.thickness),
            face,
          ),
          fixingMaterial,
          "panel",
          getPreviewFacePosition(
            face,
            panel.offsetU + pointU,
            panel.offsetV + pointV,
            panel.thickness + explodedOffset + 0.2,
            parameters,
            dimensions,
            lidY,
          ),
        );
      }
    }
  }

  const boardY =
    parameters.bottomThickness +
    parameters.standoffHeight +
    parameters.pcbThickness / 2;
  if (stepPreview) {
    const referenceBottom = parameters.bottomThickness + parameters.standoffHeight;
    for (const previewMesh of stepPreview.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(previewMesh.positions, 3));
      if (previewMesh.normals) {
        geometry.setAttribute("normal", new THREE.BufferAttribute(previewMesh.normals, 3));
      } else geometry.computeVertexNormals();
      geometry.setIndex(new THREE.BufferAttribute(previewMesh.indices, 1));
      const color = new THREE.Color(...previewMesh.color);
      addMesh(
        root,
        geometry,
        standardMaterial(color, selectedPart === "pcb", { roughness: 0.48 }),
        "pcb",
        [0, referenceBottom, 0],
      );
    }
  } else {
    addMesh(
      root,
      new THREE.BoxGeometry(
        parameters.pcbLength,
        parameters.pcbThickness,
        parameters.pcbWidth,
      ),
      pcbMaterial,
      "pcb",
      [0, boardY, 0],
    );
  }

  const mountingPoints = getCenteredMountingHoles(parameters, pcbReference);
  const standoffMaterial = standardMaterial(shellProfile.color, selectedPart === "base");
  const holeMaterial = standardMaterial(0x1d2522, selectedPart === "pcb");
  for (const mountingPoint of mountingPoints) {
    const { x, y: z, diameter } = mountingPoint;
    addCylinder(
      root,
      Math.max(3.2, diameter / 2 + 1.4),
      parameters.standoffHeight,
      [x, parameters.bottomThickness + parameters.standoffHeight / 2, z],
      standoffMaterial,
      "base",
    );
    addCylinder(
      root,
      diameter / 2,
      parameters.pcbThickness + 0.2,
      [x, boardY + 0.1, z],
      holeMaterial,
      "pcb",
      20,
    );
  }

  for (const placement of parameters.connectorPlacements) {
    const targetPanel =
      placement.surface === "panel"
        ? getPanelPlacement(parameters, placement.panelId)
        : null;
    if (placement.surface === "panel" && !targetPanel) continue;
    const connector = getConnectorDefinition(placement.definitionId);
    const face = resolveConnectorFace(placement, parameters);
    const surfaceU =
      placement.offsetU +
      (targetPanel?.offsetU ?? 0);
    const surfaceV =
      placement.offsetV +
      (targetPanel?.offsetV ?? 0);
    const surfaceOutset =
      targetPanel?.thickness ?? 0;
    const quarterTurn = placement.rotation === 90 || placement.rotation === 270;
    const connectorSelected =
      selectedPart === "connector" &&
      (selectedFeatureId === null || selectedFeatureId === placement.id);
    const portMaterial = standardMaterial(connector.visualGeometry.color, connectorSelected, {
      metalness: 0.78,
      roughness: 0.22,
    });
    const visualGeometry =
      connector.visualGeometry.shape === "circle"
        ? createFaceCylinderGeometry(
            connector.visualGeometry.width / 2,
            connector.visualGeometry.depth,
            face,
            28,
          )
        : createFaceBoxGeometry(
            quarterTurn
              ? connector.visualGeometry.height
              : connector.visualGeometry.width,
            quarterTurn
              ? connector.visualGeometry.width
              : connector.visualGeometry.height,
            connector.visualGeometry.depth,
            face,
          );
    const connectorPosition = getPreviewFacePosition(
      face,
      surfaceU,
      surfaceV,
      surfaceOutset - connector.visualGeometry.depth / 2 + 0.5,
      parameters,
      dimensions,
      lidY,
    );
    const connectorGroup = new THREE.Group();
    connectorGroup.position.set(...connectorPosition);
    const [openingWidth, openingHeight] = getRotatedCutoutSize(placement);
    connectorGroup.userData = {
      partId: "connector",
      featureId: placement.id,
      featureKind: "connector",
      face,
      baseWidth: openingWidth,
      baseHeight: openingHeight,
      uniformScale: connector.panelCutout.shape === "circle",
    };
    root.add(connectorGroup);
    connectorGroup.name = `connector-transform-${placement.id}`;
    const connectorMesh = addMesh(
      connectorGroup,
      visualGeometry,
      portMaterial,
      "connector",
      [0, 0, 0],
    );
    connectorMesh.name = placement.id;
    connectorMesh.userData.featureId = placement.id;

    const openingGeometry =
      connector.panelCutout.shape === "circle"
        ? createFaceDiskGeometry(openingWidth / 2, face)
        : createFacePlaneGeometry(openingWidth, openingHeight, face);
    const openingPosition = getPreviewFacePosition(
      face,
      surfaceU,
      surfaceV,
      surfaceOutset + 0.04,
      parameters,
      dimensions,
      lidY,
    );
    const opening = addPreviewOutline(
      connectorGroup,
      openingGeometry,
      connectorSelected ? 0x176b45 : 0x33423a,
      connectorSelected ? 0.95 : 0.62,
      "connector",
      relativePosition(openingPosition, connectorPosition),
    );
    opening.name = `${placement.id}-opening`;
    opening.userData.featureId = placement.id;
    opening.userData.featureKind = "connector";

    if (connectorSelected) {
      const keepout = connector.keepoutVolumes[0];
      const keepoutPosition = getPreviewFacePosition(
        face,
        surfaceU,
        surfaceV,
        surfaceOutset + keepout.depth / 2,
        parameters,
        dimensions,
        lidY,
      );
      const keepoutOutline = addPreviewOutline(
        connectorGroup,
        createFaceBoxGeometry(
          quarterTurn ? keepout.height : keepout.width,
          quarterTurn ? keepout.width : keepout.height,
          keepout.depth,
          face,
        ),
        0xd39a2f,
        0.82,
        "connector",
        relativePosition(keepoutPosition, connectorPosition),
      );
      keepoutOutline.name = `${placement.id}-keepout`;
    }
  }

  for (const placement of parameters.antennaPlacements) {
    const targetPanel =
      placement.surface === "panel"
        ? getPanelPlacement(parameters, placement.panelId)
        : null;
    if (placement.surface === "panel" && !targetPanel) continue;
    const antenna = getAntennaDefinition(placement.definitionId);
    const face = resolveAntennaFace(placement, parameters);
    const surfaceU = placement.offsetU + (targetPanel?.offsetU ?? 0);
    const surfaceV = placement.offsetV + (targetPanel?.offsetV ?? 0);
    const surfaceOutset = targetPanel?.thickness ?? 0;
    const quarterTurn = placement.rotation === 90 || placement.rotation === 270;
    const antennaSelected =
      selectedPart === "antenna" &&
      (selectedFeatureId === null || selectedFeatureId === placement.id);
    const antennaMaterial = standardMaterial(
      antenna.visualGeometry.color,
      antennaSelected,
      {
        metalness: antenna.placement === "rear-bulkhead" ? 0.66 : 0.12,
        roughness: 0.32,
        ...(antennaSelected && antenna.placement !== "rear-bulkhead"
          ? { depthTest: false, transparent: true, opacity: 0.92 }
          : {}),
      },
    );
    const external = antenna.enclosureCutout !== null;
    const antennaNormalOffset = external
      ? surfaceOutset + antenna.visualGeometry.depth / 2 - 1.2
      : surfaceOutset - antenna.visualGeometry.depth / 2;
    const antennaPosition = getPreviewFacePosition(
      face,
      surfaceU,
      surfaceV,
      antennaNormalOffset,
      parameters,
      dimensions,
      lidY,
    );
    const [baseWidth, baseHeight] = external
      ? [placement.cutoutDiameter, placement.cutoutDiameter]
      : quarterTurn
        ? [antenna.visualGeometry.height, antenna.visualGeometry.width]
        : [antenna.visualGeometry.width, antenna.visualGeometry.height];
    const antennaGroup = new THREE.Group();
    antennaGroup.position.set(...antennaPosition);
    antennaGroup.name = `antenna-transform-${placement.id}`;
    antennaGroup.userData = {
      partId: "antenna",
      featureId: placement.id,
      featureKind: "antenna",
      face,
      baseWidth,
      baseHeight,
      uniformScale: external,
    };
    root.add(antennaGroup);

    const bodyGeometry = external
      ? createFaceCylinderGeometry(
          antenna.visualGeometry.width / 2,
          antenna.visualGeometry.depth,
          face,
          28,
        )
      : createFaceBoxGeometry(
          quarterTurn
            ? antenna.visualGeometry.height
            : antenna.visualGeometry.width,
          quarterTurn
            ? antenna.visualGeometry.width
            : antenna.visualGeometry.height,
          antenna.visualGeometry.depth,
          face,
        );
    const body = addMesh(
      antennaGroup,
      bodyGeometry,
      antennaMaterial,
      "antenna",
      [0, 0, 0],
    );
    body.name = placement.id;
    body.userData.featureId = placement.id;

    if (external) {
      const radiatorLength = antenna.visualGeometry.radiatorLength ?? 0;
      if (radiatorLength > 0) {
        const radiatorGeometry = createFaceCylinderGeometry(
          (antenna.visualGeometry.radiatorDiameter ?? 3) / 2,
          radiatorLength,
          face,
          20,
        );
        const radiatorPosition = getPreviewFacePosition(
          face,
          surfaceU,
          surfaceV,
          surfaceOutset +
            antenna.visualGeometry.depth -
            1.2 +
            radiatorLength / 2,
          parameters,
          dimensions,
          lidY,
        );
        addMesh(
          antennaGroup,
          radiatorGeometry,
          standardMaterial(0x303533, antennaSelected, { roughness: 0.78 }),
          "antenna",
          relativePosition(radiatorPosition, antennaPosition),
        );
      }

      const openingPosition = getPreviewFacePosition(
        face,
        surfaceU,
        surfaceV,
        surfaceOutset + 0.04,
        parameters,
        dimensions,
        lidY,
      );
      const opening = addMesh(
        antennaGroup,
        createFaceDiskGeometry(placement.cutoutDiameter / 2, face),
        standardMaterial(0x202725, antennaSelected, { roughness: 0.8 }),
        "antenna",
        relativePosition(openingPosition, antennaPosition),
        false,
      );
      opening.renderOrder = 4;
      opening.userData.featureId = placement.id;
      opening.userData.featureKind = "antenna";
    }

    if (antennaSelected) {
      const keepout = antenna.keepoutVolume;
      const keepoutPosition = getPreviewFacePosition(
        face,
        surfaceU,
        surfaceV,
        external
          ? surfaceOutset + keepout.depth / 2
          : surfaceOutset - keepout.depth / 2,
        parameters,
        dimensions,
        lidY,
      );
      const keepoutOutline = addPreviewOutline(
        antennaGroup,
        createFaceBoxGeometry(
          quarterTurn ? keepout.height : keepout.width,
          quarterTurn ? keepout.width : keepout.height,
          keepout.depth,
          face,
        ),
        0xd39a2f,
        0.82,
        "antenna",
        relativePosition(keepoutPosition, antennaPosition),
      );
      keepoutOutline.name = `${placement.id}-keepout`;
    }
  }

  addClosureFeatures(
    root,
    parameters,
    selectedPart,
    lidY,
    dimensions.outsideLength,
    dimensions.outsideWidth,
  );

  if (focusedPart) {
    for (const child of [...root.children]) {
      if (child.userData.partId !== focusedPart) {
        root.remove(child);
        disposePreviewModel(child);
      }
    }
  }

  return root;
}

export function disposePreviewModel(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.LineSegments) {
      object.geometry.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose());
      } else {
        object.material.dispose();
      }
    }
  });
}
