import * as THREE from "three";
import { deriveEnclosureDimensions, getPanelMountingPoints } from "../domain/enclosure";
import { getMaterial } from "../domain/materials";
import type {
  DesignerParameters,
  PcbReference,
  SelectablePart,
  StepPreview,
} from "../domain/model";
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

function createRoundedHole(width: number, depth: number, radius: number): THREE.Path {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const safeRadius = Math.min(radius, halfWidth - 0.01, halfDepth - 0.01);
  const hole = new THREE.Path();

  hole.moveTo(-halfWidth + safeRadius, -halfDepth);
  hole.quadraticCurveTo(-halfWidth, -halfDepth, -halfWidth, -halfDepth + safeRadius);
  hole.lineTo(-halfWidth, halfDepth - safeRadius);
  hole.quadraticCurveTo(-halfWidth, halfDepth, -halfWidth + safeRadius, halfDepth);
  hole.lineTo(halfWidth - safeRadius, halfDepth);
  hole.quadraticCurveTo(halfWidth, halfDepth, halfWidth, halfDepth - safeRadius);
  hole.lineTo(halfWidth, -halfDepth + safeRadius);
  hole.quadraticCurveTo(halfWidth, -halfDepth, halfWidth - safeRadius, -halfDepth);
  hole.lineTo(-halfWidth + safeRadius, -halfDepth);
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
  const x = outerLength / 2 - parameters.wallThickness - 4.5;
  const z = outerWidth / 2 - parameters.wallThickness - 4.5;
  const points: Array<[number, number]> = [
    [-x, -z],
    [x, -z],
    [-x, z],
    [x, z],
  ];

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
    const magnetMaterial = standardMaterial(0xc9933d, selectedPart === "lid", {
      metalness: 0.72,
      roughness: 0.24,
    });
    for (const [pointX, pointZ] of points) {
      addCylinder(
        root,
        3.1,
        1.8,
        [pointX, parameters.baseHeight - 1.2, pointZ],
        magnetMaterial,
        "base",
      );
      addCylinder(
        root,
        3.1,
        1.8,
        [pointX, lidY + 0.9, pointZ],
        magnetMaterial,
        "lid",
      );
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
): THREE.Group {
  const root = new THREE.Group();
  root.name = "enclosure-preview";
  const dimensions = deriveEnclosureDimensions(parameters);
  const shellProfile = getMaterial(parameters.shellMaterialId);
  const panelProfile = getMaterial(parameters.panelMaterialId);
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

  if (parameters.panelEnabled) {
    const panelOpeningLength = dimensions.panelLength - 4;
    const panelOpeningWidth = dimensions.panelWidth - 4;
    const lidShape = createRoundedShape(
      dimensions.outsideLength,
      dimensions.outsideWidth,
      parameters.cornerRadius,
    );
    lidShape.holes.push(
      createRoundedHole(panelOpeningLength, panelOpeningWidth, 3.5),
    );
    addMesh(
      root,
      createExtrudedGeometry(lidShape, parameters.lidThickness),
      lidMaterial,
      "lid",
      [0, lidY + parameters.lidThickness / 2, 0],
    );

    const panelMaterial = standardMaterial(
      panelProfile.color,
      selectedPart === "panel",
      {
        transparent: true,
        opacity: panelProfile.id === "aluminum-sheet" ? 1 : 0.66,
        roughness: 0.2,
        metalness: panelProfile.id === "aluminum-sheet" ? 0.72 : 0.02,
      },
    );
    addMesh(
      root,
      createPlateGeometry(
        dimensions.panelLength,
        dimensions.panelWidth,
        parameters.panelThickness,
        3.2,
      ),
      panelMaterial,
      "panel",
      [
        0,
        lidY + parameters.lidThickness / 2 + (exploded ? 8 : 0),
        0,
      ],
    );

    if (parameters.panelMountingType === "slide") {
      for (const pointZ of [
        -dimensions.panelWidth / 2 - 0.6,
        dimensions.panelWidth / 2 + 0.6,
      ]) {
        addMesh(
          root,
          new THREE.BoxGeometry(dimensions.panelLength + 2, 1.5, 1.2),
          lidMaterial,
          "lid",
          [0, lidY + parameters.lidThickness + 0.75, pointZ],
        );
      }
    } else {
      const fixingMaterial = standardMaterial(
        parameters.panelMountingType === "screw" ? 0x59615d : 0xc9933d,
        selectedPart === "panel",
        { metalness: 0.7, roughness: 0.26 },
      );
      for (const [x, z] of getPanelMountingPoints(parameters)) {
        addCylinder(
          root,
          parameters.panelMountingType === "screw" ? 1.3 : 2.15,
          Math.min(1.4, parameters.panelThickness),
          [
            x,
            lidY + parameters.lidThickness / 2 + (exploded ? 8 : 0) + 0.2,
            z,
          ],
          fixingMaterial,
          "panel",
        );
      }
    }
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

  if (parameters.typeCPortEnabled) {
    const connector = getConnectorDefinition(parameters.connectorDefinitionId);
    const portY = boardY + connector.placementAnchor.heightAboveBoardCenter;
    const portMaterial = standardMaterial(connector.visualGeometry.color, selectedPart === "connector", {
      metalness: 0.78,
      roughness: 0.22,
    });
    const visualGeometry =
      connector.visualGeometry.shape === "circle"
        ? new THREE.CylinderGeometry(
            connector.visualGeometry.width / 2,
            connector.visualGeometry.width / 2,
            connector.visualGeometry.depth,
            28,
          ).rotateX(Math.PI / 2)
        : new THREE.BoxGeometry(
            connector.visualGeometry.width,
            connector.visualGeometry.height,
            connector.visualGeometry.depth,
          );
    addMesh(
      root,
      visualGeometry,
      portMaterial,
      "connector",
      [
        parameters.typeCPortOffset,
        portY,
        parameters.pcbWidth / 2 - 2,
      ],
    );

    const openingMaterial = standardMaterial(0x202725, selectedPart === "connector", {
      roughness: 0.8,
    });
    const openingGeometry =
      connector.panelCutout.shape === "circle"
        ? new THREE.CircleGeometry(parameters.typeCPortWidth / 2, 32)
        : new THREE.PlaneGeometry(parameters.typeCPortWidth, parameters.typeCPortHeight);
    const opening = addMesh(
      root,
      openingGeometry,
      openingMaterial,
      "connector",
      [
        parameters.typeCPortOffset,
        portY,
        dimensions.outsideWidth / 2 + 0.04,
      ],
      false,
    );
    opening.renderOrder = 4;

    if (selectedPart === "connector") {
      const keepoutMaterial = standardMaterial(0xe1a33a, true, {
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });
      const keepout = connector.keepoutVolumes[0];
      addMesh(
        root,
        new THREE.BoxGeometry(keepout.width, keepout.height, keepout.depth),
        keepoutMaterial,
        "connector",
        [
          parameters.typeCPortOffset,
          portY,
          dimensions.outsideWidth / 2 + keepout.depth / 2,
        ],
        false,
      );
    }
  }

  if (parameters.antennaEnabled) {
    const antenna = getAntennaDefinition(parameters.antennaDefinitionId);
    const antennaY = boardY + antenna.heightAboveBoardCenter;
    const antennaMaterial = standardMaterial(
      antenna.visualGeometry.color,
      selectedPart === "antenna",
      {
        metalness: antenna.placement === "rear-bulkhead" ? 0.66 : 0.12,
        roughness: 0.32,
        ...(selectedPart === "antenna" && antenna.placement !== "rear-bulkhead"
          ? { depthTest: false, transparent: true, opacity: 0.92 }
          : {}),
      },
    );
    let antennaCenterZ: number;

    if (antenna.placement === "rear-bulkhead") {
      const bodyGeometry = new THREE.CylinderGeometry(
        antenna.visualGeometry.width / 2,
        antenna.visualGeometry.width / 2,
        antenna.visualGeometry.depth,
        28,
      ).rotateX(Math.PI / 2);
      antennaCenterZ =
        -dimensions.outsideWidth / 2 - antenna.visualGeometry.depth / 2 + 1.2;
      addMesh(
        root,
        bodyGeometry,
        antennaMaterial,
        "antenna",
        [parameters.antennaOffset, antennaY, antennaCenterZ],
      );

      const radiatorLength = antenna.visualGeometry.radiatorLength ?? 0;
      if (radiatorLength > 0) {
        const radiatorGeometry = new THREE.CylinderGeometry(
          (antenna.visualGeometry.radiatorDiameter ?? 3) / 2,
          (antenna.visualGeometry.radiatorDiameter ?? 3) / 2,
          radiatorLength,
          20,
        ).rotateX(Math.PI / 2);
        addMesh(
          root,
          radiatorGeometry,
          standardMaterial(0x303533, selectedPart === "antenna", { roughness: 0.78 }),
          "antenna",
          [
            parameters.antennaOffset,
            antennaY,
            -dimensions.outsideWidth / 2 - antenna.visualGeometry.depth + 1.2 - radiatorLength / 2,
          ],
        );
      }

      const opening = addMesh(
        root,
        new THREE.CircleGeometry((antenna.enclosureCutout?.diameter ?? 0) / 2, 32).rotateY(
          Math.PI,
        ),
        standardMaterial(0x202725, selectedPart === "antenna", { roughness: 0.8 }),
        "antenna",
        [parameters.antennaOffset, antennaY, -dimensions.outsideWidth / 2 - 0.04],
        false,
      );
      opening.renderOrder = 4;
    } else {
      antennaCenterZ =
        antenna.placement === "inner-rear-wall"
          ? -dimensions.insideWidth / 2 + antenna.visualGeometry.depth / 2
          : -parameters.pcbWidth / 2 + antenna.visualGeometry.depth / 2;
      addMesh(
        root,
        new THREE.BoxGeometry(
          antenna.visualGeometry.width,
          antenna.visualGeometry.height,
          antenna.visualGeometry.depth,
        ),
        antennaMaterial,
        "antenna",
        [parameters.antennaOffset, antennaY, antennaCenterZ],
      );
    }

    if (selectedPart === "antenna") {
      const keepout = antenna.keepoutVolume;
      const keepoutCenterZ =
        antenna.placement === "rear-bulkhead"
          ? -dimensions.outsideWidth / 2 - keepout.depth / 2
          : antennaCenterZ + keepout.depth / 2;
      const keepoutMesh = addMesh(
        root,
        new THREE.BoxGeometry(keepout.width, keepout.height, keepout.depth),
        standardMaterial(0xe0b83e, true, {
          transparent: true,
          opacity: 0.17,
          depthWrite: false,
          depthTest: false,
        }),
        "antenna",
        [parameters.antennaOffset, antennaY, keepoutCenterZ],
        false,
      );
      keepoutMesh.renderOrder = 6;
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
