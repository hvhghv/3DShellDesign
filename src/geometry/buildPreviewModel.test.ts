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
      if (face !== "top") {
        expect(
          model.children.filter((child) => child.name === "panel-opening-panel-1"),
        ).toHaveLength(1);
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
