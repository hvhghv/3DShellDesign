import * as THREE from "three";
import {
  deriveEnclosureDimensions,
  getPanelMountingPoints,
  PANEL_SCREW_HEAD_RADIUS,
  PANEL_SCREW_TAB_RADIUS,
} from "../domain/enclosure";
import { getMaterial } from "../domain/materials";
import { getClosurePoints, MAGNET_GEOMETRY } from "../domain/magnetSupport";
import type {
  BatteryCompartmentPlacement,
  CustomComponentPlacement,
  DesignerParameters,
  DisplayMountingType,
  EnclosureDimensions,
  EnclosureFace,
  PcbReference,
  SelectablePart,
  StepPreview,
} from "../domain/model";
import { getPreviewSize } from "../domain/customComponents";
import { getBatteryCompartmentLayout } from "../domain/batteries";
import {
  getPcbMountingEnvelopes,
  PARAMETRIC_PCB_FEATURE_ID,
  type PcbMountingEnvelope,
} from "../domain/pcbMounting";
import {
  getEffectivePcbRailLayout,
  getPcbRailCavityReach,
  getPcbRailDirection,
} from "../domain/pcbRailDirection";
import {
  getPanelPlacement,
  getPanelInnerCornerRadius,
  getPanelOpeningSize,
  getRotatedCutoutSize,
  resolveAntennaFace,
  resolveConnectorFace,
} from "../domain/placements";
import { getCenteredMountingHoles } from "../domain/pcbReference";
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
} from "../domain/screwRecess";
import { getRemovableFaces } from "../domain/removableFaces";
import {
  type ConnectorDefinition,
  getAntennaDefinition,
  getConnectorDefinition,
  getFastenerDefinition,
  hasThroughPanelCutout,
  supportsDisplayScrewMounting,
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

function createFaceExtrudedGeometry(
  shape: THREE.Shape,
  thickness: number,
  face: EnclosureFace,
): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 12,
  });
  geometry.center();
  orientGeometryToFace(geometry, face);
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

function createFaceTaperedCylinderGeometry(
  topRadius: number,
  bottomRadius: number,
  depth: number,
  face: EnclosureFace,
): THREE.CylinderGeometry {
  const geometry = new THREE.CylinderGeometry(
    topRadius,
    bottomRadius,
    depth,
    28,
  );
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
  followRemovableFace = false,
): [number, number, number] {
  const lidFace = parameters.lidFace;
  const faceFollowsRemovableGroup =
    followRemovableFace && getRemovableFaces(parameters).includes(face);
  const lidExplodedOffset =
    faceFollowsRemovableGroup && face !== "top"
      ? Math.max(0, lidY - parameters.baseHeight)
      : 0;
  const offset = normalOffset + lidExplodedOffset;
  if (face === "top") {
    const surfaceY =
      faceFollowsRemovableGroup || lidFace === "top"
        ? lidY + parameters.lidThickness
        : parameters.baseHeight + parameters.lidThickness;
    return [u, surfaceY + normalOffset, v];
  }
  if (face === "bottom") return [u, -offset, v];
  if (face === "front") {
    return [u, parameters.baseHeight / 2 + v, dimensions.outsideWidth / 2 + offset];
  }
  if (face === "back") {
    return [u, parameters.baseHeight / 2 + v, -dimensions.outsideWidth / 2 - offset];
  }
  if (face === "right") {
    return [dimensions.outsideLength / 2 + offset, parameters.baseHeight / 2 + v, u];
  }
  return [-dimensions.outsideLength / 2 - offset, parameters.baseHeight / 2 + v, u];
}

function isSideFace(face: EnclosureFace): boolean {
  return face === "front" || face === "back" || face === "left" || face === "right";
}

function getPreviewFaceSize(
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

function getPreviewInteriorBottomY(parameters: DesignerParameters): number {
  return getRemovableFaces(parameters).includes("bottom")
    ? 0
    : parameters.bottomThickness;
}

function getFaceHoleV(face: EnclosureFace, offsetV: number): number {
  return face === "top" || face === "bottom" ? -offsetV : offsetV;
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
  hiddenSideFaces: readonly EnclosureFace[] = [],
): THREE.ExtrudeGeometry {
  const shape = createRoundedShape(outerWidth, outerDepth, outerRadius);
  shape.holes.push(createRoundedHole(innerWidth, innerDepth, innerRadius));
  const geometry = createExtrudedGeometry(shape, height);
  const hidden = new Set(
    hiddenSideFaces.filter(
      (face) => face === "front" || face === "back" || face === "left" || face === "right",
    ),
  );
  if (hidden.size === 0) return geometry;

  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute("position");
  const normal = source.getAttribute("normal");
  const uv = source.getAttribute("uv");
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];

  for (let vertex = 0; vertex < position.count; vertex += 3) {
    const centerX =
      (position.getX(vertex) + position.getX(vertex + 1) + position.getX(vertex + 2)) / 3;
    const centerZ =
      (position.getZ(vertex) + position.getZ(vertex + 1) + position.getZ(vertex + 2)) / 3;
    const xScore = Math.abs(centerX) / Math.max(0.01, outerWidth / 2);
    const zScore = Math.abs(centerZ) / Math.max(0.01, outerDepth / 2);
    const face: EnclosureFace =
      xScore > zScore
        ? centerX >= 0 ? "right" : "left"
        : centerZ >= 0 ? "front" : "back";
    if (hidden.has(face)) continue;

    for (let offset = 0; offset < 3; offset += 1) {
      const index = vertex + offset;
      positions.push(position.getX(index), position.getY(index), position.getZ(index));
      normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
      uvs.push(uv.getX(index), uv.getY(index));
    }
  }

  const filtered = new THREE.BufferGeometry();
  filtered.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  filtered.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  filtered.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  filtered.computeBoundingBox();
  filtered.computeBoundingSphere();
  if (source !== geometry) source.dispose();
  geometry.dispose();
  return filtered as THREE.ExtrudeGeometry;
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
  enclosureFace?: EnclosureFace,
  shadows = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  mesh.userData.partId = partId;
  if (enclosureFace) mesh.userData.enclosureFace = enclosureFace;
  group.add(mesh);

  if (showEdges) {
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry, 28),
      new THREE.LineBasicMaterial({ color: EDGE_COLOR, transparent: true, opacity: 0.46 }),
    );
    edges.position.copy(mesh.position);
    edges.userData.partId = partId;
    if (enclosureFace) edges.userData.enclosureFace = enclosureFace;
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

function isFpcConnectorDefinition(connector: ConnectorDefinition): boolean {
  return connector.category === "fpc";
}

function isWaterproofMicrophoneDefinition(
  connector: ConnectorDefinition,
): boolean {
  return Boolean(connector.microphoneSpec);
}

function isRectangularSpeakerDefinition(
  connector: ConnectorDefinition,
): boolean {
  return connector.speakerSpec?.kind === "rectangular-cavity-speaker";
}

function addFpcConnectorPreview(
  group: THREE.Group,
  connector: ConnectorDefinition,
  featureId: string,
  face: EnclosureFace,
  connectorSelected: boolean,
  quarterTurn: boolean,
  surfaceOutset: number,
  surfaceU: number,
  surfaceV: number,
  origin: readonly [number, number, number],
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
  lidY: number,
  followRemovableFace: boolean,
): void {
  const bodyMaterial = standardMaterial(connector.visualGeometry.color, connectorSelected, {
    metalness: 0.46,
    roughness: 0.38,
  });
  const bodyWidth = quarterTurn
    ? connector.visualGeometry.height
    : connector.visualGeometry.width;
  const bodyHeight = quarterTurn
    ? connector.visualGeometry.width
    : connector.visualGeometry.height;
  const bodyGeometry = createFaceBoxGeometry(
    bodyWidth,
    bodyHeight,
    connector.visualGeometry.depth,
    face,
  );
  const bodyPosition = relativePosition(
    getPreviewFacePosition(
      face,
      surfaceU,
      surfaceV,
      surfaceOutset - connector.visualGeometry.depth / 2 + 0.45,
      parameters,
      dimensions,
      lidY,
      followRemovableFace,
    ),
    origin,
  );
  const body = addMesh(
    group,
    bodyGeometry,
    bodyMaterial,
    "connector",
    bodyPosition,
    false,
  );
  body.name = featureId;
  body.userData.featureId = featureId;

  const latchWidth = Math.max(2.2, Math.min(bodyWidth - 2, bodyWidth * 0.35));
  const latchHeight = Math.max(0.9, Math.min(bodyHeight - 0.4, bodyHeight * 0.42));
  const latchGeometry = createFaceBoxGeometry(
    latchWidth,
    latchHeight,
    Math.max(0.8, connector.visualGeometry.depth * 0.26),
    face,
  );
  const latch = addMesh(
    group,
    latchGeometry,
    standardMaterial(0xb8ac92, connectorSelected, {
      metalness: 0.3,
      roughness: 0.46,
    }),
    "connector",
    relativePosition(
      getPreviewFacePosition(
        face,
        surfaceU,
        surfaceV,
        surfaceOutset + connector.visualGeometry.depth * 0.1,
        parameters,
        dimensions,
        lidY,
        followRemovableFace,
      ),
      origin,
    ),
    false,
  );
  latch.name = `${featureId}-latch`;
  latch.userData.featureId = featureId;

  const slotOffset = connector.visualGeometry.depth * 0.16;
  const slotGeometry = createFacePlaneGeometry(
    Math.max(1.4, bodyWidth - 1.4),
    Math.max(0.6, bodyHeight - 0.35),
    face,
  );
  const slot = addPreviewOutline(
    group,
    slotGeometry,
    connectorSelected ? 0x176b45 : 0x54635b,
    connectorSelected ? 0.82 : 0.5,
    "connector",
    relativePosition(
      getPreviewFacePosition(
        face,
        surfaceU,
        surfaceV,
        surfaceOutset + slotOffset,
        parameters,
        dimensions,
        lidY,
        followRemovableFace,
      ),
      origin,
    ),
  );
  slot.name = `${featureId}-slot`;
  slot.userData.featureId = featureId;
  slot.userData.featureKind = "connector";

  if (connectorSelected) {
    const keepout = connector.keepoutVolumes[0];
    if (keepout) {
      const keepoutPosition = relativePosition(
        getPreviewFacePosition(
          face,
          surfaceU,
          surfaceV,
          surfaceOutset + keepout.depth / 2,
          parameters,
          dimensions,
          lidY,
          followRemovableFace,
        ),
        origin,
      );
      const keepoutOutline = addPreviewOutline(
        group,
        createFaceBoxGeometry(
          quarterTurn ? keepout.height : keepout.width,
          quarterTurn ? keepout.width : keepout.height,
          keepout.depth,
          face,
        ),
        0xd39a2f,
        0.7,
        "connector",
        keepoutPosition,
      );
      keepoutOutline.name = `${featureId}-keepout`;
      keepoutOutline.renderOrder = 5;
    }
  }
}

function addWaterproofMicrophonePreview(
  group: THREE.Group,
  connector: ConnectorDefinition,
  featureId: string,
  rotation: number,
  face: EnclosureFace,
  connectorSelected: boolean,
  surfaceOutset: number,
  surfaceU: number,
  surfaceV: number,
  origin: readonly [number, number, number],
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
  lidY: number,
  followRemovableFace: boolean,
): void {
  const spec = connector.microphoneSpec;
  if (!spec) return;

  const normalOffset = (u: number, v: number, offset: number) => {
    const [rotatedU, rotatedV] = rotateSurfaceOffset(u, v, rotation);
    return relativePosition(
      getPreviewFacePosition(
        face,
        surfaceU + rotatedU,
        surfaceV + rotatedV,
        offset,
        parameters,
        dimensions,
        lidY,
        followRemovableFace,
      ),
      origin,
    );
  };
  const faceBox = (width: number, height: number, depth: number) => {
    const [rotatedWidth, rotatedHeight] = getRotatedSurfaceSize(
      width,
      height,
      rotation,
    );
    return createFaceBoxGeometry(rotatedWidth, rotatedHeight, depth, face);
  };
  const addMicrophoneMesh = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    u: number,
    v: number,
    offset: number,
    showEdges = true,
  ) => {
    const mesh = addMesh(
      group,
      geometry,
      material,
      "connector",
      normalOffset(u, v, offset),
      showEdges,
    );
    mesh.name = `${featureId}-${name}`;
    mesh.userData.featureId = featureId;
    mesh.userData.featureKind = "connector";
    return mesh;
  };

  const capsuleDepth = Math.max(1.4, spec.capsuleHeight);
  const capsuleCenterOffset = surfaceOutset - capsuleDepth / 2 + 0.34;
  const wireDiameter = 0.34;
  const visibleCableLength = Math.min(24, Math.max(14, spec.cableLength * 0.22));
  const wireStartU = spec.sealDiameter / 2 + 0.45;
  const wireCenterU = wireStartU + visibleCableLength / 2;
  const plugCenterU = wireStartU + visibleCableLength + 1.5;
  const wireOffset = surfaceOutset - capsuleDepth - 0.2;

  const capsule = addMicrophoneMesh(
    "capsule",
    createFaceCylinderGeometry(spec.capsuleDiameter / 2, capsuleDepth, face, 40),
    standardMaterial(connector.visualGeometry.color, connectorSelected, {
      metalness: 0.18,
      roughness: 0.5,
    }),
    0,
    0,
    capsuleCenterOffset,
  );
  capsule.name = featureId;

  addMicrophoneMesh(
    "silicone-seal",
    createFaceCylinderGeometry(spec.sealDiameter / 2, 0.58, face, 40),
    standardMaterial(0x111817, connectorSelected, {
      metalness: 0.04,
      roughness: 0.76,
    }),
    0,
    0,
    surfaceOutset + 0.03,
  );
  addMicrophoneMesh(
    "sound-port",
    createFaceDiskGeometry(Math.max(0.65, spec.capsuleDiameter * 0.28), face),
    standardMaterial(0x050707, connectorSelected, {
      metalness: 0.02,
      roughness: 0.82,
    }),
    0,
    0,
    surfaceOutset + 0.36,
    false,
  );

  for (const offsetV of [-0.48, 0, 0.48]) {
    addMicrophoneMesh(
      `grille-${offsetV.toFixed(2)}`,
      faceBox(spec.capsuleDiameter * 0.7, 0.08, 0.06),
      standardMaterial(0x6a706b, connectorSelected, {
        metalness: 0.34,
        roughness: 0.42,
      }),
      0,
      offsetV,
      surfaceOutset + 0.42,
      false,
    );
  }

  addMicrophoneMesh(
    "potting-back",
    createFaceCylinderGeometry(spec.capsuleDiameter / 2, 0.62, face, 36),
    standardMaterial(0x6f3d2f, connectorSelected, {
      metalness: 0.04,
      roughness: 0.64,
    }),
    0,
    0,
    surfaceOutset - capsuleDepth - 0.05,
  );
  addMicrophoneMesh(
    "wire-red",
    faceBox(visibleCableLength, wireDiameter, wireDiameter),
    standardMaterial(0xd4483d, connectorSelected, {
      metalness: 0.06,
      roughness: 0.5,
    }),
    wireCenterU,
    0.36,
    wireOffset,
    false,
  );
  addMicrophoneMesh(
    "wire-black",
    faceBox(visibleCableLength, wireDiameter, wireDiameter),
    standardMaterial(0x1b2021, connectorSelected, {
      metalness: 0.08,
      roughness: 0.5,
    }),
    wireCenterU,
    -0.36,
    wireOffset,
    false,
  );
  addMicrophoneMesh(
    "twist-marker",
    faceBox(visibleCableLength * 0.82, 0.08, 0.08),
    standardMaterial(0x9aa0a0, connectorSelected, {
      metalness: 0.02,
      roughness: 0.7,
    }),
    wireCenterU,
    0,
    wireOffset + 0.08,
    false,
  );
  addMicrophoneMesh(
    "connector-body",
    faceBox(2.8, 2.1, 1.35),
    standardMaterial(0xf4f0e9, connectorSelected, {
      metalness: 0.02,
      roughness: 0.54,
    }),
    plugCenterU,
    0,
    wireOffset,
  );
  for (const pinV of [-0.42, 0.42]) {
    addMicrophoneMesh(
      `connector-pin-${pinV.toFixed(2)}`,
      faceBox(0.54, 0.32, 0.08),
      standardMaterial(0xd7b24a, connectorSelected, {
        metalness: 0.74,
        roughness: 0.28,
      }),
      plugCenterU + 0.96,
      pinV,
      wireOffset + 0.72,
      false,
    );
  }
}

function addRectangularSpeakerPreview(
  group: THREE.Group,
  connector: ConnectorDefinition,
  featureId: string,
  rotation: number,
  face: EnclosureFace,
  connectorSelected: boolean,
  surfaceOutset: number,
  surfaceU: number,
  surfaceV: number,
  origin: readonly [number, number, number],
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
  lidY: number,
  followRemovableFace: boolean,
): void {
  const spec = connector.speakerSpec;
  if (!spec) return;

  const normalOffset = (u: number, v: number, offset: number) => {
    const [rotatedU, rotatedV] = rotateSurfaceOffset(u, v, rotation);
    return relativePosition(
      getPreviewFacePosition(
        face,
        surfaceU + rotatedU,
        surfaceV + rotatedV,
        offset,
        parameters,
        dimensions,
        lidY,
        followRemovableFace,
      ),
      origin,
    );
  };
  const faceBox = (width: number, height: number, depth: number) => {
    const [rotatedWidth, rotatedHeight] = getRotatedSurfaceSize(
      width,
      height,
      rotation,
    );
    return createFaceBoxGeometry(rotatedWidth, rotatedHeight, depth, face);
  };
  const addSpeakerMesh = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    u: number,
    v: number,
    offset: number,
    showEdges = true,
  ) => {
    const mesh = addMesh(
      group,
      geometry,
      material,
      "connector",
      normalOffset(u, v, offset),
      showEdges,
    );
    mesh.name = `${featureId}-${name}`;
    mesh.userData.featureId = featureId;
    mesh.userData.featureKind = "connector";
    return mesh;
  };

  const bodyCenterOffset = surfaceOutset - spec.bodyDepth / 2 - 0.12;
  const faceDetailOffset = surfaceOutset + 0.04;
  const backDetailOffset = surfaceOutset - spec.bodyDepth - 0.08;
  const visibleCableLength = Math.min(
    22,
    Math.max(12, spec.cableLength * 0.58),
  );
  const wireDiameter = 0.38;
  const wireStartU = spec.bodyWidth / 2 - 1.2;
  const wireCenterU = wireStartU + visibleCableLength / 2 + 0.25;
  const plugCenterU = wireStartU + visibleCableLength + 2.3;
  const wireOffset = surfaceOutset - spec.bodyDepth - 0.35;

  const body = addSpeakerMesh(
    "body",
    faceBox(spec.bodyWidth, spec.bodyHeight, spec.bodyDepth),
    standardMaterial(connector.visualGeometry.color, connectorSelected, {
      metalness: 0.18,
      roughness: 0.5,
    }),
    0,
    0,
    bodyCenterOffset,
  );
  body.name = featureId;

  addSpeakerMesh(
    "diaphragm",
    faceBox(spec.bodyWidth - 3.4, spec.bodyHeight - 3.2, 0.12),
    standardMaterial(0xb9b5a8, connectorSelected, {
      metalness: 0.62,
      roughness: 0.34,
    }),
    0,
    0,
    faceDetailOffset,
  );
  addSpeakerMesh(
    "front-gasket",
    faceBox(spec.bodyWidth - 1.4, 1.05, 0.16),
    standardMaterial(0x111719, connectorSelected, {
      metalness: 0.08,
      roughness: 0.58,
    }),
    0,
    spec.bodyHeight / 2 - 1.0,
    faceDetailOffset + 0.05,
  );
  addSpeakerMesh(
    "impedance-label",
    faceBox(5.2, 2.2, 0.08),
    standardMaterial(0x2f3638, connectorSelected, {
      metalness: 0.12,
      roughness: 0.52,
    }),
    0,
    0,
    faceDetailOffset + 0.12,
    false,
  );
  addSpeakerMesh(
    "rear-cavity",
    faceBox(spec.bodyWidth - 2.6, spec.bodyHeight - 2.6, 0.18),
    standardMaterial(0xe7dec8, connectorSelected, {
      metalness: 0.02,
      roughness: 0.8,
      transparent: true,
      opacity: connectorSelected ? 0.84 : 0.68,
    }),
    0,
    0,
    backDetailOffset,
  );
  addSpeakerMesh(
    "wire-red",
    faceBox(visibleCableLength, wireDiameter, wireDiameter),
    standardMaterial(0xd4483d, connectorSelected, {
      metalness: 0.06,
      roughness: 0.5,
    }),
    wireCenterU,
    0.52,
    wireOffset,
    false,
  );
  addSpeakerMesh(
    "wire-black",
    faceBox(visibleCableLength, wireDiameter, wireDiameter),
    standardMaterial(0x171c1d, connectorSelected, {
      metalness: 0.08,
      roughness: 0.5,
    }),
    wireCenterU,
    -0.52,
    wireOffset,
    false,
  );
  addSpeakerMesh(
    "strain-relief",
    faceBox(2.3, 2.5, 0.7),
    standardMaterial(0x121819, connectorSelected, {
      metalness: 0.06,
      roughness: 0.58,
    }),
    wireStartU,
    0,
    wireOffset + 0.02,
  );
  addSpeakerMesh(
    "connector-body",
    faceBox(3.1, 2.2, 1.28),
    standardMaterial(0xf4f0e9, connectorSelected, {
      metalness: 0.02,
      roughness: 0.54,
    }),
    plugCenterU,
    0,
    wireOffset,
  );
  for (const pinV of [-0.44, 0.44]) {
    addSpeakerMesh(
      `connector-pin-${pinV.toFixed(2)}`,
      faceBox(0.56, 0.34, 0.08),
      standardMaterial(0xd7b24a, connectorSelected, {
        metalness: 0.74,
        roughness: 0.28,
      }),
      plugCenterU + 1.08,
      pinV,
      wireOffset + 0.69,
      false,
    );
  }
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

function createCompressionSpringGeometry(
  coilRadius: number,
  height: number,
  turns: number,
  wireRadius: number,
): THREE.TubeGeometry {
  const segments = Math.max(32, Math.round(turns * 32));
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const angle = progress * turns * Math.PI * 2;
    points.push(
      new THREE.Vector3(
        Math.cos(angle) * coilRadius,
        (progress - 0.5) * height,
        Math.sin(angle) * coilRadius,
      ),
    );
  }
  return new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points, false, "catmullrom", 0.08),
    segments,
    wireRadius,
    8,
    false,
  );
}

function makeMaterialTransparent(material: THREE.Material): THREE.Material {
  const transparentMaterial = material.clone();
  transparentMaterial.transparent = true;
  transparentMaterial.opacity = Math.min(0.24, transparentMaterial.opacity || 1);
  transparentMaterial.depthWrite = false;
  transparentMaterial.depthTest = true;
  transparentMaterial.premultipliedAlpha = true;
  transparentMaterial.needsUpdate = true;
  if ("forceSinglePass" in transparentMaterial) {
    transparentMaterial.forceSinglePass = true;
  }
  return transparentMaterial;
}

function applyObjectTransparency(
  root: THREE.Object3D,
  transparentObjectIds: readonly string[],
): void {
  if (transparentObjectIds.length === 0) return;
  const transparentObjects = new Set(transparentObjectIds);

  const visit = (object: THREE.Object3D, inheritedTransparent: boolean) => {
    const partId =
      typeof object.userData.partId === "string"
        ? object.userData.partId
        : null;
    const featureId =
      typeof object.userData.featureId === "string"
        ? object.userData.featureId
        : null;
    const transparent =
      inheritedTransparent ||
      Boolean(partId && transparentObjects.has(partId)) ||
      Boolean(featureId && transparentObjects.has(featureId));

    if (
      transparent &&
      (object instanceof THREE.Mesh || object instanceof THREE.LineSegments)
    ) {
      const sourceMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      object.userData.detachedMaterials = [
        ...(object.userData.detachedMaterials ?? []),
        ...sourceMaterials,
      ];
      object.material = Array.isArray(object.material)
        ? object.material.map(makeMaterialTransparent)
        : makeMaterialTransparent(object.material);
      if (object instanceof THREE.Mesh) {
        object.castShadow = false;
        object.receiveShadow = false;
      }
      object.renderOrder = Math.max(object.renderOrder, 4);
    }

    for (const child of object.children) visit(child, transparent);
  };

  visit(root, false);
}

function addCustomComponentPreview(
  root: THREE.Group,
  component: CustomComponentPlacement,
  preview: StepPreview | null,
  selected: boolean,
): void {
  const group = new THREE.Group();
  group.name = `custom-transform-${component.id}`;
  group.position.set(
    component.positionX,
    component.positionY,
    component.positionZ,
  );
  group.rotation.set(
    THREE.MathUtils.degToRad(component.rotationX),
    THREE.MathUtils.degToRad(component.rotationY),
    THREE.MathUtils.degToRad(component.rotationZ),
  );
  group.userData = {
    partId: "custom",
    featureId: component.id,
    featureKind: "custom",
    baseWidth: component.width,
    baseHeight: component.height,
    baseDepth: component.depth,
  };
  root.add(group);
  const material = standardMaterial(component.color, selected, {
    roughness: 0.44,
    metalness: 0.08,
  });

  if (component.shape === "model" && preview) {
    const [sourceWidth, sourceHeight, sourceDepth] = getPreviewSize(preview);
    for (const previewMesh of preview.meshes) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(previewMesh.positions, 3),
      );
      if (previewMesh.normals) {
        geometry.setAttribute(
          "normal",
          new THREE.BufferAttribute(previewMesh.normals, 3),
        );
      } else geometry.computeVertexNormals();
      geometry.setIndex(new THREE.BufferAttribute(previewMesh.indices, 1));
      geometry.scale(
        component.width / sourceWidth,
        component.height / sourceHeight,
        component.depth / sourceDepth,
      );
      geometry.translate(0, -component.height / 2, 0);
      addMesh(
        group,
        geometry,
        material.clone(),
        "custom",
        [0, 0, 0],
        false,
        undefined,
        false,
      );
    }
    material.dispose();
  } else {
    const geometry =
      component.shape === "cylinder"
        ? new THREE.CylinderGeometry(
            component.width / 2,
            component.width / 2,
            component.height,
            32,
          )
        : new THREE.BoxGeometry(
            component.width,
            component.height,
            component.depth,
          );
    addMesh(group, geometry, material, "custom", [0, 0, 0]);
  }
}

function getInteriorFaceMountTransform(
  face: EnclosureFace,
  offsetU: number,
  offsetV: number,
  depth: number,
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
  lidY: number,
): {
  position: [number, number, number];
  rotation: [number, number, number];
} {
  if (face === "top") {
    const topSurfaceY =
      getRemovableFaces(parameters).includes("top")
        ? lidY
        : parameters.baseHeight + parameters.lidThickness;
    return {
      position: [offsetU, topSurfaceY - depth / 2, offsetV],
      rotation: [Math.PI, 0, 0],
    };
  }
  if (face === "bottom") {
    const bottomY = getPreviewInteriorBottomY(parameters);
    return {
      position: [offsetU, bottomY + depth / 2, offsetV],
      rotation: [0, 0, 0],
    };
  }
  if (face === "front") {
    return {
      position: [
        offsetU,
        parameters.baseHeight / 2 + offsetV,
        dimensions.insideWidth / 2 - depth / 2,
      ],
      rotation: [-Math.PI / 2, 0, 0],
    };
  }
  if (face === "back") {
    return {
      position: [
        offsetU,
        parameters.baseHeight / 2 + offsetV,
        -dimensions.insideWidth / 2 + depth / 2,
      ],
      rotation: [Math.PI / 2, 0, 0],
    };
  }
  if (face === "right") {
    return {
      position: [
        dimensions.insideLength / 2 - depth / 2,
        parameters.baseHeight / 2 + offsetV,
        offsetU,
      ],
      rotation: [0, 0, Math.PI / 2],
    };
  }
  return {
    position: [
      -dimensions.insideLength / 2 + depth / 2,
      parameters.baseHeight / 2 + offsetV,
      offsetU,
    ],
    rotation: [0, 0, -Math.PI / 2],
  };
}

function addBatteryCompartmentPreview(
  root: THREE.Group,
  placement: BatteryCompartmentPlacement,
  parameters: DesignerParameters,
  lidY: number,
  selected: boolean,
): void {
  const dimensions = deriveEnclosureDimensions(parameters);
  const transform = getInteriorFaceMountTransform(
    placement.face,
    placement.offsetX,
    placement.offsetZ,
    placement.height,
    parameters,
    dimensions,
    lidY,
  );
  const partCenterY = (height: number, clearance = 0) =>
    -placement.height / 2 + height / 2 + clearance;
  const openSide = placement.insertionSide;
  const group = new THREE.Group();
  group.name = `battery-transform-${placement.id}`;
  group.position.set(...transform.position);
  group.rotation.set(...transform.rotation);
  group.rotateY(THREE.MathUtils.degToRad(placement.rotation));
  group.userData = {
    partId: "battery",
    featureId: placement.id,
    featureKind: "battery",
    face: placement.face,
  };
  root.add(group);

  const trayMaterial = standardMaterial(0x3d6652, selected, {
    roughness: 0.58,
  });
  const contactMaterial = standardMaterial(0x55605b, selected, {
    metalness: 0.38,
    roughness: 0.34,
  });
  const retentionMaterial = standardMaterial(
    placement.retentionType === "elastic" ? 0x171a18 : 0x33463e,
    selected,
    {
      roughness: placement.retentionType === "elastic" ? 0.72 : 0.54,
      metalness: 0.02,
    },
  );
  const layout = getBatteryCompartmentLayout(placement);
  const preset = layout.preset;

  if (preset.shape === "cylinder") {
    const railHeight = layout.railHeight;
    const railY = partCenterY(railHeight);
    const sideRailLength = placement.width;
    const innerLength = Math.max(2, placement.width - placement.wallThickness * 2);
    const contactBlockWidth = Math.max(placement.wallThickness, layout.terminalAllowance);
    const contactBlockDepth = Math.max(
      3,
      Math.min(
        preset.cellWidth + placement.clearance * 2,
        layout.lanePitch > 0
          ? layout.lanePitch - placement.wallThickness
          : layout.innerDepth,
      ),
    );

    for (const [name, z] of [
      ["left", -placement.depth / 2 + placement.wallThickness / 2],
      ["right", placement.depth / 2 - placement.wallThickness / 2],
    ] as const) {
      const rail = addMesh(
        group,
        new THREE.BoxGeometry(sideRailLength, railHeight, placement.wallThickness),
        trayMaterial,
        "battery",
        [0, railY, z],
      );
      rail.name = `${placement.id}-side-rail-${name}`;
    }

    for (let index = 1; index < layout.laneCenters.length; index += 1) {
      const z = (layout.laneCenters[index - 1] + layout.laneCenters[index]) / 2;
      const divider = addMesh(
        group,
        new THREE.BoxGeometry(innerLength, railHeight, placement.wallThickness),
        trayMaterial,
        "battery",
        [0, railY, z],
      );
      divider.name = `${placement.id}-divider-${index}`;
    }

    layout.laneCenters.forEach((z, index) => {
      for (const { side, x, entrySide } of [
        {
          side: "negative",
          x: -placement.width / 2 + contactBlockWidth / 2,
          entrySide: "left",
        },
        {
          side: "positive",
          x: placement.width / 2 - contactBlockWidth / 2,
          entrySide: "right",
        },
      ] as const) {
        if (openSide === entrySide) {
          const guideHeight = Math.max(1, railHeight * 0.32);
          const entryGuide = addMesh(
            group,
            new THREE.BoxGeometry(contactBlockWidth * 0.55, guideHeight, contactBlockDepth),
            trayMaterial,
            "battery",
            [x, partCenterY(guideHeight), z],
          );
          entryGuide.name = `${placement.id}-entry-guide-${index + 1}-${side}`;
        } else {
          const endStop = addMesh(
            group,
            new THREE.BoxGeometry(contactBlockWidth, railHeight, contactBlockDepth),
            trayMaterial,
            "battery",
            [x, railY, z],
          );
          endStop.name = `${placement.id}-end-stop-${index + 1}-${side}`;
        }

        const contact = addMesh(
          group,
          new THREE.BoxGeometry(
            0.45,
            Math.min(preset.cellHeight * 0.62, railHeight + 1.2),
            Math.min(preset.cellWidth * 0.68, contactBlockDepth),
          ),
          contactMaterial.clone(),
          "battery",
          [
            side === "negative"
              ? -preset.cellLength / 2 - placement.clearance
              : preset.cellLength / 2 + placement.clearance,
            preset.cellHeight / 2 - placement.height / 2 + 0.2,
            z,
          ],
          false,
        );
        contact.name = `${placement.id}-contact-${index + 1}-${side}`;
      }
    });
  } else {
    const railY = partCenterY(placement.height);
    const sideRailLength = placement.width;
    for (const [name, z] of [
      ["left", -placement.depth / 2 + placement.wallThickness / 2],
      ["right", placement.depth / 2 - placement.wallThickness / 2],
    ] as const) {
      const rail = addMesh(
        group,
        new THREE.BoxGeometry(sideRailLength, placement.height, placement.wallThickness),
        trayMaterial,
        "battery",
        [0, railY, z],
      );
      rail.name = `${placement.id}-side-rail-${name}`;
    }
    const closedX =
      openSide === "right"
        ? -placement.width / 2 + placement.wallThickness / 2
        : placement.width / 2 - placement.wallThickness / 2;
    const openX =
      openSide === "right"
        ? placement.width / 2 - placement.wallThickness / 2
        : -placement.width / 2 + placement.wallThickness / 2;
    const endStop = addMesh(
      group,
      new THREE.BoxGeometry(placement.wallThickness, placement.height, placement.depth),
      trayMaterial,
      "battery",
      [closedX, railY, 0],
    );
    endStop.name = `${placement.id}-box-end-stop`;
    const entryGuideHeight = Math.max(1, placement.height * 0.28);
    const entryGuide = addMesh(
      group,
      new THREE.BoxGeometry(placement.wallThickness * 0.65, entryGuideHeight, placement.depth),
      trayMaterial,
      "battery",
      [openX, partCenterY(entryGuideHeight), 0],
    );
    entryGuide.name = `${placement.id}-box-entry-guide`;
  }

  if (placement.retentionType === "elastic") {
    const postRadius = Math.max(0.7, placement.wallThickness * 0.45);
    const hookHeight = Math.max(2.4, placement.wallThickness * 1.9);
    const hookY = partCenterY(hookHeight);
    const hookX = openSide === "right"
      ? placement.width / 2 - Math.max(placement.wallThickness * 2, 3)
      : -placement.width / 2 + Math.max(placement.wallThickness * 2, 3);
    for (const [name, z] of [
      ["left", -placement.depth / 2 - postRadius * 1.4],
      ["right", placement.depth / 2 + postRadius * 1.4],
    ] as const) {
      const hook = addCylinder(
        group,
        postRadius,
        hookHeight,
        [hookX, hookY, z],
        trayMaterial,
        "battery",
        20,
      );
      hook.name = `${placement.id}-elastic-hook-${name}`;
    }
    const bandY = -placement.height / 2 + preset.cellHeight + 0.85;
    const band = addMesh(
      group,
      new THREE.BoxGeometry(
        Math.max(placement.wallThickness * 1.8, 2.6),
        0.6,
        placement.depth + postRadius * 5,
      ),
      retentionMaterial,
      "battery",
      [hookX, bandY, 0],
      false,
    );
    band.name = `${placement.id}-elastic-band`;
  } else if (placement.retentionType === "clip") {
    const clipHeight = Math.max(0.7, placement.wallThickness * 0.55);
    const clipDepth = Math.max(1.2, placement.wallThickness * 1.1);
    const clipY = -placement.height / 2 + placement.height * 0.7;
    for (const [name, z] of [
      ["left", -placement.depth / 2 + placement.wallThickness + clipDepth / 2],
      ["right", placement.depth / 2 - placement.wallThickness - clipDepth / 2],
    ] as const) {
      const clip = addMesh(
        group,
        new THREE.BoxGeometry(Math.max(6, placement.width * 0.22), clipHeight, clipDepth),
        retentionMaterial,
        "battery",
        [0, clipY, z],
      );
      clip.name = `${placement.id}-retention-clip-${name}`;
    }
  }

  const cellMaterial = standardMaterial(
    preset.id === "lipo" ? 0x9aa3a0 : 0xc5a94f,
    selected,
    {
      metalness: preset.shape === "cylinder" ? 0.32 : 0.06,
      roughness: 0.4,
      transparent: true,
      opacity: 0.62,
    },
  );
  layout.laneCenters.forEach((z, index) => {
    const geometry =
      preset.shape === "cylinder"
        ? new THREE.CylinderGeometry(
            preset.cellWidth / 2,
            preset.cellWidth / 2,
            preset.cellLength,
            28,
          ).rotateZ(Math.PI / 2)
        : new THREE.BoxGeometry(
            preset.cellLength,
            preset.cellHeight,
            preset.cellWidth,
          );
    const cell = addMesh(
      group,
      geometry,
      cellMaterial.clone(),
        "battery",
        [
          0,
          preset.cellHeight / 2 - placement.height / 2 + 0.2,
          z,
        ],
    );
    cell.name = `${placement.id}-cell-${index + 1}`;
  });
  cellMaterial.dispose();
  contactMaterial.dispose();
}

function rotateSurfaceOffset(
  u: number,
  v: number,
  rotation: number,
): readonly [number, number] {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90) return [v, -u];
  if (normalized === 180) return [-u, -v];
  if (normalized === 270) return [-v, u];
  return [u, v];
}

function getRotatedSurfaceSize(
  width: number,
  height: number,
  rotation: number,
): readonly [number, number] {
  return rotation === 90 || rotation === 270
    ? [height, width]
    : [width, height];
}

function addLcdwikiDisplayPreview(
  group: THREE.Group,
  connector: ConnectorDefinition,
  featureId: string,
  rotation: number,
  face: EnclosureFace,
  surfaceU: number,
  surfaceV: number,
  surfaceOutset: number,
  origin: readonly [number, number, number],
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
  lidY: number,
  followRemovableFace: boolean,
  displayMountingType: DisplayMountingType | undefined,
  selected: boolean,
): void {
  const spec = connector.displaySpec;
  if (!spec) return;

  const normalOffset = (u: number, v: number, offset: number) => {
    const [rotatedU, rotatedV] = rotateSurfaceOffset(u, v, rotation);
    return relativePosition(
      getPreviewFacePosition(
        face,
        surfaceU + rotatedU,
        surfaceV + rotatedV,
        offset,
        parameters,
        dimensions,
        lidY,
        followRemovableFace,
      ),
      origin,
    );
  };
  const addDisplayMesh = (
    name: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    u: number,
    v: number,
    offset: number,
    showEdges = true,
  ) => {
    const mesh = addMesh(
      group,
      geometry,
      material,
      "connector",
      normalOffset(u, v, offset),
      showEdges,
    );
    mesh.name = `${featureId}-${name}`;
    mesh.userData.featureId = featureId;
    mesh.userData.featureKind = "connector";
    return mesh;
  };
  const addDisplayOutline = (
    name: string,
    geometry: THREE.BufferGeometry,
    color: THREE.ColorRepresentation,
    opacity: number,
    u: number,
    v: number,
    offset: number,
  ) => {
    const outline = addPreviewOutline(
      group,
      geometry,
      color,
      opacity,
      "connector",
      normalOffset(u, v, offset),
    );
    outline.name = `${featureId}-${name}`;
    outline.userData.featureId = featureId;
    outline.userData.featureKind = "connector";
    return outline;
  };
  const faceBox = (width: number, height: number, depth: number) => {
    const [rotatedWidth, rotatedHeight] = getRotatedSurfaceSize(
      width,
      height,
      rotation,
    );
    return createFaceBoxGeometry(rotatedWidth, rotatedHeight, depth, face);
  };
  const facePlane = (width: number, height: number) => {
    const [rotatedWidth, rotatedHeight] = getRotatedSurfaceSize(
      width,
      height,
      rotation,
    );
    return createFacePlaneGeometry(rotatedWidth, rotatedHeight, face);
  };
  const faceCylinder = (radius: number, depth: number, segments = 28) =>
    createFaceCylinderGeometry(radius, depth, face, segments);

  const frontSurfaceOffset = surfaceOutset + 0.5;
  const totalDepth = connector.visualGeometry.depth;
  const displayPackageStyle = spec.packageStyle ?? "pcb-module";
  const displayOffsetU = spec.displayOffsetU ?? 0;
  const displayOffsetV = spec.displayOffsetV ?? 0;
  const displayActiveColor =
    spec.activeColor ?? (spec.panelKind === "oled" ? "#f0d34a" : "#1f6f91");

  if (
    displayPackageStyle === "bare-oled" ||
    displayPackageStyle === "oled-module"
  ) {
    const panelWidth = spec.panelWidth ?? spec.pcbWidth;
    const panelHeight = spec.panelHeight ?? spec.pcbHeight;
    const glassDepth = Math.max(0.45, Math.min(1.2, totalDepth));
    const glassCenterOffset = frontSurfaceOffset - glassDepth / 2;

    if (displayPackageStyle === "oled-module") {
      const pcbThickness = Math.max(0.8, Math.min(1.25, totalDepth - 0.55));
      const pcbCenterOffset =
        frontSurfaceOffset - totalDepth + pcbThickness / 2;
      const pcbFrontOffset = pcbCenterOffset + pcbThickness / 2 + 0.04;
      addDisplayMesh(
        "display-pcb",
        faceBox(spec.pcbWidth, spec.pcbHeight, pcbThickness),
        standardMaterial(0x155c78, selected, {
          metalness: 0.06,
          roughness: 0.55,
        }),
        0,
        0,
        pcbCenterOffset,
      );
      addDisplayMesh(
        "display-oled-glass",
        faceBox(panelWidth, panelHeight, glassDepth),
        standardMaterial(0x111716, selected, {
          metalness: 0.18,
          roughness: 0.26,
        }),
        displayOffsetU,
        displayOffsetV,
        glassCenterOffset,
      );

      const padPitch = Math.min(2.15, (spec.pcbHeight - 2.4) / Math.max(1, spec.headerPins - 1));
      const padStripU = -spec.pcbWidth / 2 + 5.1;
      const padStartV = -padPitch * (spec.headerPins - 1) / 2;
      for (let index = 0; index < spec.headerPins; index += 1) {
        addDisplayMesh(
          `display-side-pad-${index + 1}`,
          faceBox(1.35, 0.86, 0.14),
          standardMaterial(0xd7b24a, selected, {
            metalness: 0.74,
            roughness: 0.24,
          }),
          padStripU,
          padStartV + index * padPitch,
          pcbFrontOffset + 0.08,
          false,
        );
      }
    } else {
      addDisplayMesh(
        "display-oled-glass",
        faceBox(panelWidth, panelHeight, glassDepth),
        standardMaterial(0x101615, selected, {
          metalness: 0.16,
          roughness: 0.24,
        }),
        0,
        0,
        glassCenterOffset,
      );

      const tailLength = spec.fpcTailLength ?? 10;
      const tailWidth = spec.fpcWidth ?? Math.min(9, panelHeight);
      const tailCenterU = -panelWidth / 2 - tailLength / 2 + 0.25;
      const tailCenterV = displayOffsetV;
      addDisplayMesh(
        "display-flex-tail",
        faceBox(tailLength, tailWidth, 0.14),
        standardMaterial(0xc38a2f, selected, {
          metalness: 0.22,
          roughness: 0.42,
        }),
        tailCenterU,
        tailCenterV,
        frontSurfaceOffset - 0.04,
      );
      addDisplayMesh(
        "display-flex-stiffener",
        faceBox(1.7, tailWidth + 0.3, 0.18),
        standardMaterial(0xe7d57d, selected, {
          metalness: 0.34,
          roughness: 0.36,
        }),
        tailCenterU - tailLength / 2 + 0.85,
        tailCenterV,
        frontSurfaceOffset + 0.03,
      );

      const padPitch = Math.min(
        0.65,
        (tailWidth - 1.2) / Math.max(1, spec.headerPins - 1),
      );
      const padHeight = Math.max(0.24, Math.min(0.38, padPitch * 0.62));
      const padStartV = -padPitch * (spec.headerPins - 1) / 2;
      const padU = tailCenterU - tailLength / 2 + 0.72;
      for (let index = 0; index < spec.headerPins; index += 1) {
        addDisplayMesh(
          `display-flex-pad-${index + 1}`,
          faceBox(0.76, padHeight, 0.08),
          standardMaterial(0xf0d878, selected, {
            metalness: 0.72,
            roughness: 0.22,
          }),
          padU,
          padStartV + index * padPitch,
          frontSurfaceOffset + 0.08,
          false,
        );
      }
    }

    addDisplayMesh(
      "display-active-area",
      facePlane(spec.activeAreaWidth, spec.activeAreaHeight),
      standardMaterial(displayActiveColor, selected, {
        metalness: 0.04,
        roughness: 0.16,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      }),
      displayOffsetU,
      displayOffsetV,
      frontSurfaceOffset + 0.1,
      false,
    ).renderOrder = 8;
    addDisplayOutline(
      "display-window-outline",
      facePlane(spec.windowWidth, spec.windowHeight),
      0xf0d34a,
      0.72,
      displayOffsetU,
      displayOffsetV,
      frontSurfaceOffset + 0.12,
    );
    return;
  }

  const pcbThickness = 1.6;
  const pcbCenterOffset =
    frontSurfaceOffset - totalDepth + pcbThickness / 2;
  const pcbFrontOffset = pcbCenterOffset + pcbThickness / 2 + 0.04;
  const pcbBackOffset = pcbCenterOffset - pcbThickness / 2 - 0.04;
  const glassDepth = Math.max(0.8, Math.min(2.4, totalDepth - pcbThickness - 0.25));
  const glassCenterOffset = frontSurfaceOffset - glassDepth / 2;
  const screenOffsetV =
    spec.diagonalInch <= 2.2
      ? 0.6
      : spec.diagonalInch <= 2.4
        ? 2.2
        : spec.diagonalInch <= 2.8
          ? 3.4
          : spec.diagonalInch <= 3.2
            ? 3.6
            : spec.diagonalInch <= 3.5
              ? 3.8
              : 4.6;
  const lcdOuterWidth = Math.min(
    spec.pcbWidth,
    spec.windowWidth + (spec.touch === "resistive" ? 5.4 : 6.2),
  );
  const lcdOuterHeight = Math.min(
    spec.pcbHeight - 4,
    spec.windowHeight + (spec.touch === "resistive" ? 8.8 : 10),
  );

  addDisplayMesh(
    "display-pcb",
    faceBox(spec.pcbWidth, spec.pcbHeight, pcbThickness),
    standardMaterial(0x24543c, selected, {
      metalness: 0.08,
      roughness: 0.52,
    }),
    0,
    0,
    pcbCenterOffset,
  );
  addDisplayMesh(
    "display-lcd-panel",
    faceBox(lcdOuterWidth, lcdOuterHeight, glassDepth),
    standardMaterial(0x111716, selected, {
      metalness: 0.18,
      roughness: 0.3,
    }),
    0,
    screenOffsetV,
    glassCenterOffset,
  );
  if (spec.touch === "resistive") {
    addDisplayMesh(
      "display-touch-overlay",
      facePlane(spec.windowWidth, spec.windowHeight),
      standardMaterial(0x8ec7cf, selected, {
        metalness: 0.02,
        roughness: 0.08,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      }),
      0,
      screenOffsetV,
      frontSurfaceOffset + 0.075,
      false,
    ).renderOrder = 7;
  }
  addDisplayMesh(
    "display-active-area",
    facePlane(spec.activeAreaWidth, spec.activeAreaHeight),
    standardMaterial(displayActiveColor, selected, {
      metalness: 0.04,
      roughness: 0.16,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
    0,
    screenOffsetV,
    frontSurfaceOffset + 0.1,
    false,
  ).renderOrder = 8;
  addDisplayOutline(
    "display-window-outline",
    facePlane(spec.windowWidth, spec.windowHeight),
    0x6ad0df,
    0.72,
    0,
    screenOffsetV,
    frontSurfaceOffset + 0.12,
  );

  const headerPitch = 2.54;
  const headerWidth = (spec.headerPins - 1) * headerPitch;
  const headerV = -spec.pcbHeight / 2 + 5.1;
  addDisplayMesh(
    "display-header-body",
    faceBox(headerWidth + 2.6, 3.4, 1.25),
    standardMaterial(0x202321, selected, {
      metalness: 0.12,
      roughness: 0.44,
    }),
    0,
    headerV,
    pcbFrontOffset + 0.62,
  );
  for (let index = 0; index < spec.headerPins; index += 1) {
    const pinU = -headerWidth / 2 + index * headerPitch;
    addDisplayMesh(
      `display-header-pin-${index + 1}`,
      faceBox(0.78, 2.6, 0.34),
      standardMaterial(0xd7b24a, selected, {
        metalness: 0.78,
        roughness: 0.24,
      }),
      pinU,
      headerV,
      pcbFrontOffset + 0.22,
      false,
    );
  }

  const holeU = spec.pcbWidth / 2 - 3;
  const holeV = spec.pcbHeight / 2 - 3;
  const mountingHolePositions: ReadonlyArray<readonly [number, number]> = [
    [-holeU, -holeV],
    [holeU, -holeV],
    [-holeU, holeV],
    [holeU, holeV],
  ];
  mountingHolePositions.forEach(([u, v], index) => {
    addDisplayMesh(
      `display-mount-pad-${index + 1}`,
      faceCylinder(2.35, 0.1, 32),
      standardMaterial(0xc9a34d, selected, {
        metalness: 0.58,
        roughness: 0.28,
      }),
      u,
      v,
      pcbFrontOffset + 0.08,
      false,
    );
    addDisplayMesh(
      `display-mount-hole-${index + 1}`,
      faceCylinder(1.6, 0.12, 32),
      standardMaterial(0x101413, selected, {
        metalness: 0.02,
        roughness: 0.66,
      }),
      u,
      v,
      pcbFrontOffset + 0.12,
      false,
    );
  });

  if (displayMountingType === "screw") {
    const bossDepth = Math.max(0.8, Math.abs(surfaceOutset - pcbBackOffset));
    const bossCenterOffset = (surfaceOutset + pcbBackOffset) / 2;
    mountingHolePositions.forEach(([u, v], index) => {
      addDisplayMesh(
        `display-screw-boss-${index + 1}`,
        faceCylinder(2.55, bossDepth, 32),
        standardMaterial(0x9f9a8b, selected, {
          metalness: 0.02,
          roughness: 0.58,
        }),
        u,
        v,
        bossCenterOffset,
      );
      addDisplayMesh(
        `display-screw-${index + 1}`,
        faceCylinder(1.18, 0.42, 32),
        standardMaterial(0xbfc4c6, selected, {
          metalness: 0.78,
          roughness: 0.2,
        }),
        u,
        v,
        pcbFrontOffset + 0.32,
        false,
      );
    });
  }

  const chipOffset = pcbBackOffset - 0.38;
  const chipMaterial = standardMaterial(0x202423, selected, {
    metalness: 0.12,
    roughness: 0.5,
  });
  [
    [spec.pcbWidth / 2 - 10, -spec.pcbHeight / 2 + 20, 7, 5],
    [spec.pcbWidth / 2 - 17, -spec.pcbHeight / 2 + 12, 4.5, 2.6],
    [spec.pcbWidth / 2 - 7, -spec.pcbHeight / 2 + 10, 3.2, 2.2],
    [-spec.pcbWidth / 2 + 9, -spec.pcbHeight / 2 + 11, 4, 2.4],
  ].forEach(([u, v, width, height], index) => {
    addDisplayMesh(
      `display-smd-${index + 1}`,
      faceBox(width, height, 0.75),
      chipMaterial.clone(),
      u,
      v,
      chipOffset,
      false,
    );
  });
  chipMaterial.dispose();

  const tailMaterial = standardMaterial(
    spec.touch === "resistive" ? 0x2ca078 : 0xc7b37b,
    selected,
    {
      metalness: 0.04,
      roughness: 0.42,
      transparent: true,
      opacity: spec.touch === "resistive" ? 0.82 : 0.68,
    },
  );
  addDisplayMesh(
    spec.touch === "resistive" ? "display-touch-tail" : "display-pull-tape",
    faceBox(spec.touch === "resistive" ? 9 : 6, spec.touch === "resistive" ? 7 : 4, 0.22),
    tailMaterial,
    Math.min(spec.pcbWidth / 2 - 4, spec.windowWidth / 2 + 3.5),
    screenOffsetV + spec.windowHeight / 2 - 8,
    frontSurfaceOffset + 0.18,
    false,
  );
}

function addPcbRailMountingPreview(
  root: THREE.Group,
  envelope: PcbMountingEnvelope,
  parameters: DesignerParameters,
  selected: boolean,
): void {
  if (parameters.pcbMountingType === "screw") return;

  const layout = getEffectivePcbRailLayout(parameters, envelope);
  const railDirection = getPcbRailDirection(parameters, envelope.rotation);
  const group = new THREE.Group();
  group.name = `pcb-mount-transform-${envelope.id}`;
  group.position.set(envelope.offsetX, 0, envelope.offsetZ);
  group.rotation.y =
    THREE.MathUtils.degToRad(envelope.rotation) +
    (railDirection.axis === "z" ? -Math.PI / 2 : 0);
  group.userData = {
    partId: "base",
    featureId: envelope.id,
    featureKind: "pcb-mount",
  };
  root.add(group);

  const railMaterial = standardMaterial(0x3d6652, selected, {
    roughness: 0.58,
  });
  const screwMaterial = standardMaterial(0x59615d, selected, {
    metalness: 0.66,
    roughness: 0.28,
  });
  const bandMaterial = standardMaterial(0x171a18, selected, {
    roughness: 0.72,
  });
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
  const lowerLedgeY = layout.boardBottom - layout.ledgeThickness / 2 + 0.04;
  const topLipY =
    layout.boardTop + slotClearance + layout.lipThickness / 2;
  const stopBottomY = lowerLedgeY - layout.ledgeThickness / 2;
  const stopTopY = topLipY + layout.lipThickness / 2;
  const stopHeight = stopTopY - stopBottomY;
  const stopCenterY = (stopTopY + stopBottomY) / 2;
  const sideWebHeight = stopHeight;
  const sideWebCenterY = stopCenterY;
  const sideWebDepth = Math.max(
    0.8,
    faceReach > 0.12 ? faceReach - Math.min(slotClearance, 0.08) : faceReach,
  );
  const closedEdgeX = -layout.openSideSign * (layout.travelLength / 2);
  const stopLength = layout.stopWidth + faceReach;
  const stopCenterX =
    closedEdgeX + layout.openSideSign * (layout.stopWidth / 2 - faceReach / 2);

  for (const [name, sideSign] of [
    ["left", -1],
    ["right", 1],
  ] as const) {
    const ledgeDepth = faceReach + ledgeCaptureOverlap;
    const ledgeCenterZ =
      sideSign *
      (layout.travelWidth / 2 + faceReach / 2 - ledgeCaptureOverlap / 2);
    const ledge = addMesh(
      group,
      new THREE.BoxGeometry(
        railLength,
        layout.ledgeThickness,
        ledgeDepth,
      ),
      railMaterial,
      "base",
      [
        railCenterX,
        lowerLedgeY,
        ledgeCenterZ,
      ],
    );
    ledge.name = `${envelope.id}-pcb-rail-${name}-lower-ledge`;

    const lipDepth = faceReach + lipCaptureOverlap;
    const lipCenterZ =
      sideSign *
      (layout.travelWidth / 2 + faceReach / 2 - lipCaptureOverlap / 2);
    const lip = addMesh(
      group,
      new THREE.BoxGeometry(
        railLength,
        layout.lipThickness,
        lipDepth,
      ),
      railMaterial,
      "base",
      [
        railCenterX,
        topLipY,
        lipCenterZ,
      ],
    );
    lip.name = `${envelope.id}-pcb-rail-${name}-top-lip`;

    const sideWebCenterZ =
      sideSign * (layout.travelWidth / 2 + faceReach - sideWebDepth / 2);
    const sideWeb = addMesh(
      group,
      new THREE.BoxGeometry(railLength, sideWebHeight, sideWebDepth),
      railMaterial,
      "base",
      [railCenterX, sideWebCenterY, sideWebCenterZ],
    );
    sideWeb.name = `${envelope.id}-pcb-rail-${name}-side-web`;
  }

  const stop = addMesh(
    group,
    new THREE.BoxGeometry(
      stopLength,
      stopHeight,
      layout.travelWidth + faceReach * 2,
    ),
    railMaterial,
    "base",
    [stopCenterX, stopCenterY, 0],
  );
  stop.name = `${envelope.id}-pcb-rail-closed-stop`;

  if (parameters.pcbMountingType === "rail-screw") {
    for (const sideSign of [-1, 1] as const) {
      const screw = addCylinder(
        group,
        1.8,
        0.9,
        [
          layout.openSideSign * (layout.travelLength / 2 - 2),
          topLipY + layout.lipThickness / 2 + 0.45,
          sideSign *
            (layout.travelWidth / 2 +
              Math.min(parameters.pcbRailWidth / 2, faceReach / 2)),
        ],
        screwMaterial,
        "base",
        24,
      );
      screw.name = `${envelope.id}-pcb-rail-lock-screw-${sideSign > 0 ? "right" : "left"}`;
    }
  } else {
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
    const openInsideX =
      layout.openSideX -
      layout.openSideSign * Math.max(1.2, parameters.pcbElasticBandWidth / 2);
    const openWrapReach = Math.max(
      0,
      Math.min(
        Math.max(0.4, parameters.pcbRailClearance + bandRadius),
        faceReach - bandRadius * 1.2,
      ),
    );
    const openWrapX =
      layout.openSideX +
      layout.openSideSign * openWrapReach;
    const closedWrapX =
      anchorX -
      layout.openSideSign * Math.max(1.2, anchorRadius + bandRadius);
    const topY = layout.boardTop + bandRadius + 0.08;
    const bottomY = layout.boardBottom - bandRadius - 0.08;
    const midY = (topY + bottomY) / 2;
    const bottomRetainerCenterY = Math.max(
      layout.boardBottom - anchorHeight + retainerHeight / 2,
      bottomY - bandRadius - retainerGap - retainerHeight / 2,
    );
    const topRetainerCenterY = Math.min(
      layout.boardTop + anchorHeight - retainerHeight / 2,
      topY + bandRadius + retainerGap + retainerHeight / 2,
    );
    const laneOffset = Math.max(
      parameters.pcbElasticBandWidth * 1.8,
      Math.min(layout.travelWidth * 0.28, layout.travelWidth / 2 - 8),
    );
    const laneZs =
      laneOffset > 0
        ? [-laneOffset, laneOffset]
        : [-layout.travelWidth * 0.2, layout.travelWidth * 0.2];

    laneZs.forEach((laneZ, index) => {
      const topAnchor = addCylinder(
        group,
        anchorRadius,
        anchorHeight,
        [anchorX, layout.boardTop + anchorHeight / 2, laneZ],
        railMaterial,
        "base",
        20,
      );
      topAnchor.name = `${envelope.id}-pcb-elastic-anchor-${index + 1}`;

      const topRetainer = addCylinder(
        group,
        retainerRadius,
        retainerHeight,
        [anchorX, topRetainerCenterY, laneZ],
        railMaterial,
        "base",
        24,
      );
      topRetainer.name = `${envelope.id}-pcb-elastic-anchor-${index + 1}-top-retainer`;

      const bottomAnchor = addCylinder(
        group,
        anchorRadius,
        anchorHeight,
        [anchorX, layout.boardBottom - anchorHeight / 2, laneZ],
        railMaterial,
        "base",
        20,
      );
      bottomAnchor.name = `${envelope.id}-pcb-elastic-anchor-${index + 1}-bottom`;

      const bottomRetainer = addCylinder(
        group,
        retainerRadius,
        retainerHeight,
        [anchorX, bottomRetainerCenterY, laneZ],
        railMaterial,
        "base",
        24,
      );
      bottomRetainer.name = `${envelope.id}-pcb-elastic-anchor-${index + 1}-bottom-retainer`;

      const bandPath = new THREE.CatmullRomCurve3(
        [
          new THREE.Vector3(anchorX, topY, laneZ),
          new THREE.Vector3(openInsideX, topY, laneZ),
          new THREE.Vector3(openWrapX, midY, laneZ),
          new THREE.Vector3(openInsideX, bottomY, laneZ),
          new THREE.Vector3(anchorX, bottomY, laneZ),
          new THREE.Vector3(closedWrapX, midY, laneZ),
        ],
        true,
        "catmullrom",
        0.08,
      );
      const band = addMesh(
        group,
        new THREE.TubeGeometry(bandPath, 48, bandRadius, 10, true),
        bandMaterial,
        "base",
        [0, 0, 0],
        false,
      );
      band.name = `${envelope.id}-pcb-elastic-band-loop-${index + 1}`;
    });
  }
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
    const headRecessDepth = getClosureScrewHeadRecessDepth(parameters);
    const bottomY = getPreviewInteriorBottomY(parameters);
    const bossMaterial = standardMaterial(
      getMaterial(parameters.shellMaterialId).color,
      selectedPart === "base",
    );
    const screwMaterial = standardMaterial(0x48514e, selectedPart === "lid", {
      metalness: 0.62,
      roughness: 0.28,
    });
    for (const [pointX, pointZ] of points) {
      const bossHeight = Math.max(5, parameters.baseHeight - bottomY - 2);
      addCylinder(
        root,
        fastener.bossDiameter / 2,
        bossHeight,
        [pointX, bottomY + bossHeight / 2, pointZ],
        bossMaterial,
        "base",
      );
      const screwHead = addCylinder(
        root,
        headRecessDepth > 0
          ? getClosureScrewHeadRecessRadius(fastener.clearanceDiameter) - 0.1
          : fastener.clearanceDiameter / 2,
        headRecessDepth > 0 ? headRecessDepth : parameters.lidThickness + 0.5,
        [
          pointX,
          headRecessDepth > 0
            ? lidY + parameters.lidThickness - headRecessDepth / 2 + 0.01
            : lidY + parameters.lidThickness / 2 + 0.2,
          pointZ,
        ],
        screwMaterial,
        "lid",
      );
      screwHead.name = "closure-screw-head";
    }
  }

  if (parameters.closureType === "magnet") {
    const geometry = MAGNET_GEOMETRY;
    const bottomY = getPreviewInteriorBottomY(parameters);
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
        const height = parameters.baseHeight - bottomY;
        const support = addCylinder(
          root,
          geometry.floorColumnRadius,
          height,
          [pointX, bottomY + height / 2, pointZ],
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

  if (parameters.closureType === "latch") {
    const tabMaterial = standardMaterial(
      getMaterial(parameters.shellMaterialId).color,
      selectedPart === "lid",
    );
    const receiverMaterial = standardMaterial(0x222a26, selectedPart === "base", {
      roughness: 0.82,
    });
    for (const direction of [-1, 1]) {
      const tabZ = direction * (outerWidth / 2 - 0.7);
      const tab = addMesh(
        root,
        new THREE.BoxGeometry(16, 7, 1.4),
        tabMaterial,
        "lid",
        [0, lidY + 0.5, tabZ],
      );
      tab.name = "quick-latch-tab";
      const pressPad = addMesh(
        root,
        new THREE.BoxGeometry(20, 2.8, 1.2),
        tabMaterial,
        "lid",
        [0, lidY - 2.1, direction * (outerWidth / 2 + 0.4)],
      );
      pressPad.name = "quick-latch-pad";
      const hook = addMesh(
        root,
        new THREE.BoxGeometry(18, 1.2, 1.4),
        tabMaterial,
        "lid",
        [0, lidY - 2.2, direction * (outerWidth / 2 + 0.2)],
      );
      hook.name = "quick-latch-hook";
      const receiver = addMesh(
        root,
        new THREE.BoxGeometry(18, 2.4, 0.08),
        receiverMaterial,
        "base",
        [0, parameters.baseHeight - 2.2, direction * (outerWidth / 2 + 0.01)],
      );
      receiver.name = "quick-latch-receiver";
    }
  }

  if (parameters.closureType === "spring-latch") {
    const shellMaterial = standardMaterial(
      getMaterial(parameters.shellMaterialId).color,
      selectedPart === "base",
    );
    const lidLatchMaterial = standardMaterial(
      getMaterial(parameters.shellMaterialId).color,
      selectedPart === "lid",
      { roughness: 0.62 },
    );
    const catchMaterial = standardMaterial(0x26302b, selectedPart === "base", {
      roughness: 0.84,
    });
    const springMaterial = standardMaterial(0xc7cfcb, selectedPart === "lid", {
      metalness: 0.72,
      roughness: 0.22,
    });
    const guideMaterial = standardMaterial(0x59615d, selectedPart === "base", {
      metalness: 0.34,
      roughness: 0.36,
    });
    for (const [pointX, pointZ] of points) {
      const signX = pointX >= 0 ? 1 : -1;
      const signZ = pointZ >= 0 ? 1 : -1;
      const seat = addCylinder(
        root,
        4.2,
        1.2,
        [pointX, parameters.baseHeight - 0.6, pointZ],
        shellMaterial,
        "base",
        32,
      );
      seat.name = "spring-latch-spring-seat";

      const guide = addCylinder(
        root,
        1.1,
        4.4,
        [pointX, parameters.baseHeight + 1.4, pointZ],
        guideMaterial,
        "base",
        24,
      );
      guide.name = "spring-latch-guide-post";

      const spring = addMesh(
        root,
        createCompressionSpringGeometry(2.8, 4.2, 3.6, 0.22),
        springMaterial,
        "lid",
        [pointX, parameters.baseHeight + 1.35, pointZ],
        false,
      );
      spring.name = "spring-latch-compression-spring";

      const cap = addCylinder(
        root,
        3.35,
        0.75,
        [pointX, lidY - 0.35, pointZ],
        lidLatchMaterial,
        "lid",
        32,
      );
      cap.name = "spring-latch-lid-spring-cap";

      const tab = addMesh(
        root,
        new THREE.BoxGeometry(11, 1.4, 3),
        lidLatchMaterial,
        "lid",
        [pointX - signX * 4.2, lidY - 1.05, pointZ],
      );
      tab.name = "spring-latch-rotor-tab";

      const catchRail = addMesh(
        root,
        new THREE.BoxGeometry(10, 2.3, 2.2),
        catchMaterial,
        "base",
        [pointX - signX * 4.4, parameters.baseHeight - 1.35, pointZ + signZ * 3],
      );
      catchRail.name = "spring-latch-catch-rail";

      const stop = addMesh(
        root,
        new THREE.BoxGeometry(2.2, 2.3, 8),
        catchMaterial,
        "base",
        [pointX - signX * 9.1, parameters.baseHeight - 1.35, pointZ],
      );
      stop.name = "spring-latch-rotation-stop";
    }
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

  if (parameters.closureType === "pin") {
    const pinMaterial = standardMaterial(0x66706b, selectedPart === "lid", {
      metalness: 0.35,
      roughness: 0.35,
    });
    const createKnuckle = (length: number) =>
      new THREE.CylinderGeometry(3.2, 3.2, length, 28).rotateZ(Math.PI / 2);
    const rodMaterial = standardMaterial(0xb7bfbb, selectedPart === "lid", {
      metalness: 0.78,
      roughness: 0.2,
    });
    for (const pointZ of [-outerWidth / 2, outerWidth / 2]) {
      addMesh(
        root,
        createKnuckle(14),
        pinMaterial,
        "base",
        [-outerLength / 2 + 13, parameters.baseHeight - 0.8, pointZ],
      ).name = "quick-pin-base-knuckle";
      addMesh(
        root,
        createKnuckle(14),
        pinMaterial,
        "base",
        [outerLength / 2 - 13, parameters.baseHeight - 0.8, pointZ],
      ).name = "quick-pin-base-knuckle";
      addMesh(
        root,
        createKnuckle(20),
        pinMaterial,
        "lid",
        [0, lidY + 1.4, pointZ],
      ).name = "quick-pin-lid-knuckle";
      addMesh(
        root,
        new THREE.CylinderGeometry(1.1, 1.1, outerLength - 10, 24).rotateZ(
          Math.PI / 2,
        ),
        rodMaterial,
        "lid",
        [0, lidY + 1.4, pointZ],
      ).name = "quick-pin-rod";
    }
  }

  }

function createRemovableFaceGeometry(
  parameters: DesignerParameters,
  dimensions: EnclosureDimensions,
  face: EnclosureFace,
  panels: readonly { offsetU: number; offsetV: number; width: number; height: number; insetDepth: number; cornerRadius: number; borderWidth: number; }[],
): THREE.ExtrudeGeometry {
  const [faceWidth, faceHeight] = getPreviewFaceSize(face, parameters, dimensions);
  const shape = createRoundedShape(faceWidth, faceHeight, parameters.cornerRadius);
  for (const panel of panels) {
    const inset = panel.insetDepth > 0;
    const [openingWidth, openingHeight] = getPanelOpeningSize(panel);
    shape.holes.push(createRoundedHole(
      inset ? panel.width + 0.3 : openingWidth,
      inset ? panel.height + 0.3 : openingHeight,
      inset ? panel.cornerRadius + 0.15 : getPanelInnerCornerRadius(panel),
      panel.offsetU,
      getFaceHoleV(face, panel.offsetV),
    ));
  }
  return createFaceExtrudedGeometry(shape, parameters.lidThickness, face);
}

function addGenericFaceClosureFeatures(
  root: THREE.Group,
  parameters: DesignerParameters,
  selectedPart: SelectablePart,
  lidFace: EnclosureFace,
  lidY: number,
  dimensions: EnclosureDimensions,
): void {
  const [faceWidth, faceHeight] = getPreviewFaceSize(lidFace, parameters, dimensions);
  const points = getClosurePoints(faceWidth, faceHeight, parameters.wallThickness);
  const shellColor = getMaterial(parameters.shellMaterialId).color;

  if (parameters.closureType === "screw") {
    const fastener = getFastenerDefinition(parameters.closureFastenerId);
    const headRecessDepth = getClosureScrewHeadRecessDepth(parameters);
    const baseMaterial = standardMaterial(shellColor, selectedPart === "base");
    const screwMaterial = standardMaterial(0x48514e, selectedPart === "lid", {
      metalness: 0.62,
      roughness: 0.28,
    });
    for (const [pointU, pointV] of points) {
      const bossPosition = getPreviewFacePosition(
        lidFace,
        pointU,
        pointV,
        -parameters.wallThickness / 2,
        parameters,
        dimensions,
        lidY,
      );
      const boss = addMesh(
        root,
        createFaceCylinderGeometry(
          fastener.bossDiameter / 2,
          Math.max(parameters.wallThickness, 2.4),
          lidFace,
        ),
        baseMaterial,
        "base",
        bossPosition,
        true,
        lidFace,
      );
      boss.name = "closure-side-boss";

      const headDepth =
        headRecessDepth > 0 ? headRecessDepth : parameters.lidThickness + 0.5;
      const headPosition = getPreviewFacePosition(
        lidFace,
        pointU,
        pointV,
        parameters.lidThickness - headDepth / 2 + 0.01,
        parameters,
        dimensions,
        lidY,
        true,
      );
      const screwHead = addMesh(
        root,
        createFaceCylinderGeometry(
          headRecessDepth > 0
            ? getClosureScrewHeadRecessRadius(fastener.clearanceDiameter) - 0.1
            : fastener.clearanceDiameter / 2,
          headDepth,
          lidFace,
        ),
        screwMaterial,
        "lid",
        headPosition,
        true,
        lidFace,
      );
      screwHead.name = "closure-screw-head";
    }
    return;
  }

  if (parameters.closureType === "magnet") {
    const magnetMaterial = standardMaterial(0xc9933d, selectedPart === "lid", {
      metalness: 0.72,
      roughness: 0.24,
    });
    for (const [pointU, pointV] of points) {
      const baseMagnet = addMesh(
        root,
        createFaceCylinderGeometry(
          MAGNET_GEOMETRY.diameter / 2,
          MAGNET_GEOMETRY.thickness,
          lidFace,
        ),
        magnetMaterial,
        "base",
        getPreviewFacePosition(
          lidFace,
          pointU,
          pointV,
          -MAGNET_GEOMETRY.thickness / 2,
          parameters,
          dimensions,
          lidY,
        ),
        true,
        lidFace,
      );
      baseMagnet.name = "base-magnet";
      const lidMagnet = addMesh(
        root,
        createFaceCylinderGeometry(
          MAGNET_GEOMETRY.diameter / 2,
          MAGNET_GEOMETRY.thickness,
          lidFace,
        ),
        magnetMaterial,
        "lid",
        getPreviewFacePosition(
          lidFace,
          pointU,
          pointV,
          parameters.lidThickness - MAGNET_GEOMETRY.thickness / 2,
          parameters,
          dimensions,
          lidY,
          true,
        ),
        true,
        lidFace,
      );
      lidMagnet.name = "lid-magnet";
    }
    return;
  }

  if (parameters.closureType === "spring-latch") {
    const baseMaterial = standardMaterial(shellColor, selectedPart === "base");
    const lidLatchMaterial = standardMaterial(shellColor, selectedPart === "lid", {
      roughness: 0.62,
    });
    const springMaterial = standardMaterial(0xc7cfcb, selectedPart === "lid", {
      metalness: 0.72,
      roughness: 0.22,
    });
    const catchMaterial = standardMaterial(0x26302b, selectedPart === "base", {
      roughness: 0.84,
    });
    for (const [pointU, pointV] of points) {
      const springSeat = addMesh(
        root,
        createFaceCylinderGeometry(4.2, 1.2, lidFace),
        baseMaterial,
        "base",
        getPreviewFacePosition(
          lidFace,
          pointU,
          pointV,
          -0.6,
          parameters,
          dimensions,
          lidY,
        ),
        true,
        lidFace,
      );
      springSeat.name = "spring-latch-side-spring-seat";

      const springMarker = addMesh(
        root,
        createFaceCylinderGeometry(2.8, 3.6, lidFace, 24),
        springMaterial,
        "lid",
        getPreviewFacePosition(
          lidFace,
          pointU,
          pointV,
          parameters.lidThickness / 2,
          parameters,
          dimensions,
          lidY,
          true,
        ),
        false,
        lidFace,
      );
      springMarker.name = "spring-latch-side-spring-envelope";

      const rotorTab = addMesh(
        root,
        createFaceBoxGeometry(11, 3, 1.4, lidFace),
        lidLatchMaterial,
        "lid",
        getPreviewFacePosition(
          lidFace,
          pointU,
          pointV,
          parameters.lidThickness - 0.7,
          parameters,
          dimensions,
          lidY,
          true,
        ),
        true,
        lidFace,
      );
      rotorTab.name = "spring-latch-side-rotor-tab";

      const catchRail = addMesh(
        root,
        createFaceBoxGeometry(12, 2.2, 1.6, lidFace),
        catchMaterial,
        "base",
        getPreviewFacePosition(
          lidFace,
          pointU,
          pointV,
          -1.1,
          parameters,
          dimensions,
          lidY,
        ),
        true,
        lidFace,
      );
      catchRail.name = "spring-latch-side-catch-rail";
    }
    return;
  }

  const quickReleaseMaterial = standardMaterial(shellColor, selectedPart === "lid");
  const markerDepth = Math.min(2.2, parameters.lidThickness + 0.4);
  for (const [index, pointV] of [-faceHeight / 2 + 3, faceHeight / 2 - 3].entries()) {
    const marker = addMesh(
      root,
      createFaceBoxGeometry(Math.min(18, faceWidth * 0.36), 2.4, markerDepth, lidFace),
      quickReleaseMaterial,
      "lid",
      getPreviewFacePosition(
        lidFace,
        0,
        pointV,
        parameters.lidThickness - markerDepth / 2,
        parameters,
        dimensions,
        lidY,
        true,
      ),
      true,
      lidFace,
    );
    marker.name =
      parameters.closureType === "hinge"
        ? "quick-hinge-marker"
        : parameters.closureType === "pin"
          ? "quick-pin-marker"
          : parameters.closureType === "slide"
            ? "quick-slide-marker"
            : `quick-${parameters.closureType}-marker-${index + 1}`;
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
  pcbPreviews: Record<string, StepPreview> = {},
  customComponentPreviews: Record<string, StepPreview> = {},
  lidTransparent = false,
  hiddenFaces: readonly EnclosureFace[] = [],
  hiddenFeatureIds: readonly string[] = [],
  transparentObjectIds: readonly string[] = [],
  hiddenPcbBodyIds: readonly string[] = [],
): THREE.Group {
  const root = new THREE.Group();
  root.name = "enclosure-preview";
  root.position.y = exploded ? 10 : 0;
  const dimensions = deriveEnclosureDimensions(parameters);
  const shellProfile = getMaterial(parameters.shellMaterialId);
  const transparentIds = lidTransparent
    ? Array.from(new Set([...transparentObjectIds, "lid"]))
    : transparentObjectIds;
  const shellMaterial = standardMaterial(shellProfile.color, selectedPart === "base");
  const lidMaterial = standardMaterial(shellProfile.color, selectedPart === "lid");
  const pcbMaterial = standardMaterial(0x2f7751, selectedPart === "pcb", {
    roughness: 0.46,
  });
  const removableFaces = getRemovableFaces(parameters);
  const removableFaceSet = new Set<EnclosureFace>(removableFaces);
  const isFaceRemovable = (face: EnclosureFace) => removableFaceSet.has(face);
  const interiorBottomY = getPreviewInteriorBottomY(parameters);
  const wallHeight = parameters.baseHeight - interiorBottomY;
  const explodedGap = exploded ? 24 : 0;
  const lidY = parameters.baseHeight + explodedGap;
  const innerRadius = Math.max(0.5, parameters.cornerRadius - parameters.wallThickness);
  const hiddenShellFaces = Array.from(
    new Set([
      ...hiddenFaces,
      ...removableFaces.filter((face) => isSideFace(face)),
    ]),
  );

  if (!isFaceRemovable("bottom")) {
    const bottomPlate = addMesh(
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
      true,
      "bottom",
    );
    bottomPlate.name = "base-bottom-face";
  }

  const shellWalls = addMesh(
    root,
    createRingGeometry(
      dimensions.outsideLength,
      dimensions.outsideWidth,
      dimensions.insideLength,
      dimensions.insideWidth,
      wallHeight,
      parameters.cornerRadius,
      innerRadius,
      hiddenShellFaces,
    ),
    shellMaterial,
    "base",
    [0, interiorBottomY + wallHeight / 2, 0],
  );
  shellWalls.name = "base-side-faces";

  if (!isFaceRemovable("top")) {
    const fixedTop = addMesh(
      root,
      createPlateGeometry(
        dimensions.outsideLength,
        dimensions.outsideWidth,
        parameters.lidThickness,
        parameters.cornerRadius,
      ),
      shellMaterial,
      "base",
      [0, parameters.baseHeight + parameters.lidThickness / 2, 0],
      true,
      "top",
    );
    fixedTop.name = "base-top-face";
  }

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
        "bottom",
      );
    }
  }

  const lipHeight = 2.2;
  const lipOuterLength = dimensions.insideLength - 0.45;
  const lipOuterWidth = dimensions.insideWidth - 0.45;
  const lidPanels = isFaceRemovable("top")
    ? parameters.panelPlacements.filter((panel) => panel.face === "top")
    : [];
  if (isFaceRemovable("top")) {
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

    if (lidPanels.length > 0) {
      addMesh(
        root,
        createRemovableFaceGeometry(parameters, dimensions, "top", lidPanels),
        lidMaterial,
        "lid",
        [0, lidY + parameters.lidThickness / 2, 0],
        true,
        "top",
      );

      for (const panel of lidPanels) {
        if (panel.insetDepth <= 0) continue;
        const supportThickness = parameters.lidThickness - panel.insetDepth;
        const [openingWidth, openingHeight] = getPanelOpeningSize(panel);
        addMesh(
          root,
          createRingGeometry(
            panel.width + 0.3,
            panel.height + 0.3,
            openingWidth,
            openingHeight,
            supportThickness,
            panel.cornerRadius + 0.15,
            getPanelInnerCornerRadius(panel),
          ),
          lidMaterial,
          "lid",
          [panel.offsetU, lidY + supportThickness / 2, panel.offsetV],
        );
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
        true,
        "top",
      );
    }
  }

  for (const removableFace of removableFaces.filter((face) => face !== "top")) {
    const lidPosition = getPreviewFacePosition(
      removableFace,
      0,
      0,
      parameters.lidThickness / 2,
      parameters,
      dimensions,
      lidY,
      true,
    );
    const removableFaceMesh = addMesh(
      root,
      createFacePlateGeometry(
        getPreviewFaceSize(removableFace, parameters, dimensions)[0],
        getPreviewFaceSize(removableFace, parameters, dimensions)[1],
        parameters.lidThickness,
        Math.min(parameters.cornerRadius, getPreviewFaceSize(removableFace, parameters, dimensions)[1] / 2 - 0.1),
        removableFace,
      ),
      lidMaterial,
      "lid",
      lidPosition,
      true,
      removableFace,
    );
    removableFaceMesh.name = `lid-${removableFace}-face`;
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
        depthWrite: panelProfile.id === "aluminum-sheet",
        roughness: 0.2,
        metalness: panelProfile.id === "aluminum-sheet" ? 0.72 : 0.02,
      },
    );
    const explodedOffset = exploded ? 8 : 0;
    const assemblyGap = !exploded && panel.insetDepth <= 0 ? 0.06 : 0;
    const panelPosition = getPreviewFacePosition(
      face,
      panel.offsetU,
      panel.offsetV,
      panel.thickness / 2 + explodedOffset - panel.insetDepth + assemblyGap,
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
        panel.cornerRadius,
        face,
      ),
      panelMaterial,
      "panel",
      [0, 0, 0],
    );
    panelMesh.name = panel.id;
    panelMesh.userData.featureId = panel.id;

    if (face !== "top") {
      const [openingWidth, openingHeight] = getPanelOpeningSize(panel);
      const openingPosition = getPreviewFacePosition(
        face,
        panel.offsetU,
        panel.offsetV,
        0.04,
        parameters,
        dimensions,
        lidY,
      );
      const opening = addMesh(
        panelGroup,
        createFacePlaneGeometry(
          openingWidth,
          openingHeight,
          face,
        ),
        standardMaterial(0x202725, selectedPart === "panel", { roughness: 0.82 }),
        "base",
        relativePosition(openingPosition, panelPosition),
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
        const railPosition = getPreviewFacePosition(
          face,
          panel.offsetU,
          panel.offsetV + pointV,
          0.6 - panel.insetDepth,
          parameters,
          dimensions,
          lidY,
        );
        const rail = addMesh(
          panelGroup,
          createFaceBoxGeometry(
            panel.width + 2,
            1.5,
            1.2,
            face,
          ),
          face === "top" ? lidMaterial : shellMaterial,
          targetPart,
          relativePosition(railPosition, panelPosition),
        );
        rail.name = `${panel.id}-rail-${pointV < 0 ? "start" : "end"}`;
      }
    } else {
      const screwHeadRecessDepth = getPanelScrewHeadRecessDepth(panel);
      for (const [index, [pointU, pointV]] of getPanelMountingPoints(panel).entries()) {
        if (panel.mountingType === "screw") {
          const fixingPosition = getPreviewFacePosition(
            face,
            panel.offsetU + pointU,
            panel.offsetV + pointV,
            screwHeadRecessDepth > 0
              ? panel.thickness +
                  explodedOffset +
                  assemblyGap -
                  panel.insetDepth -
                  screwHeadRecessDepth / 2 +
                  0.01
              : panel.thickness + explodedOffset + 0.2 - panel.insetDepth,
            parameters,
            dimensions,
            lidY,
          );
          const fixing = addMesh(
            panelGroup,
            createFaceCylinderGeometry(
              PANEL_SCREW_HEAD_RADIUS,
              screwHeadRecessDepth > 0
                ? screwHeadRecessDepth
                : Math.min(1.4, panel.thickness),
              face,
            ),
            standardMaterial(0x59615d, panelSelected, {
              metalness: 0.7,
              roughness: 0.26,
            }),
            "panel",
            relativePosition(fixingPosition, panelPosition),
          );
          fixing.name = `${panel.id}-fixing-${index + 1}`;
          const tabDepth =
            face === "top"
              ? parameters.lidThickness
              : face === "bottom"
                ? parameters.bottomThickness
                : parameters.wallThickness;
          const bridge = getPanelScrewMountingTab(
            panel,
            pointU,
            pointV,
            PANEL_SCREW_TAB_RADIUS,
          );
          const bridgePosition = getPreviewFacePosition(
            face,
            panel.offsetU + bridge.centerU,
            panel.offsetV + bridge.centerV,
            -tabDepth / 2 + 0.02,
            parameters,
            dimensions,
            lidY,
          );
          const bridgeMesh = addMesh(
            panelGroup,
            createFaceBoxGeometry(
              bridge.width,
              bridge.height,
              tabDepth,
              face,
            ),
            face === "top" ? lidMaterial : shellMaterial,
            targetPart,
            relativePosition(bridgePosition, panelPosition),
          );
          bridgeMesh.name = `${panel.id}-mounting-tab-${index + 1}`;
        } else if (panel.mountingType === "magnet") {
          const pocketDepth = getPanelMagnetPocketDepth(panel.thickness);
          const magnetMaterial = standardMaterial(0xc9933d, panelSelected, {
            metalness: 0.72,
            roughness: 0.24,
          });
          const panelMagnetPosition = getPreviewFacePosition(
            face,
            panel.offsetU + pointU,
            panel.offsetV + pointV,
            assemblyGap - panel.insetDepth + pocketDepth / 2,
            parameters,
            dimensions,
            lidY,
          );
          const panelMagnet = addMesh(
            panelGroup,
            createFaceCylinderGeometry(PANEL_MAGNET_RADIUS, pocketDepth, face),
            magnetMaterial,
            "panel",
            relativePosition(panelMagnetPosition, panelPosition),
          );
          panelMagnet.name = `${panel.id}-panel-magnet-${index + 1}`;
          const shellPocketDepth = getPanelMagnetPocketDepth(
            face === "top"
              ? parameters.lidThickness
              : face === "bottom"
                ? parameters.bottomThickness
                : parameters.wallThickness,
          );
          const shellMagnetPosition = getPreviewFacePosition(
            face,
            panel.offsetU + pointU,
            panel.offsetV + pointV,
            -shellPocketDepth / 2,
            parameters,
            dimensions,
            lidY,
          );
          const shellMagnet = addMesh(
            panelGroup,
            createFaceCylinderGeometry(
              PANEL_MAGNET_RADIUS,
              shellPocketDepth,
              face,
            ),
            magnetMaterial,
            targetPart,
            relativePosition(shellMagnetPosition, panelPosition),
          );
          shellMagnet.name = `${panel.id}-shell-magnet-${index + 1}`;
        } else {
          const postPosition = getPreviewFacePosition(
            face,
            panel.offsetU + pointU,
            panel.offsetV + pointV,
            assemblyGap - panel.insetDepth - PANEL_SNAP_POST_DEPTH / 2,
            parameters,
            dimensions,
            lidY,
          );
          const post = addMesh(
            panelGroup,
            createFaceCylinderGeometry(
              PANEL_SNAP_POST_RADIUS,
              PANEL_SNAP_POST_DEPTH,
              face,
            ),
            panelMaterial,
            "panel",
            relativePosition(postPosition, panelPosition),
          );
          post.name = `${panel.id}-snap-post-${index + 1}`;
          const lipPosition = getPreviewFacePosition(
            face,
            panel.offsetU + pointU,
            panel.offsetV + pointV,
            assemblyGap -
              panel.insetDepth -
              PANEL_SNAP_POST_DEPTH -
              PANEL_SNAP_LIP_DEPTH / 2 +
              0.2,
            parameters,
            dimensions,
            lidY,
          );
          const lip = addMesh(
            panelGroup,
            createFaceTaperedCylinderGeometry(
              PANEL_SNAP_POST_RADIUS,
              PANEL_SNAP_LIP_RADIUS,
              PANEL_SNAP_LIP_DEPTH,
              face,
            ),
            panelMaterial,
            "panel",
            relativePosition(lipPosition, panelPosition),
          );
          lip.name = `${panel.id}-snap-lip-${index + 1}`;
          const socketPosition = getPreviewFacePosition(
            face,
            panel.offsetU + pointU,
            panel.offsetV + pointV,
            -0.01,
            parameters,
            dimensions,
            lidY,
          );
          const socket = addMesh(
            panelGroup,
            createFaceDiskGeometry(PANEL_SNAP_SOCKET_RADIUS, face),
            standardMaterial(0x202725, panelSelected, { roughness: 0.82 }),
            targetPart,
            relativePosition(socketPosition, panelPosition),
            false,
          );
          socket.name = `${panel.id}-snap-socket-${index + 1}`;
        }
      }
    }
  }

  const standoffMaterial = standardMaterial(shellProfile.color, selectedPart === "base");
  const holeMaterial = standardMaterial(0x1d2522, selectedPart === "pcb");
  const boardBottom = interiorBottomY + parameters.standoffHeight;
  for (const envelope of getPcbMountingEnvelopes(parameters, pcbReference)) {
    addPcbRailMountingPreview(
      root,
      envelope,
      parameters,
      selectedPart === "pcb" &&
        (selectedFeatureId === null || selectedFeatureId === envelope.id),
    );
  }
  if (parameters.pcbReferences.length > 0) {
    for (const placement of parameters.pcbReferences) {
      const reference = placement.reference;
      const preview =
        pcbPreviews[placement.id] ??
        (placement.id === parameters.pcbReferences[0]?.id ? stepPreview : null);
      const selected =
        selectedPart === "pcb" &&
        (selectedFeatureId === null || selectedFeatureId === placement.id);
      const boardGroup = new THREE.Group();
      boardGroup.name = `pcb-transform-${placement.id}`;
      boardGroup.position.set(
        placement.offsetX,
        boardBottom + placement.elevation,
        placement.offsetZ,
      );
      boardGroup.rotation.y = THREE.MathUtils.degToRad(placement.rotation);
      boardGroup.userData = {
        partId: "pcb",
        featureId: placement.id,
        featureKind: "pcb",
      };
      root.add(boardGroup);

      if (preview) {
        for (const previewMesh of preview.meshes) {
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(previewMesh.positions, 3),
          );
          if (previewMesh.normals) {
            geometry.setAttribute(
              "normal",
              new THREE.BufferAttribute(previewMesh.normals, 3),
            );
          } else geometry.computeVertexNormals();
          geometry.setIndex(new THREE.BufferAttribute(previewMesh.indices, 1));
          addMesh(
            boardGroup,
            geometry,
            standardMaterial(new THREE.Color(...previewMesh.color), selected, {
              roughness: 0.48,
            }),
            "pcb",
            [0, 0, 0],
            false,
            undefined,
            false,
          );
        }
      } else {
        const length = reference.bounds.maxX - reference.bounds.minX;
        const width = reference.bounds.maxY - reference.bounds.minY;
        addMesh(
          boardGroup,
          new THREE.BoxGeometry(length, reference.thickness, width),
          standardMaterial(0x2f7751, selected, { roughness: 0.46 }),
          "pcb",
          [0, reference.thickness / 2, 0],
        );
      }

      if (parameters.pcbMountingType !== "rail-elastic") {
        const mountingGroup = new THREE.Group();
        mountingGroup.name = `pcb-mount-transform-${placement.id}-screw`;
        mountingGroup.userData = {
          partId: "base",
          featureId: placement.id,
          featureKind: "pcb-mount",
        };
        root.add(mountingGroup);
        getCenteredMountingHoles(parameters, reference).forEach((mountingPoint, index) => {
          const local = new THREE.Vector3(mountingPoint.x, 0, mountingPoint.y)
            .applyAxisAngle(new THREE.Vector3(0, 1, 0), boardGroup.rotation.y);
          const standoffHeight = parameters.standoffHeight + placement.elevation;
          if (standoffHeight <= 0.2) return;
          const standoff = addCylinder(
            mountingGroup,
            Math.max(3.2, mountingPoint.diameter / 2 + 1.4),
            standoffHeight,
            [
              placement.offsetX + local.x,
              interiorBottomY + standoffHeight / 2,
              placement.offsetZ + local.z,
            ],
            standoffMaterial,
            "base",
          );
          standoff.name = `${placement.id}-pcb-standoff-${index + 1}`;
          addCylinder(
            boardGroup,
            mountingPoint.diameter / 2,
            reference.thickness + 0.2,
            [mountingPoint.x, reference.thickness / 2 + 0.1, mountingPoint.y],
            holeMaterial,
            "pcb",
            20,
          );
        });
      }
    }
  } else if (parameters.parametricPcbEnabled) {
    const boardGroup = new THREE.Group();
    boardGroup.name = `pcb-transform-${PARAMETRIC_PCB_FEATURE_ID}`;
    boardGroup.position.set(
      parameters.pcbOffsetX,
      boardBottom + parameters.pcbElevation,
      parameters.pcbOffsetZ,
    );
    boardGroup.userData = {
      partId: "pcb",
      featureId: PARAMETRIC_PCB_FEATURE_ID,
      featureKind: "pcb",
    };
    root.add(boardGroup);
    const boardY = parameters.pcbThickness / 2;
    if (stepPreview) {
      for (const previewMesh of stepPreview.meshes) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(previewMesh.positions, 3),
        );
        if (previewMesh.normals) {
          geometry.setAttribute(
            "normal",
            new THREE.BufferAttribute(previewMesh.normals, 3),
          );
        } else geometry.computeVertexNormals();
        geometry.setIndex(new THREE.BufferAttribute(previewMesh.indices, 1));
        addMesh(
          boardGroup,
          geometry,
          standardMaterial(new THREE.Color(...previewMesh.color), selectedPart === "pcb", {
            roughness: 0.48,
          }),
          "pcb",
          [0, 0, 0],
          false,
          undefined,
          false,
        );
      }
    } else {
      addMesh(
        boardGroup,
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
    if (parameters.pcbMountingType !== "rail-elastic") {
      const mountingGroup = new THREE.Group();
      mountingGroup.name = `pcb-mount-transform-${PARAMETRIC_PCB_FEATURE_ID}-screw`;
      mountingGroup.userData = {
        partId: "base",
        featureId: PARAMETRIC_PCB_FEATURE_ID,
        featureKind: "pcb-mount",
      };
      root.add(mountingGroup);
      getCenteredMountingHoles(parameters, pcbReference).forEach(
        (mountingPoint, index) => {
        const { x, y: z, diameter } = mountingPoint;
        const supportHeight = parameters.standoffHeight + parameters.pcbElevation;
        if (supportHeight <= 0.2) return;
        const standoff = addCylinder(
          mountingGroup,
          Math.max(3.2, diameter / 2 + 1.4),
          supportHeight,
          [
            parameters.pcbOffsetX + x,
            interiorBottomY + supportHeight / 2,
            parameters.pcbOffsetZ + z,
          ],
          standoffMaterial,
          "base",
        );
        standoff.name = `${PARAMETRIC_PCB_FEATURE_ID}-pcb-standoff-${index + 1}`;
        addCylinder(
          boardGroup,
          diameter / 2,
          parameters.pcbThickness + 0.2,
          [x, boardY + 0.1, z],
          holeMaterial,
          "pcb",
          20,
        );
        },
      );
    }
  }

  for (const component of parameters.customComponents) {
    addCustomComponentPreview(
      root,
      component,
      customComponentPreviews[component.id] ?? null,
      selectedPart === "custom" &&
        (selectedFeatureId === null || selectedFeatureId === component.id),
    );
  }

  for (const compartment of parameters.batteryCompartments) {
    addBatteryCompartmentPreview(
      root,
      compartment,
      parameters,
      lidY,
      selectedPart === "battery" &&
        (selectedFeatureId === null || selectedFeatureId === compartment.id),
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
    const throughPanelCutout = hasThroughPanelCutout(connector);
    const connectorPosition = getPreviewFacePosition(
      face,
      surfaceU,
      surfaceV,
      throughPanelCutout
        ? surfaceOutset - connector.visualGeometry.depth / 2 + 0.5
        : surfaceOutset + connector.visualGeometry.depth / 2 + 0.08,
      parameters,
      dimensions,
      lidY,
      placement.surface !== "panel" && isFaceRemovable(face),
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
    if (connector.category === "display") {
      const displayMountingType =
        placement.displayMountingType === "screw" &&
        placement.surface === "panel" &&
        targetPanel &&
        supportsDisplayScrewMounting(connector)
          ? "screw"
          : "none";
      addLcdwikiDisplayPreview(
        connectorGroup,
        connector,
        placement.id,
        placement.rotation,
        face,
        surfaceU,
        surfaceV,
        surfaceOutset,
        connectorPosition,
        parameters,
        dimensions,
        lidY,
        placement.surface !== "panel" && isFaceRemovable(face),
        displayMountingType,
        connectorSelected,
      );
    } else if (isFpcConnectorDefinition(connector)) {
      addFpcConnectorPreview(
        connectorGroup,
        connector,
        placement.id,
        face,
        connectorSelected,
        quarterTurn,
        surfaceOutset,
        surfaceU,
        surfaceV,
        connectorPosition,
        parameters,
        dimensions,
        lidY,
        placement.surface !== "panel" && isFaceRemovable(face),
      );
    } else if (isWaterproofMicrophoneDefinition(connector)) {
      addWaterproofMicrophonePreview(
        connectorGroup,
        connector,
        placement.id,
        placement.rotation,
        face,
        connectorSelected,
        surfaceOutset,
        surfaceU,
        surfaceV,
        connectorPosition,
        parameters,
        dimensions,
        lidY,
        placement.surface !== "panel" && isFaceRemovable(face),
      );
    } else if (isRectangularSpeakerDefinition(connector)) {
      addRectangularSpeakerPreview(
        connectorGroup,
        connector,
        placement.id,
        placement.rotation,
        face,
        connectorSelected,
        surfaceOutset,
        surfaceU,
        surfaceV,
        connectorPosition,
        parameters,
        dimensions,
        lidY,
        placement.surface !== "panel" && isFaceRemovable(face),
      );
    } else {
      const portMaterial = standardMaterial(
        connector.visualGeometry.color,
        connectorSelected,
        {
          metalness:
            connector.category === "keypad"
              ? 0.05
              : connector.category === "indicator"
                ? 0.58
                : 0.78,
          roughness:
            connector.category === "keypad"
              ? 0.72
              : connector.category === "indicator"
                ? 0.28
                : 0.22,
        },
      );
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
      const connectorMesh = addMesh(
        connectorGroup,
        visualGeometry,
        portMaterial,
        "connector",
        [0, 0, 0],
      );
      connectorMesh.name = placement.id;
      connectorMesh.userData.featureId = placement.id;
      if (!throughPanelCutout) {
        const hitbox = addMesh(
          connectorGroup,
          createFaceBoxGeometry(
            quarterTurn
              ? connector.visualGeometry.height + 1.2
              : connector.visualGeometry.width + 1.2,
            quarterTurn
              ? connector.visualGeometry.width + 1.2
              : connector.visualGeometry.height + 1.2,
            Math.max(2, connector.visualGeometry.depth + 1),
            face,
          ),
          new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.001,
            depthWrite: false,
            depthTest: false,
          }),
          "connector",
          [0, 0, 0],
          false,
          undefined,
          false,
        );
        hitbox.name = `${placement.id}-hitbox`;
        hitbox.userData.featureId = placement.id;
      }
    }

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
      placement.surface !== "panel" && isFaceRemovable(face),
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
        placement.surface !== "panel" && isFaceRemovable(face),
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
      placement.surface !== "panel" && isFaceRemovable(face),
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
          placement.surface !== "panel" && isFaceRemovable(face),
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
        placement.surface !== "panel" && isFaceRemovable(face),
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
        placement.surface !== "panel" && isFaceRemovable(face),
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

  for (const removableFace of removableFaces) {
    if (removableFace === "top") {
      addClosureFeatures(
        root,
        parameters,
        selectedPart,
        lidY,
        dimensions.outsideLength,
        dimensions.outsideWidth,
      );
    } else {
      addGenericFaceClosureFeatures(
        root,
        parameters,
        selectedPart,
        removableFace,
        lidY,
        dimensions,
      );
    }
  }

  applyObjectTransparency(root, transparentIds);

  if (hiddenFaces.length > 0) {
    const hidden = new Set(hiddenFaces);
    root.traverse((object) => {
      const enclosureFace = object.userData.enclosureFace as EnclosureFace | undefined;
      if (enclosureFace && hidden.has(enclosureFace)) object.visible = false;
      if (
        !enclosureFace &&
        object.userData.partId === "lid" &&
        removableFaces.every((face) => hidden.has(face))
      ) {
        object.visible = false;
      }
    });
  }

  if (hiddenFeatureIds.length > 0) {
    const hiddenFeatures = new Set(hiddenFeatureIds);
    root.traverse((object) => {
      if (
        typeof object.userData.featureId === "string" &&
        hiddenFeatures.has(object.userData.featureId)
      ) {
        object.visible = false;
      }
    });
  }

  if (hiddenPcbBodyIds.length > 0) {
    const hiddenPcbBodies = new Set(hiddenPcbBodyIds);
    root.traverse((object) => {
      if (
        object.userData.featureKind === "pcb" &&
        typeof object.userData.featureId === "string" &&
        hiddenPcbBodies.has(object.userData.featureId)
      ) {
        object.visible = false;
      }
    });
  }

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
      const detachedMaterials = object.userData.detachedMaterials as
        | THREE.Material[]
        | undefined;
      detachedMaterials?.forEach((material) => material.dispose());
    }
  });
}
