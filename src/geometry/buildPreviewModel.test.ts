import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_PARAMETERS, deriveEnclosureDimensions } from "../domain/enclosure";
import type { MagnetSupportType, SelectablePart, StepPreview } from "../domain/model";
import { PARAMETRIC_PCB_FEATURE_ID } from "../domain/pcbMounting";
import { buildPreviewModel, disposePreviewModel } from "./buildPreviewModel";

function renderedParts(focusedPart: SelectablePart | null): Set<SelectablePart> {
  const model = buildPreviewModel(
    DEFAULT_PARAMETERS,
    focusedPart ?? "project",
    false,
    null,
    null,
    focusedPart,
  );
  const parts = new Set(
    model.children
      .map((child) => child.userData.partId as SelectablePart | undefined)
      .filter((part): part is SelectablePart => Boolean(part)),
  );
  disposePreviewModel(model);
  return parts;
}

function getObjectMaterial(object: THREE.Object3D | undefined): THREE.Material {
  expect(object).toBeDefined();
  if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) {
    throw new Error("Expected a mesh or line object");
  }
  const renderable = object as THREE.Mesh | THREE.LineSegments;
  return Array.isArray(renderable.material)
    ? renderable.material[0]
    : renderable.material;
}

function expectTransparentMaterial(object: THREE.Object3D | undefined): void {
  const material = getObjectMaterial(object);
  expect(material.transparent).toBe(true);
  expect(material.opacity).toBe(0.24);
  expect(material.depthWrite).toBe(false);
}

describe("preview focus mode", () => {
  it("keeps only the focused lid", () => {
    expect([...renderedParts("lid")]).toEqual(["lid"]);
  });

  it("keeps only the focused base", () => {
    expect([...renderedParts("base")]).toEqual(["base"]);
  });

  it("renders the full assembly after showing all", () => {
    expect(renderedParts(null)).toEqual(
      new Set(["base", "lid", "panel", "pcb", "connector"]),
    );
  });
});

describe("magnet support preview", () => {
  const cases: Array<readonly [MagnetSupportType, string, number]> = [
    ["corner-shelf", "magnet-support-corner-shelf", 4],
    ["wall-bracket", "magnet-support-wall-bracket", 4],
    ["perimeter-flange", "magnet-support-perimeter-flange", 1],
    ["floor-column", "magnet-support-floor-column", 4],
  ];

  it.each(cases)("renders %s support geometry", (supportType, name, count) => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        closureType: "magnet",
        magnetSupportType: supportType,
      },
      "base",
      false,
      null,
    );

    expect(model.children.filter((child) => child.name === name)).toHaveLength(count);
    expect(model.children.filter((child) => child.name === "base-magnet")).toHaveLength(4);
    expect(model.children.filter((child) => child.name === "lid-magnet")).toHaveLength(4);
    disposePreviewModel(model);
  });
});

describe("surface placement preview", () => {
  it("renders paired panel magnets and integrated snap posts", () => {
    const magneticPanel = {
      ...DEFAULT_PARAMETERS.panelPlacements[0],
      mountingType: "magnet" as const,
    };
    const magneticModel = buildPreviewModel(
      { ...DEFAULT_PARAMETERS, panelPlacements: [magneticPanel] },
      "panel",
      false,
      null,
    );
    expect(magneticModel.getObjectByName("panel-1-panel-magnet-1")).toBeDefined();
    expect(magneticModel.getObjectByName("panel-1-shell-magnet-1")).toBeDefined();
    disposePreviewModel(magneticModel);

    const snapPanel = { ...magneticPanel, mountingType: "snap" as const };
    const snapModel = buildPreviewModel(
      { ...DEFAULT_PARAMETERS, panelPlacements: [snapPanel] },
      "panel",
      false,
      null,
    );
    expect(snapModel.getObjectByName("panel-1-snap-post-1")).toBeDefined();
    expect(snapModel.getObjectByName("panel-1-snap-lip-1")).toBeDefined();
    expect(snapModel.getObjectByName("panel-1-snap-socket-1")).toBeDefined();
    disposePreviewModel(snapModel);
  });

  it("renders press latches and dual quick-release pin knuckles", () => {
    const latchModel = buildPreviewModel(
      { ...DEFAULT_PARAMETERS, closureType: "latch" },
      "lid",
      false,
      null,
    );
    expect(
      latchModel.children.filter((child) => child.name === "quick-latch-tab"),
    ).toHaveLength(2);
    expect(
      latchModel.children.filter((child) => child.name === "quick-latch-receiver"),
    ).toHaveLength(2);
    disposePreviewModel(latchModel);

    const pinModel = buildPreviewModel(
      { ...DEFAULT_PARAMETERS, closureType: "pin" },
      "lid",
      false,
      null,
    );
    expect(
      pinModel.children.filter((child) => child.name === "quick-pin-base-knuckle"),
    ).toHaveLength(4);
    expect(
      pinModel.children.filter((child) => child.name === "quick-pin-lid-knuckle"),
    ).toHaveLength(2);
    expect(
      pinModel.children.filter((child) => child.name === "quick-pin-rod"),
    ).toHaveLength(2);
    disposePreviewModel(pinModel);
  });

  it("renders spring-loaded rotary latch stations", () => {
    const springLatchModel = buildPreviewModel(
      { ...DEFAULT_PARAMETERS, closureType: "spring-latch" },
      "lid",
      false,
      null,
    );
    expect(
      springLatchModel.children.filter(
        (child) => child.name === "spring-latch-spring-seat",
      ),
    ).toHaveLength(4);
    expect(
      springLatchModel.children.filter(
        (child) => child.name === "spring-latch-guide-post",
      ),
    ).toHaveLength(4);
    expect(
      springLatchModel.children.filter(
        (child) => child.name === "spring-latch-compression-spring",
      ),
    ).toHaveLength(4);
    expect(
      springLatchModel.children.filter(
        (child) => child.name === "spring-latch-rotor-tab",
      ),
    ).toHaveLength(4);
    expect(
      springLatchModel.children.filter(
        (child) => child.name === "spring-latch-catch-rail",
      ),
    ).toHaveLength(4);
    expect(
      springLatchModel.children.filter(
        (child) => child.name === "spring-latch-rotation-stop",
      ),
    ).toHaveLength(4);
    disposePreviewModel(springLatchModel);
  });

  it("places enabled lid and panel screw heads flush with their surfaces", () => {
    const panel = {
      ...DEFAULT_PARAMETERS.panelPlacements[0],
      screwHeadRecessEnabled: true,
      screwHeadRecessDepth: 1.2,
    };
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        closureScrewHeadRecessEnabled: true,
        closureScrewHeadRecessDepth: 1.2,
        panelPlacements: [panel],
      },
      "panel",
      false,
      null,
    );

    const lidHead = model.getObjectByName("closure-screw-head");
    const panelHead = model.getObjectByName("panel-1-fixing-1");
    expect(lidHead?.position.y).toBeCloseTo(
      DEFAULT_PARAMETERS.baseHeight + DEFAULT_PARAMETERS.lidThickness - 0.6 + 0.01,
    );
    expect(panelHead?.position.y).toBeCloseTo(0.41);
    disposePreviewModel(model);
  });

  it("treats a side face as the removable lid face", () => {
    const panel = {
      ...DEFAULT_PARAMETERS.panelPlacements[0],
      face: "front" as const,
    };
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        lidFace: "front",
        removableFaces: ["front"],
        panelPlacements: [panel],
      },
      "lid",
      false,
      null,
    );

    const lidFace = model.getObjectByName("lid-front-face");
    expect(lidFace?.userData.partId).toBe("lid");
    expect(lidFace?.userData.enclosureFace).toBe("front");
    expect(model.getObjectByName("base-top-face")?.userData.partId).toBe("base");
    expect(model.getObjectByName("panel-opening-panel-1")).toBeDefined();
    expect(
      model.children.filter((child) => child.name === "closure-screw-head"),
    ).toHaveLength(4);
    expect(
      model.getObjectByName("panel-1-mounting-tab-1")?.userData.partId,
    ).toBe("base");
    disposePreviewModel(model);
  });

  it("marks spring latch stations on side removable faces", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        closureType: "spring-latch",
        lidFace: "front",
        removableFaces: ["front"],
      },
      "lid",
      false,
      null,
    );

    expect(
      model.children.filter(
        (child) => child.name === "spring-latch-side-spring-seat",
      ),
    ).toHaveLength(4);
    expect(
      model.children.filter(
        (child) => child.name === "spring-latch-side-rotor-tab",
      ),
    ).toHaveLength(4);
    expect(model.getObjectByName("spring-latch-spring-seat")).toBeUndefined();
    disposePreviewModel(model);
  });

  it("keeps panel-bound devices stable when their face becomes removable", () => {
    const panel = {
      ...DEFAULT_PARAMETERS.panelPlacements[0],
      face: "front" as const,
    };
    const connector = {
      ...DEFAULT_PARAMETERS.connectorPlacements[0],
      surface: "panel" as const,
      panelId: panel.id,
      offsetU: 4,
      offsetV: -2,
    };
    const build = (lidFace: "front" | "back") =>
      buildPreviewModel(
        {
          ...DEFAULT_PARAMETERS,
          lidFace,
          removableFaces: [lidFace],
          panelPlacements: [panel],
          connectorPlacements: [connector],
        },
        "connector",
        true,
        null,
      );

    const fixedFaceModel = build("back");
    const removableFaceModel = build("front");
    expect(
      removableFaceModel.getObjectByName("panel-transform-panel-1")?.position.z,
    ).toBeCloseTo(
      fixedFaceModel.getObjectByName("panel-transform-panel-1")?.position.z ?? 0,
    );
    expect(
      removableFaceModel.getObjectByName("connector-transform-connector-1")?.position.z,
    ).toBeCloseTo(
      fixedFaceModel.getObjectByName("connector-transform-connector-1")?.position.z ??
        0,
    );
    expect(
      removableFaceModel.getObjectByName("panel-1-mounting-tab-1")?.userData.partId,
    ).toBe("base");

    disposePreviewModel(fixedFaceModel);
    disposePreviewModel(removableFaceModel);
  });

  it("renders every selected removable face as a detachable lid part", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        lidFace: "front",
        removableFaces: ["front", "right", "bottom"],
      },
      "lid",
      false,
      null,
    );

    expect(model.getObjectByName("lid-front-face")?.userData.partId).toBe("lid");
    expect(model.getObjectByName("lid-right-face")?.userData.partId).toBe("lid");
    expect(model.getObjectByName("lid-bottom-face")?.userData.partId).toBe("lid");
    expect(model.getObjectByName("base-bottom-face")).toBeUndefined();
    expect(model.getObjectByName("base-top-face")?.userData.partId).toBe("base");

    disposePreviewModel(model);
  });

  it("keeps the base walls seated when the bottom is the primary removable face", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        lidFace: "bottom",
        removableFaces: ["bottom"],
      },
      "lid",
      false,
      null,
    );

    const sideWalls = model.getObjectByName("base-side-faces");
    const bottomLid = model.getObjectByName("lid-bottom-face");
    expect(model.getObjectByName("base-bottom-face")).toBeUndefined();
    expect(sideWalls).toBeDefined();
    expect(bottomLid).toBeDefined();

    model.updateMatrixWorld(true);
    const wallBounds = new THREE.Box3().setFromObject(sideWalls!);
    const lidBounds = new THREE.Box3().setFromObject(bottomLid!);
    expect(wallBounds.min.y).toBeCloseTo(0, 4);
    expect(wallBounds.max.y).toBeCloseTo(DEFAULT_PARAMETERS.baseHeight, 4);
    expect(lidBounds.min.y).toBeCloseTo(-DEFAULT_PARAMETERS.lidThickness, 4);
    expect(lidBounds.max.y).toBeCloseTo(0, 4);

    disposePreviewModel(model);
  });

  it("uses the removable bottom plane as the PCB support datum", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        lidFace: "bottom",
        removableFaces: ["bottom"],
      },
      "pcb",
      false,
      null,
    );

    const pcb = model.getObjectByName(`pcb-transform-${PARAMETRIC_PCB_FEATURE_ID}`);
    const standoff = model.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-standoff-1`,
    );
    expect(pcb?.position.y).toBeCloseTo(DEFAULT_PARAMETERS.standoffHeight, 4);
    expect(standoff).toBeDefined();

    model.updateMatrixWorld(true);
    const standoffBounds = new THREE.Box3().setFromObject(standoff!);
    expect(standoffBounds.min.y).toBeCloseTo(0, 4);
    expect(standoffBounds.max.y).toBeCloseTo(DEFAULT_PARAMETERS.standoffHeight, 4);

    disposePreviewModel(model);
  });

  it("keeps an exploded bottom panel above the work plane", () => {
    const panel = {
      ...DEFAULT_PARAMETERS.panelPlacements[0],
      face: "bottom" as const,
    };
    const model = buildPreviewModel(
      { ...DEFAULT_PARAMETERS, panelPlacements: [panel] },
      "panel",
      true,
      null,
      null,
      null,
      panel.id,
    );
    const panelMesh = model.getObjectByName(panel.id);
    expect(panelMesh).toBeDefined();
    model.updateMatrixWorld(true);
    expect(new THREE.Box3().setFromObject(panelMesh!).min.y).toBeGreaterThanOrEqual(0);
    disposePreviewModel(model);
  });

  it("hides enclosure faces without changing manufacturing parameters", () => {
    const fullModel = buildPreviewModel(
      DEFAULT_PARAMETERS,
      "project",
      false,
      null,
    );
    const frontHiddenModel = buildPreviewModel(
      DEFAULT_PARAMETERS,
      "project",
      false,
      null,
      null,
      null,
      null,
      {},
      {},
      false,
      ["front"],
    );
    const fullWalls = fullModel.getObjectByName("base-side-faces") as THREE.Mesh;
    const frontHiddenWalls = frontHiddenModel.getObjectByName(
      "base-side-faces",
    ) as THREE.Mesh;
    expect(frontHiddenWalls.geometry.getAttribute("position").count).toBeLessThan(
      fullWalls.geometry.getAttribute("position").count,
    );

    const topAndBottomHiddenModel = buildPreviewModel(
      DEFAULT_PARAMETERS,
      "project",
      false,
      null,
      null,
      null,
      null,
      {},
      {},
      false,
      ["top", "bottom"],
    );
    expect(topAndBottomHiddenModel.getObjectByName("base-bottom-face")?.visible).toBe(
      false,
    );
    const visibleLidObjects: THREE.Object3D[] = [];
    topAndBottomHiddenModel.traverse((object) => {
      if (object.userData.partId === "lid" && object.visible) {
        visibleLidObjects.push(object);
      }
    });
    expect(visibleLidObjects).toHaveLength(0);

    disposePreviewModel(fullModel);
    disposePreviewModel(frontHiddenModel);
    disposePreviewModel(topAndBottomHiddenModel);
  });

  it("hides individual preview features without removing their geometry", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    const model = buildPreviewModel(
      DEFAULT_PARAMETERS,
      "connector",
      false,
      null,
      null,
      null,
      connector.id,
      {},
      {},
      false,
      [],
      [connector.id],
    );
    const connectorGroup = model.getObjectByName(
      `connector-transform-${connector.id}`,
    );
    expect(connectorGroup).toBeDefined();
    expect(connectorGroup?.visible).toBe(false);
    expect(connectorGroup?.children.length).toBeGreaterThan(0);
    disposePreviewModel(model);

    const battery = {
      id: "battery-hidden",
      preset: "aa" as const,
      face: "bottom" as const,
      retentionType: "clip" as const,
      insertionSide: "right" as const,
      cellCount: 2,
      width: 54.9,
      depth: 20,
      height: 10.59,
      wallThickness: 1.6,
      clearance: 0.6,
      offsetX: 0,
      offsetZ: 0,
      rotation: 0 as const,
    };
    const batteryModel = buildPreviewModel(
      { ...DEFAULT_PARAMETERS, batteryCompartments: [battery] },
      "battery",
      false,
      null,
      null,
      null,
      battery.id,
      {},
      {},
      false,
      [],
      [battery.id],
    );
    const batteryGroup = batteryModel.getObjectByName(
      `battery-transform-${battery.id}`,
    );
    expect(batteryGroup).toBeDefined();
    expect(batteryGroup?.visible).toBe(false);
    expect(batteryGroup?.children.length).toBeGreaterThan(0);
    disposePreviewModel(batteryModel);
  });

  it("applies transparent inspection mode to any object id", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    const panel = DEFAULT_PARAMETERS.panelPlacements[0];
    const model = buildPreviewModel(
      DEFAULT_PARAMETERS,
      "project",
      false,
      null,
      null,
      null,
      null,
      {},
      {},
      false,
      [],
      [],
      ["base", panel.id, connector.id],
    );

    expectTransparentMaterial(model.getObjectByName("base-bottom-face"));
    expect((model.getObjectByName("base-bottom-face") as THREE.Mesh).castShadow).toBe(
      false,
    );
    expect(
      (model.getObjectByName("base-bottom-face") as THREE.Mesh).receiveShadow,
    ).toBe(false);
    expectTransparentMaterial(model.getObjectByName(panel.id));
    expectTransparentMaterial(model.getObjectByName(connector.id));

    const lidMesh = model.children.find(
      (child) => child instanceof THREE.Mesh && child.userData.partId === "lid",
    );
    expect(getObjectMaterial(lidMesh).opacity).toBe(1);
    disposePreviewModel(model);
  });

  it("renders the parametric PCB as a movable and hideable feature", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        pcbOffsetX: 8,
        pcbElevation: 3,
        pcbOffsetZ: -6,
      },
      "pcb",
      false,
      null,
      null,
      null,
      "pcb-main",
      {},
      {},
      false,
      [],
      ["pcb-main"],
    );

    const pcbGroup = model.getObjectByName("pcb-transform-pcb-main");
    expect(pcbGroup?.position.x).toBe(8);
    expect(pcbGroup?.position.y).toBe(
      DEFAULT_PARAMETERS.bottomThickness + DEFAULT_PARAMETERS.standoffHeight + 3,
    );
    expect(pcbGroup?.position.z).toBe(-6);
    expect(pcbGroup?.visible).toBe(false);
    expect(
      pcbGroup?.children.some((child) => child instanceof THREE.Mesh),
    ).toBe(true);
    expect(
      model.children.some(
        (child) => child instanceof THREE.Mesh && child.userData.partId === "pcb",
      ),
    ).toBe(false);
    disposePreviewModel(model);
  });

  it("keeps the legacy primary STEP PCB preview when pcbPreviews is unavailable", () => {
    const reference = {
      format: "step" as const,
      sourceName: "board.step",
      version: null,
      thickness: 1.6,
      bounds: { minX: -10, minY: -5, maxX: 10, maxY: 5 },
      outlineElements: 1,
      unsupportedOutlineElements: 0,
      mountingHoles: [],
      overallHeight: 3,
      triangleCount: 1,
    };
    const preview: StepPreview = {
      size: [20, 3, 10],
      meshes: [
        {
          name: "board-shell",
          color: [0.2, 0.45, 0.32],
          positions: new Float32Array([0, 0, 0, 10, 0, 0, 0, 1.6, 10]),
          normals: null,
          indices: new Uint32Array([0, 1, 2]),
        },
      ],
    };
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        pcbReferences: [
          {
            id: "pcb-step",
            reference,
            offsetX: 0,
            offsetZ: 0,
            elevation: 0,
            rotation: 0,
          },
        ],
      },
      "pcb",
      false,
      reference,
      preview,
      null,
      "pcb-step",
      {},
    );

    const pcbGroup = model.getObjectByName("pcb-transform-pcb-step");
    const previewMesh = pcbGroup?.children.find(
      (child) => child instanceof THREE.Mesh,
    ) as THREE.Mesh | undefined;
    expect(previewMesh).toBeDefined();
    expect(previewMesh?.geometry.getAttribute("position").count).toBe(3);
    expect(previewMesh?.castShadow).toBe(false);
    expect(previewMesh?.receiveShadow).toBe(false);
    expect(
      pcbGroup?.children.some((child) => child instanceof THREE.LineSegments),
    ).toBe(false);
    disposePreviewModel(model);
  });

  it("can hide only the PCB body while preserving mounting structures", () => {
    const bodyHiddenModel = buildPreviewModel(
      DEFAULT_PARAMETERS,
      "pcb",
      false,
      null,
      null,
      null,
      PARAMETRIC_PCB_FEATURE_ID,
      {},
      {},
      false,
      [],
      [],
      [],
      [PARAMETRIC_PCB_FEATURE_ID],
    );

    const pcbGroup = bodyHiddenModel.getObjectByName(
      `pcb-transform-${PARAMETRIC_PCB_FEATURE_ID}`,
    );
    const standoff = bodyHiddenModel.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-standoff-1`,
    );
    expect(pcbGroup?.visible).toBe(false);
    expect(standoff).toBeDefined();
    expect(standoff?.visible).toBe(true);
    expect(standoff?.parent?.visible).toBe(true);
    disposePreviewModel(bodyHiddenModel);

    const fullHiddenModel = buildPreviewModel(
      DEFAULT_PARAMETERS,
      "pcb",
      false,
      null,
      null,
      null,
      PARAMETRIC_PCB_FEATURE_ID,
      {},
      {},
      false,
      [],
      [PARAMETRIC_PCB_FEATURE_ID],
    );
    const hiddenStandoff = fullHiddenModel.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-standoff-1`,
    );
    expect(
      fullHiddenModel.getObjectByName(`pcb-transform-${PARAMETRIC_PCB_FEATURE_ID}`)
        ?.visible,
    ).toBe(false);
    expect(hiddenStandoff).toBeDefined();
    expect(hiddenStandoff?.parent?.visible).toBe(false);
    disposePreviewModel(fullHiddenModel);
  });

  it("omits the parametric PCB preview when it is disabled", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        parametricPcbEnabled: false,
        pcbReferences: [],
      },
      "project",
      false,
      null,
    );

    expect(
      model.getObjectByName(`pcb-transform-${PARAMETRIC_PCB_FEATURE_ID}`),
    ).toBeUndefined();
    expect(
      model.getObjectByName(`${PARAMETRIC_PCB_FEATURE_ID}-pcb-standoff-1`),
    ).toBeUndefined();
    disposePreviewModel(model);
  });

  it("keeps PCB rail mounts visible when only the PCB body is hidden", () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      pcbMountingType: "rail-elastic" as const,
      pcbRailAxis: "x" as const,
      pcbInsertionSide: "right" as const,
      pcbRailEntryFace: "right" as const,
    };
    const bodyHiddenModel = buildPreviewModel(
      parameters,
      "pcb",
      false,
      null,
      null,
      null,
      PARAMETRIC_PCB_FEATURE_ID,
      {},
      {},
      false,
      [],
      [],
      [],
      [PARAMETRIC_PCB_FEATURE_ID],
    );

    expect(
      bodyHiddenModel.getObjectByName(`pcb-transform-${PARAMETRIC_PCB_FEATURE_ID}`)
        ?.visible,
    ).toBe(false);
    const rail = bodyHiddenModel.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-left-lower-ledge`,
    );
    expect(rail).toBeDefined();
    expect(
      bodyHiddenModel.getObjectByName(
        `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-left-wall`,
      ),
    ).toBeUndefined();
    expect(
      bodyHiddenModel.getObjectByName(
        `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-left-side-web`,
      ),
    ).toBeDefined();
    bodyHiddenModel.updateMatrixWorld(true);
    const railBounds = new THREE.Box3().setFromObject(rail!);
    expect(Math.max(Math.abs(railBounds.min.x), Math.abs(railBounds.max.x))).toBeGreaterThanOrEqual(
      parameters.pcbLength / 2 + parameters.boardClearance - 0.05,
    );
    expect(rail?.parent?.visible).toBe(true);
    disposePreviewModel(bodyHiddenModel);

    const fullHiddenModel = buildPreviewModel(
      parameters,
      "pcb",
      false,
      null,
      null,
      null,
      PARAMETRIC_PCB_FEATURE_ID,
      {},
      {},
      false,
      [],
      [PARAMETRIC_PCB_FEATURE_ID],
    );
    const hiddenRail = fullHiddenModel.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-left-lower-ledge`,
    );
    expect(hiddenRail).toBeDefined();
    expect(hiddenRail?.parent?.visible).toBe(false);
    disposePreviewModel(fullHiddenModel);
  });

  it("forms C-channel PCB rails that bracket the board edge", () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      pcbMountingType: "rail-elastic" as const,
      pcbRailAxis: "x" as const,
      pcbInsertionSide: "right" as const,
      pcbRailEntryFace: "right" as const,
    };
    const model = buildPreviewModel(parameters, "pcb", false, null);
    const lowerLedge = model.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-left-lower-ledge`,
    );
    const topLip = model.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-left-top-lip`,
    );
    const sideWeb = model.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-left-side-web`,
    );
    const boardBottom = parameters.bottomThickness + parameters.standoffHeight;
    const boardTop = boardBottom + parameters.pcbThickness;

    expect(lowerLedge).toBeDefined();
    expect(topLip).toBeDefined();
    expect(sideWeb).toBeDefined();
    model.updateMatrixWorld(true);
    const lowerBounds = new THREE.Box3().setFromObject(lowerLedge!);
    const topBounds = new THREE.Box3().setFromObject(topLip!);
    const webBounds = new THREE.Box3().setFromObject(sideWeb!);

    expect(lowerBounds.min.y).toBeLessThan(boardBottom);
    expect(lowerBounds.max.y).toBeGreaterThan(boardBottom);
    expect(topBounds.min.y).toBeLessThanOrEqual(boardTop + 0.09);
    expect(topBounds.max.y).toBeGreaterThan(boardTop);
    expect(webBounds.min.y).toBeLessThan(boardBottom);
    expect(webBounds.max.y).toBeGreaterThan(boardTop);
    expect(lowerBounds.min.z).toBeLessThanOrEqual(-parameters.pcbWidth / 2);
    expect(lowerBounds.max.z).toBeGreaterThanOrEqual(-parameters.pcbWidth / 2);
    expect(topBounds.min.z).toBeLessThanOrEqual(-parameters.pcbWidth / 2);
    expect(topBounds.max.z).toBeGreaterThanOrEqual(-parameters.pcbWidth / 2);
    expect(webBounds.min.z).toBeLessThanOrEqual(-parameters.pcbWidth / 2);
    expect(webBounds.max.z).toBeGreaterThanOrEqual(-parameters.pcbWidth / 2 - 0.1);
    expect(webBounds.max.z).toBeLessThanOrEqual(-parameters.pcbWidth / 2 + 0.05);
    disposePreviewModel(model);
  });

  it("aligns PCB rail slots to the board when the bottom face is removable", () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      lidFace: "bottom" as const,
      removableFaces: ["bottom" as const],
      pcbMountingType: "rail-elastic" as const,
      pcbRailAxis: "x" as const,
      pcbInsertionSide: "right" as const,
      pcbRailEntryFace: "right" as const,
    };
    const model = buildPreviewModel(parameters, "pcb", false, null);
    const board = model.getObjectByName(
      `pcb-transform-${PARAMETRIC_PCB_FEATURE_ID}`,
    );
    const lowerLedge = model.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-left-lower-ledge`,
    );
    const topLip = model.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-left-top-lip`,
    );

    expect(board).toBeDefined();
    expect(lowerLedge).toBeDefined();
    expect(topLip).toBeDefined();
    model.updateMatrixWorld(true);
    const boardBounds = new THREE.Box3().setFromObject(board!);
    const lowerBounds = new THREE.Box3().setFromObject(lowerLedge!);
    const topBounds = new THREE.Box3().setFromObject(topLip!);

    expect(boardBounds.min.y).toBeCloseTo(parameters.standoffHeight, 4);
    expect(lowerBounds.min.y).toBeLessThan(boardBounds.min.y);
    expect(lowerBounds.max.y).toBeGreaterThan(boardBounds.min.y);
    expect(topBounds.min.y).toBeLessThanOrEqual(boardBounds.max.y + 0.09);
    expect(topBounds.max.y).toBeGreaterThan(boardBounds.max.y);
    disposePreviewModel(model);
  });

  it("routes PCB elastic bands as lengthwise loops over and under the board", () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      pcbMountingType: "rail-elastic" as const,
      pcbRailAxis: "z" as const,
      pcbInsertionSide: "right" as const,
    };
    const model = buildPreviewModel(parameters, "pcb", false, null);
    const railGroup = model.getObjectByName(
      `pcb-mount-transform-${PARAMETRIC_PCB_FEATURE_ID}`,
    );
    const firstLoop = railGroup?.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-elastic-band-loop-1`,
    );
    const secondLoop = railGroup?.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-elastic-band-loop-2`,
    );
    const firstAnchor = railGroup?.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-elastic-anchor-1`,
    );
    const firstBottomAnchor = railGroup?.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-elastic-anchor-1-bottom`,
    );
    const firstTopRetainer = railGroup?.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-elastic-anchor-1-top-retainer`,
    );
    const firstBottomRetainer = railGroup?.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-elastic-anchor-1-bottom-retainer`,
    );
    const boardBottom = parameters.bottomThickness + parameters.standoffHeight;
    const boardTop = boardBottom + parameters.pcbThickness;
    const bandRadius = Math.max(
      0.35,
      Math.min(0.9, parameters.pcbElasticBandWidth * 0.22),
    );
    const bottomBandCenterY = boardBottom - bandRadius - 0.08;
    const topBandCenterY = boardTop + bandRadius + 0.08;

    expect(firstLoop).toBeDefined();
    expect(secondLoop).toBeDefined();
    expect(firstAnchor).toBeDefined();
    expect(firstBottomAnchor).toBeDefined();
    expect(firstTopRetainer).toBeDefined();
    expect(firstBottomRetainer).toBeDefined();
    model.updateMatrixWorld(true);
    const loopBounds = new THREE.Box3().setFromObject(firstLoop!);
    const topAnchorBounds = new THREE.Box3().setFromObject(firstAnchor!);
    const bottomAnchorBounds = new THREE.Box3().setFromObject(firstBottomAnchor!);
    const topRetainerBounds = new THREE.Box3().setFromObject(firstTopRetainer!);
    const bottomRetainerBounds = new THREE.Box3().setFromObject(
      firstBottomRetainer!,
    );
    expect(loopBounds.max.z).toBeGreaterThan(parameters.pcbWidth / 2);
    expect(loopBounds.min.z).toBeLessThan(
      -parameters.pcbWidth / 2 + parameters.pcbStopWidth + 4,
    );
    expect(loopBounds.max.y).toBeGreaterThan(boardTop);
    expect(loopBounds.min.y).toBeLessThan(boardBottom);
    expect(topAnchorBounds.min.y).toBeLessThanOrEqual(boardTop + 0.01);
    expect(topAnchorBounds.max.y).toBeGreaterThan(boardTop);
    expect(bottomAnchorBounds.max.y).toBeGreaterThanOrEqual(boardBottom - 0.01);
    expect(bottomAnchorBounds.min.y).toBeLessThan(boardBottom);
    expect(topRetainerBounds.min.y).toBeGreaterThan(topBandCenterY);
    expect(bottomRetainerBounds.max.y).toBeLessThan(bottomBandCenterY);
    expect(topRetainerBounds.max.x - topRetainerBounds.min.x).toBeGreaterThan(
      topAnchorBounds.max.x - topAnchorBounds.min.x,
    );
    expect(
      bottomRetainerBounds.max.x - bottomRetainerBounds.min.x,
    ).toBeGreaterThan(bottomAnchorBounds.max.x - bottomAnchorBounds.min.x);
    expect(firstAnchor?.position.x).toBeLessThan(0);
    expect(firstBottomAnchor?.position.x).toBeCloseTo(firstAnchor!.position.x, 4);
    disposePreviewModel(model);
  });

  it("keeps PCB rail guides and elastic loops inside the enclosure cavity", () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      pcbMountingType: "rail-elastic" as const,
      pcbRailAxis: "z" as const,
      pcbInsertionSide: "right" as const,
      pcbRailEntryFace: "front" as const,
    };
    const model = buildPreviewModel(parameters, "pcb", false, null);
    const railGroup = model.getObjectByName(
      `pcb-mount-transform-${PARAMETRIC_PCB_FEATURE_ID}`,
    );

    expect(railGroup).toBeDefined();
    model.updateMatrixWorld(true);
    const railBounds = new THREE.Box3().setFromObject(railGroup!);
    const maxInsideX = parameters.pcbLength / 2 + parameters.boardClearance;
    const maxInsideZ = parameters.pcbWidth / 2 + parameters.boardClearance;
    expect(railBounds.min.x).toBeGreaterThanOrEqual(-maxInsideX - 0.2);
    expect(railBounds.max.x).toBeLessThanOrEqual(maxInsideX + 0.2);
    expect(railBounds.min.z).toBeGreaterThanOrEqual(-maxInsideZ - 0.2);
    expect(railBounds.max.z).toBeLessThanOrEqual(maxInsideZ + 0.2);
    disposePreviewModel(model);
  });

  it("rotates PCB rail loops when the rail axis is X", () => {
    const parameters = {
      ...DEFAULT_PARAMETERS,
      pcbMountingType: "rail-elastic" as const,
      pcbRailAxis: "x" as const,
      pcbInsertionSide: "right" as const,
      pcbRailEntryFace: "right" as const,
    };
    const model = buildPreviewModel(parameters, "pcb", false, null);
    const loop = model.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-elastic-band-loop-1`,
    );
    expect(loop).toBeDefined();
    model.updateMatrixWorld(true);
    const loopBounds = new THREE.Box3().setFromObject(loop!);
    expect(loopBounds.max.x).toBeGreaterThan(parameters.pcbLength / 2);
    expect(loopBounds.min.x).toBeLessThan(
      -parameters.pcbLength / 2 + parameters.pcbStopWidth + 4,
    );
    disposePreviewModel(model);
  });

  it("opens PCB rail mounts toward the lateral removable face", () => {
    const frontModel = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        lidFace: "front",
        removableFaces: ["front"],
        pcbMountingType: "rail-elastic" as const,
        pcbRailAxis: "x" as const,
        pcbInsertionSide: "left" as const,
        pcbRailEntryFace: "front",
      },
      "pcb",
      false,
      null,
    );
    const frontStop = frontModel.getObjectByName(
      `${PARAMETRIC_PCB_FEATURE_ID}-pcb-rail-closed-stop`,
    );
    expect(frontStop).toBeDefined();
    frontModel.updateMatrixWorld(true);
    const frontStopBounds = new THREE.Box3().setFromObject(frontStop!);
    expect(frontStopBounds.max.z).toBeLessThan(0);
    disposePreviewModel(frontModel);
  });

  it("moves an inset panel into its shell recess", () => {
    const panel = {
      ...DEFAULT_PARAMETERS.panelPlacements[0],
      insetDepth: 1.2,
    };
    const model = buildPreviewModel(
      { ...DEFAULT_PARAMETERS, panelPlacements: [panel] },
      "panel",
      false,
      null,
    );

    expect(model.getObjectByName("panel-transform-panel-1")?.position.y).toBeCloseTo(
      DEFAULT_PARAMETERS.baseHeight +
        DEFAULT_PARAMETERS.lidThickness +
        panel.thickness / 2 -
        panel.insetDepth,
    );
    disposePreviewModel(model);
  });

  it("renders multiple PCB references and custom primitive components", () => {
    const reference = {
      format: "kicad_pcb" as const,
      sourceName: "board.kicad_pcb",
      version: null,
      thickness: 1.6,
      bounds: { minX: 0, minY: 0, maxX: 40, maxY: 20 },
      outlineElements: 4,
      unsupportedOutlineElements: 0,
      mountingHoles: [],
    };
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        pcbReferences: [
          { id: "pcb-a", reference, offsetX: -12, offsetZ: 0, elevation: 0, rotation: 0 },
          { id: "pcb-b", reference, offsetX: 12, offsetZ: 0, elevation: 5, rotation: 90 },
        ],
        customComponents: [
          {
            id: "custom-a",
            name: "传感器包络",
            shape: "box",
            width: 12,
            height: 8,
            depth: 10,
            positionX: 4,
            positionY: 12,
            positionZ: -6,
            rotationX: 0,
            rotationY: 30,
            rotationZ: 0,
            color: "#4f7f6a",
            sourceName: null,
          },
        ],
      },
      "custom",
      false,
      null,
    );

    expect(model.getObjectByName("pcb-transform-pcb-a")).toBeDefined();
    expect(model.getObjectByName("pcb-transform-pcb-b")?.position.y).toBe(
      DEFAULT_PARAMETERS.bottomThickness + DEFAULT_PARAMETERS.standoffHeight + 5,
    );
    expect(model.getObjectByName("custom-transform-custom-a")?.position.x).toBe(4);
    disposePreviewModel(model);
  });

  it("renders battery trays and a transparent lid inspection mode", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        batteryCompartments: [
          {
            id: "battery-1",
            preset: "aa",
            face: "bottom",
            retentionType: "open",
            insertionSide: "right",
            cellCount: 2,
            width: 54.9,
            depth: 34.4,
            height: 10.59,
            wallThickness: 1.6,
            clearance: 0.6,
            offsetX: 4,
            offsetZ: -3,
            rotation: 90,
          },
        ],
      },
      "battery",
      false,
      null,
      null,
      null,
      "battery-1",
      {},
      {},
      true,
    );

    expect(model.getObjectByName("battery-transform-battery-1")?.position.x).toBe(4);
    expect(model.getObjectByName("battery-1-side-rail-left")).toBeDefined();
    expect(model.getObjectByName("battery-1-divider-1")).toBeDefined();
    expect(model.getObjectByName("battery-1-end-stop-1-negative")).toBeDefined();
    expect(model.getObjectByName("battery-1-cell-1")).toBeDefined();
    const lidMesh = model.children.find(
      (child) => child instanceof THREE.Mesh && child.userData.partId === "lid",
    ) as THREE.Mesh | undefined;
    expect((lidMesh?.material as THREE.MeshStandardMaterial).opacity).toBe(0.24);
    expect((lidMesh?.material as THREE.MeshStandardMaterial).depthWrite).toBe(false);
    disposePreviewModel(model);
  });

  it("renders top-mounted elastic battery trays and PCB rail mounts", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        boardClearance: 5,
        pcbMountingType: "rail-elastic",
        pcbInsertionSide: "left",
        batteryCompartments: [
          {
            id: "battery-lid",
            preset: "aa",
            face: "top",
            retentionType: "elastic",
            insertionSide: "left",
            cellCount: 2,
            width: 54.9,
            depth: 34.4,
            height: 10.59,
            wallThickness: 1.6,
            clearance: 0.6,
            offsetX: 0,
            offsetZ: 0,
            rotation: 0,
          },
        ],
      },
      "battery",
      false,
      null,
      null,
      null,
      "battery-lid",
    );

    expect(model.getObjectByName("battery-transform-battery-lid")?.position.y).toBe(
      DEFAULT_PARAMETERS.baseHeight - 10.59 / 2,
    );
    expect(model.getObjectByName("battery-lid-entry-guide-1-negative")).toBeDefined();
    expect(model.getObjectByName("battery-lid-end-stop-1-positive")).toBeDefined();
    expect(model.getObjectByName("battery-lid-elastic-band")).toBeDefined();
    expect(model.getObjectByName("pcb-main-pcb-rail-left-wall")).toBeUndefined();
    expect(model.getObjectByName("pcb-main-pcb-rail-left-lower-ledge")).toBeDefined();
    expect(model.getObjectByName("pcb-main-pcb-rail-left-top-lip")).toBeDefined();
    expect(model.getObjectByName("pcb-main-pcb-elastic-band-loop-1")).toBeDefined();
    expect(model.getObjectByName("pcb-main-pcb-elastic-band-loop-2")).toBeDefined();
    disposePreviewModel(model);
  });

  it("mounts battery trays on side faces", () => {
    const battery = {
      id: "battery-front",
      preset: "aa" as const,
      face: "front" as const,
      retentionType: "clip" as const,
      insertionSide: "right" as const,
      cellCount: 2,
      width: 54.9,
      depth: 20,
      height: 10.59,
      wallThickness: 1.6,
      clearance: 0.6,
      offsetX: 5,
      offsetZ: 2,
      rotation: 0 as const,
    };
    const model = buildPreviewModel(
      { ...DEFAULT_PARAMETERS, batteryCompartments: [battery] },
      "battery",
      false,
      null,
      null,
      null,
      battery.id,
    );

    const batteryGroup = model.getObjectByName("battery-transform-battery-front");
    expect(batteryGroup?.position.x).toBe(5);
    expect(batteryGroup?.position.y).toBe(DEFAULT_PARAMETERS.baseHeight / 2 + 2);
    expect(batteryGroup?.position.z).toBeCloseTo(
      (DEFAULT_PARAMETERS.pcbWidth + DEFAULT_PARAMETERS.boardClearance * 2) / 2 -
        battery.height / 2,
      3,
    );
    expect(model.getObjectByName("battery-front-retention-clip-left")).toBeDefined();
    disposePreviewModel(model);
  });

  it.each(["top", "bottom", "front", "back", "left", "right"] as const)(
    "places the panel on the %s face",
    (face) => {
      const model = buildPreviewModel(
        {
          ...DEFAULT_PARAMETERS,
          panelPlacements: DEFAULT_PARAMETERS.panelPlacements.map((panel) => ({
            ...panel,
            face,
          })),
        },
        "panel",
        false,
        null,
      );

      expect(
        model.children.filter(
          (child) => child.userData.featureId === "panel-1" && child.userData.face === face,
        ),
      ).toHaveLength(1);
      const panelGroup = model.getObjectByName("panel-transform-panel-1");
      expect(panelGroup).toBeDefined();
      expect(panelGroup?.getObjectByName("panel-1-fixing-1")?.parent).toBe(
        panelGroup,
      );
      expect(panelGroup?.getObjectByName("panel-1-mounting-tab-1")?.parent).toBe(
        panelGroup,
      );
      expect(panelGroup?.getObjectByName("panel-1-boss-1")).toBeUndefined();
      if (face !== "top") {
        expect(panelGroup?.getObjectByName("panel-opening-panel-1")?.parent).toBe(
          panelGroup,
        );
      }
      disposePreviewModel(model);
    },
  );

  it("renders multiple independently placed connectors", () => {
    const first = DEFAULT_PARAMETERS.connectorPlacements[0];
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        connectorPlacements: [
          first,
          { ...first, id: "connector-2", surface: "right", offsetV: 2 },
        ],
      },
      "connector",
      false,
      null,
    );

    expect(
      model.children.filter((child) => child.name === "connector-transform-connector-1"),
    ).toHaveLength(1);
    expect(
      model.children.filter((child) => child.name === "connector-transform-connector-2"),
    ).toHaveLength(1);
    const firstGroup = model.getObjectByName("connector-transform-connector-1");
    const connectorOpening = firstGroup?.getObjectByName("connector-1-opening");
    expect(connectorOpening?.parent).toBe(firstGroup);
    expect(connectorOpening).toBeInstanceOf(THREE.LineSegments);
    expect(connectorOpening).not.toBeInstanceOf(THREE.Mesh);
    const connectorKeepout = firstGroup?.getObjectByName("connector-1-keepout");
    expect(connectorKeepout?.parent).toBe(firstGroup);
    expect(connectorKeepout).toBeInstanceOf(THREE.LineSegments);
    expect(connectorKeepout).not.toBeInstanceOf(THREE.Mesh);
    disposePreviewModel(model);
  });

  it("places surface-mounted keypad previews outside the face with a hit target", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        connectorPlacements: [
          {
            ...DEFAULT_PARAMETERS.connectorPlacements[0],
            id: "membrane-1",
            definitionId: "membrane-switch-1key",
            surface: "front",
            panelId: null,
            offsetU: 0,
            offsetV: 0,
            rotation: 0,
            cutoutWidth: 20,
            cutoutHeight: 23,
          },
        ],
      },
      "connector",
      false,
      null,
      null,
      null,
      "membrane-1",
    );

    const group = model.getObjectByName("connector-transform-membrane-1");
    const hitbox = group?.getObjectByName("membrane-1-hitbox");
    const dimensions = deriveEnclosureDimensions(DEFAULT_PARAMETERS);
    expect(group).toBeDefined();
    expect(group?.position.z).toBeGreaterThan(dimensions.outsideWidth / 2);
    expect(hitbox).toBeInstanceOf(THREE.Mesh);
    expect(hitbox?.userData.featureId).toBe("membrane-1");
    disposePreviewModel(model);
  });

  it("renders FPC connectors with a dedicated low-overlap preview", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        connectorPlacements: [
          {
            ...DEFAULT_PARAMETERS.connectorPlacements[0],
            id: "fpc-1",
            definitionId: "fpc-20p-05",
            surface: "front",
            panelId: null,
            offsetU: 0,
            offsetV: -3,
            rotation: 0,
          },
        ],
      },
      "connector",
      false,
      null,
      null,
      null,
      "fpc-1",
    );

    const group = model.getObjectByName("connector-transform-fpc-1");
    expect(group).toBeDefined();
    expect(group?.getObjectByName("fpc-1")).toBeInstanceOf(THREE.Mesh);
    expect(group?.getObjectByName("fpc-1-latch")).toBeInstanceOf(THREE.Mesh);
    expect(group?.getObjectByName("fpc-1-slot")).toBeInstanceOf(
      THREE.LineSegments,
    );
    expect(group?.getObjectByName("fpc-1-opening")).toBeInstanceOf(
      THREE.LineSegments,
    );
    expect(group?.getObjectByName("fpc-1-keepout")).toBeInstanceOf(
      THREE.LineSegments,
    );
    expect(
      group?.children.some(
        (child) =>
          child instanceof THREE.LineSegments &&
          child.name === "" &&
          child.userData.partId === "connector",
      ),
    ).toBe(false);
    disposePreviewModel(model);
  });

  it("renders LCDWIKI display devices with a visible screen window", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        connectorPlacements: [
          {
            id: "display-1",
            definitionId: "lcdwiki-msp2807",
            surface: "top",
            panelId: null,
            offsetU: 0,
            offsetV: 0,
            rotation: 0,
            cutoutWidth: 46.2,
            cutoutHeight: 67.2,
            displayMountingType: "screw",
          },
        ],
      },
      "connector",
      false,
      null,
      null,
      null,
      "display-1",
    );

    const group = model.getObjectByName("connector-transform-display-1");
    expect(group).toBeDefined();
    expect(group?.getObjectByName("display-1-opening")).toBeInstanceOf(
      THREE.LineSegments,
    );
    const displayPcb = group?.getObjectByName("display-1-display-pcb");
    const lcdPanel = group?.getObjectByName("display-1-display-lcd-panel");
    const activeArea = group?.getObjectByName("display-1-display-active-area");
    const headerPin = group?.getObjectByName("display-1-display-header-pin-1");
    const mountHole = group?.getObjectByName("display-1-display-mount-hole-1");
    const displayScrew = group?.getObjectByName("display-1-display-screw-1");
    const displayScrewBoss = group?.getObjectByName(
      "display-1-display-screw-boss-1",
    );
    const touchTail = group?.getObjectByName("display-1-display-touch-tail");
    expect(displayPcb).toBeInstanceOf(THREE.Mesh);
    expect(lcdPanel).toBeInstanceOf(THREE.Mesh);
    expect(activeArea).toBeInstanceOf(THREE.Mesh);
    expect(headerPin).toBeInstanceOf(THREE.Mesh);
    expect(mountHole).toBeInstanceOf(THREE.Mesh);
    expect(displayScrew).toBeInstanceOf(THREE.Mesh);
    expect(displayScrewBoss).toBeInstanceOf(THREE.Mesh);
    expect(touchTail).toBeInstanceOf(THREE.Mesh);
    expect(displayPcb?.userData.featureKind).toBe("connector");
    expect(lcdPanel?.parent).toBe(group);
    expect((headerPin as THREE.Object3D).position.y).toBeLessThan(
      (activeArea as THREE.Object3D).position.y,
    );
    expect((mountHole as THREE.Object3D).position.y).toBeLessThan(
      (activeArea as THREE.Object3D).position.y,
    );
    disposePreviewModel(model);
  });

  it("renders bare OLED display devices with a flex tail and solder pads", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        connectorPlacements: [
          {
            id: "oled-1",
            definitionId: "generic-oled-091-128x32-bare-solder-14p",
            surface: "top",
            panelId: null,
            offsetU: 0,
            offsetV: 0,
            rotation: 0,
            cutoutWidth: 25.08,
            cutoutHeight: 8.28,
            displayMountingType: "screw",
          },
        ],
      },
      "connector",
      false,
      null,
      null,
      null,
      "oled-1",
    );

    const group = model.getObjectByName("connector-transform-oled-1");
    expect(group).toBeDefined();
    expect(group?.getObjectByName("oled-1-display-oled-glass")).toBeInstanceOf(
      THREE.Mesh,
    );
    expect(group?.getObjectByName("oled-1-display-active-area")).toBeInstanceOf(
      THREE.Mesh,
    );
    expect(group?.getObjectByName("oled-1-display-flex-tail")).toBeInstanceOf(
      THREE.Mesh,
    );
    expect(group?.getObjectByName("oled-1-display-flex-pad-14")).toBeInstanceOf(
      THREE.Mesh,
    );
    expect(group?.getObjectByName("oled-1-display-window-outline")).toBeInstanceOf(
      THREE.LineSegments,
    );
    expect(group?.getObjectByName("oled-1-display-header-pin-1")).toBeUndefined();
    expect(group?.getObjectByName("oled-1-display-mount-hole-1")).toBeUndefined();
    expect(group?.getObjectByName("oled-1-display-screw-1")).toBeUndefined();
    disposePreviewModel(model);
  });

  it("renders each antenna as an independently transformable group", () => {
    const model = buildPreviewModel(
      {
        ...DEFAULT_PARAMETERS,
        antennaPlacements: [
          {
            id: "antenna-1",
            definitionId: "sma-bulkhead-whip",
            surface: "back",
            panelId: null,
            offsetU: -15,
            offsetV: 0,
            rotation: 0,
            cutoutDiameter: 6.8,
          },
          {
            id: "antenna-2",
            definitionId: "adhesive-fpc-antenna",
            surface: "right",
            panelId: null,
            offsetU: 8,
            offsetV: 0,
            rotation: 90,
            cutoutDiameter: 0,
          },
        ],
      },
      "antenna",
      false,
      null,
      null,
      null,
      "antenna-1",
    );

    expect(model.getObjectByName("antenna-transform-antenna-1")).toBeDefined();
    expect(model.getObjectByName("antenna-transform-antenna-2")).toBeDefined();
    const antennaKeepout = model.getObjectByName("antenna-1-keepout");
    expect(antennaKeepout?.parent?.name).toBe("antenna-transform-antenna-1");
    expect(antennaKeepout).toBeInstanceOf(THREE.LineSegments);
    expect(antennaKeepout).not.toBeInstanceOf(THREE.Mesh);
    disposePreviewModel(model);
  });
});
