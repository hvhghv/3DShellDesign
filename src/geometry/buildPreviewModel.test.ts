import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { DEFAULT_PARAMETERS } from "../domain/enclosure";
import type { MagnetSupportType, SelectablePart } from "../domain/model";
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
    const lidMesh = model.children.find(
      (child) => child instanceof THREE.Mesh && child.userData.partId === "lid",
    ) as THREE.Mesh | undefined;
    expect((lidMesh?.material as THREE.MeshStandardMaterial).opacity).toBe(0.24);
    expect((lidMesh?.material as THREE.MeshStandardMaterial).depthWrite).toBe(false);
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
