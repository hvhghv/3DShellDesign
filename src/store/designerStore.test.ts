import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../domain/enclosure";
import { PARAMETRIC_PCB_FEATURE_ID } from "../domain/pcbMounting";
import { useDesignerStore } from "./designerStore";
import type { PcbReference } from "../domain/model";

const originalState = useDesignerStore.getState();

afterEach(() => {
  useDesignerStore.setState(originalState, true);
  useDesignerStore.getState().clearHistory();
});

describe("designer store", () => {
  it("undoes, redoes and duplicates feature edits", () => {
    useDesignerStore.setState({
      ...originalState,
      cacheStatus: "saved",
      parameters: { ...DEFAULT_PARAMETERS, connectorPlacements: [] },
      selectedPart: "project",
      selectedFeatureId: null,
    });
    useDesignerStore.getState().clearHistory();

    useDesignerStore.getState().addConnectorPlacement("terminal-125-4p");
    const first = useDesignerStore.getState().parameters.connectorPlacements[0];
    expect(useDesignerStore.getState().canUndo).toBe(true);

    useDesignerStore.getState().duplicateFeature("connector", first.id);
    expect(useDesignerStore.getState().parameters.connectorPlacements).toHaveLength(2);
    expect(useDesignerStore.getState().parameters.connectorPlacements[1]).toEqual(
      expect.objectContaining({
        definitionId: first.definitionId,
        offsetU: first.offsetU + first.cutoutWidth + 3,
        offsetV: first.offsetV,
      }),
    );

    useDesignerStore.getState().undo();
    expect(useDesignerStore.getState().parameters.connectorPlacements).toHaveLength(1);
    expect(useDesignerStore.getState().canRedo).toBe(true);
    useDesignerStore.getState().redo();
    expect(useDesignerStore.getState().parameters.connectorPlacements).toHaveLength(2);
  });

  it("keeps locked features visible but prevents edits and deletion", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    useDesignerStore.setState({
      ...originalState,
      cacheStatus: "saved",
      parameters: { ...DEFAULT_PARAMETERS },
      selectedPart: "connector",
      selectedFeatureId: connector.id,
    });
    useDesignerStore.getState().clearHistory();

    useDesignerStore.getState().toggleFeatureLock(connector.id);
    useDesignerStore.getState().updateConnectorPlacement(connector.id, {
      offsetU: 24,
    });
    useDesignerStore.getState().removeConnectorPlacement(connector.id);
    expect(useDesignerStore.getState().parameters.connectorPlacements[0]).toEqual(
      connector,
    );

    useDesignerStore.getState().toggleFeatureVisibility(connector.id);
    expect(useDesignerStore.getState().hiddenFeatureIds).toContain(connector.id);
    expect(useDesignerStore.getState().canUndo).toBe(false);
    useDesignerStore.getState().toggleFeatureLock(connector.id);
    useDesignerStore.getState().removeConnectorPlacement(connector.id);
    expect(useDesignerStore.getState().parameters.connectorPlacements).toHaveLength(0);
    expect(useDesignerStore.getState().hiddenFeatureIds).not.toContain(connector.id);
  });


  it("adds the requested connector definition", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS, connectorPlacements: [] },
    });

    useDesignerStore.getState().addConnectorPlacement("terminal-125-4p");

    expect(useDesignerStore.getState().parameters.connectorPlacements).toEqual([
      expect.objectContaining({
        definitionId: "terminal-125-4p",
        cutoutWidth: 7.95,
      }),
    ]);
  });

  it("adds devices to the requested enclosure face or panel", () => {
    const panel = DEFAULT_PARAMETERS.panelPlacements[0];
    useDesignerStore.setState({
      ...originalState,
      parameters: {
        ...DEFAULT_PARAMETERS,
        connectorPlacements: [],
        antennaPlacements: [],
      },
    });

    useDesignerStore
      .getState()
      .addConnectorPlacement("terminal-125-4p", "bottom");
    useDesignerStore
      .getState()
      .addAntennaPlacement("adhesive-fpc-antenna", "panel", panel.id);

    expect(useDesignerStore.getState().parameters.connectorPlacements[0]).toEqual(
      expect.objectContaining({ surface: "bottom", panelId: null }),
    );
    expect(useDesignerStore.getState().parameters.antennaPlacements[0]).toEqual(
      expect.objectContaining({ surface: "panel", panelId: panel.id }),
    );
  });

  it("clamps panel edits to the selected enclosure face", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS },
    });

    useDesignerStore.getState().updatePanelPlacement("panel-1", {
      face: "bottom",
      offsetU: 41.5,
      offsetV: 50,
    });

    expect(useDesignerStore.getState().parameters.panelPlacements[0]).toEqual(
      expect.objectContaining({ offsetU: 20.68, offsetV: 16.72 }),
    );
  });

  it("limits panel inset depth to preserve a shell support layer", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS },
    });

    useDesignerStore.getState().updatePanelPlacement("panel-1", {
      insetDepth: 2,
    });

    expect(
      useDesignerStore.getState().parameters.panelPlacements[0].insetDepth,
    ).toBe(1.6);
  });

  it("updates panel corner, border and symmetric screw positions", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS },
    });

    useDesignerStore.getState().updatePanelPlacement("panel-1", {
      cornerRadius: 8,
      borderWidth: 4,
      mountingInsetX: 9,
      mountingInsetY: 7,
    });

    expect(useDesignerStore.getState().parameters.panelPlacements[0]).toEqual(
      expect.objectContaining({
        cornerRadius: 8,
        borderWidth: 4,
        mountingInsetX: 9,
        mountingInsetY: 7,
      }),
    );
  });

  it("configures flush screw head recesses and preserves a support floor", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS },
    });

    useDesignerStore.getState().setParameter("closureScrewHeadRecessEnabled", true);
    useDesignerStore.getState().setParameter("closureScrewHeadRecessDepth", 5);
    useDesignerStore.getState().updatePanelPlacement("panel-1", {
      screwHeadRecessEnabled: true,
      screwHeadRecessDepth: 5,
    });

    const parameters = useDesignerStore.getState().parameters;
    expect(parameters.closureScrewHeadRecessEnabled).toBe(true);
    expect(parameters.closureScrewHeadRecessDepth).toBe(1.6);
    expect(parameters.panelPlacements[0]).toEqual(
      expect.objectContaining({
        screwHeadRecessEnabled: true,
        screwHeadRecessDepth: 1.6,
      }),
    );
  });

  it("appends independently positioned PCB references", () => {
    const reference = (sourceName: string, length: number): PcbReference => ({
      format: "kicad_pcb",
      sourceName,
      version: "20240108",
      thickness: 1.6,
      bounds: { minX: 0, minY: 0, maxX: length, maxY: 40 },
      outlineElements: 4,
      unsupportedOutlineElements: 0,
      mountingHoles: [],
    });
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS, pcbReferences: [] },
      pcbReference: null,
      pcbPreviews: {},
    });

    useDesignerStore.getState().setPcbReference(reference("first.kicad_pcb", 60));
    useDesignerStore.getState().setPcbReference(reference("second.kicad_pcb", 30));

    const state = useDesignerStore.getState();
    expect(state.parameters.pcbReferences).toHaveLength(2);
    expect(state.parameters.parametricPcbEnabled).toBe(false);
    expect(state.parameters.pcbLength).toBe(60);
    expect(state.parameters.pcbReferences[1]).toEqual(
      expect.objectContaining({ elevation: 5, offsetX: 0 }),
    );
    expect(state.selectedFeatureId).toBe(state.parameters.pcbReferences[1].id);
  });

  it("moves and hides the parametric PCB feature", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS, pcbReferences: [] },
      selectedPart: "project",
      selectedFeatureId: null,
      hiddenFeatureIds: [],
    });

    useDesignerStore.getState().setSelectedPart("pcb");
    useDesignerStore.getState().updatePcbReferencePlacement(PARAMETRIC_PCB_FEATURE_ID, {
      offsetX: 12,
      elevation: -2,
      offsetZ: -8,
    });
    useDesignerStore.getState().toggleFeatureVisibility(PARAMETRIC_PCB_FEATURE_ID);

    const state = useDesignerStore.getState();
    expect(state.selectedFeatureId).toBe(PARAMETRIC_PCB_FEATURE_ID);
    expect(state.parameters).toEqual(
      expect.objectContaining({
        pcbOffsetX: 12,
        pcbElevation: -2,
        pcbOffsetZ: -8,
      }),
    );
    expect(state.hiddenFeatureIds).toContain(PARAMETRIC_PCB_FEATURE_ID);
  });

  it("deletes and restores the parametric PCB feature", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: {
        ...DEFAULT_PARAMETERS,
        parametricPcbEnabled: true,
        pcbReferences: [],
      },
      selectedPart: "pcb",
      selectedFeatureId: PARAMETRIC_PCB_FEATURE_ID,
      hiddenFeatureIds: [PARAMETRIC_PCB_FEATURE_ID],
      hiddenPcbBodyIds: [PARAMETRIC_PCB_FEATURE_ID],
      transparentObjectIds: [PARAMETRIC_PCB_FEATURE_ID],
    });

    useDesignerStore.getState().clearPcbReference(PARAMETRIC_PCB_FEATURE_ID);

    let state = useDesignerStore.getState();
    expect(state.parameters.parametricPcbEnabled).toBe(false);
    expect(state.selectedPart).toBe("project");
    expect(state.selectedFeatureId).toBeNull();
    expect(state.hiddenFeatureIds).not.toContain(PARAMETRIC_PCB_FEATURE_ID);
    expect(state.hiddenPcbBodyIds).not.toContain(PARAMETRIC_PCB_FEATURE_ID);
    expect(state.transparentObjectIds).not.toContain(PARAMETRIC_PCB_FEATURE_ID);

    useDesignerStore.getState().addParametricPcb();

    state = useDesignerStore.getState();
    expect(state.parameters.parametricPcbEnabled).toBe(true);
    expect(state.selectedPart).toBe("pcb");
    expect(state.selectedFeatureId).toBe(PARAMETRIC_PCB_FEATURE_ID);
  });

  it("allows movement only from the removable face while rail mounted", () => {
    const reference: PcbReference = {
      format: "kicad_pcb",
      sourceName: "rail-board.kicad_pcb",
      version: "20240108",
      thickness: 1.6,
      bounds: { minX: 0, minY: 0, maxX: 50, maxY: 30 },
      outlineElements: 4,
      unsupportedOutlineElements: 0,
      mountingHoles: [],
    };
    useDesignerStore.setState({
      ...originalState,
      parameters: {
        ...DEFAULT_PARAMETERS,
        lidFace: "left",
        pcbMountingType: "rail-elastic",
        pcbRailAxis: "z",
        pcbInsertionSide: "right",
        pcbOffsetX: 3,
        pcbElevation: 1,
        pcbOffsetZ: 2,
        pcbReferences: [
          {
            id: "pcb-rail",
            reference,
            offsetX: 4,
            offsetZ: 5,
            elevation: 2,
            rotation: 0,
          },
        ],
      },
    });

    useDesignerStore.getState().setParameter("pcbOffsetX", 30);
    useDesignerStore.getState().setParameter("pcbElevation", 9);
    useDesignerStore.getState().setParameter("pcbOffsetZ", 14);
    useDesignerStore.getState().updatePcbReferencePlacement(PARAMETRIC_PCB_FEATURE_ID, {
      offsetX: 40,
      elevation: 12,
      offsetZ: 16,
    });
    useDesignerStore.getState().updatePcbReferencePlacement("pcb-rail", {
      offsetX: 24,
      elevation: 10,
      offsetZ: -6,
    });

    const parameters = useDesignerStore.getState().parameters;
    expect(parameters).toEqual(
      expect.objectContaining({
        pcbRailAxis: "x",
        pcbInsertionSide: "left",
        pcbOffsetX: 40,
        pcbElevation: 1,
        pcbOffsetZ: 2,
      }),
    );
    expect(parameters.pcbReferences[0]).toEqual(
      expect.objectContaining({
        offsetX: 24,
        elevation: 2,
        offsetZ: 5,
      }),
    );

    useDesignerStore.getState().setParameter("pcbRailAxis", "x");
    useDesignerStore.getState().setParameter("pcbOffsetX", 30);
    useDesignerStore.getState().setParameter("pcbOffsetZ", 22);
    useDesignerStore.getState().updatePcbReferencePlacement("pcb-rail", {
      offsetX: 24,
      offsetZ: 18,
      elevation: 10,
    });
    expect(useDesignerStore.getState().parameters).toEqual(
      expect.objectContaining({
        pcbRailAxis: "x",
        pcbInsertionSide: "left",
        pcbOffsetX: 30,
        pcbElevation: 1,
        pcbOffsetZ: 2,
      }),
    );
    expect(useDesignerStore.getState().parameters.pcbReferences[0]).toEqual(
      expect.objectContaining({
        offsetX: 24,
        elevation: 2,
        offsetZ: 5,
      }),
    );

    useDesignerStore.getState().setParameter("lidFace", "front");
    useDesignerStore.getState().setParameter("pcbOffsetX", 31);
    useDesignerStore.getState().setParameter("pcbOffsetZ", 22);
    useDesignerStore.getState().updatePcbReferencePlacement("pcb-rail", {
      rotation: 90,
      offsetX: 88,
      offsetZ: 26,
      elevation: 10,
    });

    const frontFaceParameters = useDesignerStore.getState().parameters;
    expect(frontFaceParameters).toEqual(
      expect.objectContaining({
        pcbRailAxis: "z",
        pcbInsertionSide: "right",
        lidFace: "front",
        pcbOffsetX: 0,
        pcbElevation: 1,
        pcbOffsetZ: 22,
      }),
    );
    expect(frontFaceParameters.pcbReferences[0]).toEqual(
      expect.objectContaining({
        offsetX: 0,
        elevation: 2,
        offsetZ: 26,
        rotation: 90,
      }),
    );
  });

  it("re-homes rail mounted PCBs when the removable face changes", () => {
    const reference: PcbReference = {
      format: "step",
      sourceName: "outside-board.step",
      version: null,
      thickness: 1.6,
      bounds: { minX: 0, minY: 0, maxX: 80, maxY: 40 },
      outlineElements: 1,
      unsupportedOutlineElements: 0,
      mountingHoles: [],
    };
    useDesignerStore.setState({
      ...originalState,
      parameters: {
        ...DEFAULT_PARAMETERS,
        lidFace: "left",
        pcbMountingType: "rail-screw",
        pcbOffsetX: 68,
        pcbOffsetZ: -12,
        pcbReferences: [
          {
            id: "pcb-outside",
            reference,
            offsetX: -75,
            offsetZ: 18,
            elevation: 0,
            rotation: 0,
          },
        ],
      },
    });

    useDesignerStore.getState().setParameter("lidFace", "front");

    const parameters = useDesignerStore.getState().parameters;
    expect(parameters).toEqual(
      expect.objectContaining({
        lidFace: "front",
        pcbRailAxis: "z",
        pcbInsertionSide: "right",
        pcbOffsetX: 0,
        pcbOffsetZ: 0,
      }),
    );
    expect(parameters.pcbReferences[0]).toEqual(
      expect.objectContaining({
        offsetX: 0,
        offsetZ: 0,
      }),
    );
  });

  it("re-homes imported rail PCBs on pure rotation changes", () => {
    const reference: PcbReference = {
      format: "kicad_pcb",
      sourceName: "rotated-board.kicad_pcb",
      version: "20240108",
      thickness: 1.6,
      bounds: { minX: 0, minY: 0, maxX: 60, maxY: 32 },
      outlineElements: 4,
      unsupportedOutlineElements: 0,
      mountingHoles: [],
    };
    useDesignerStore.setState({
      ...originalState,
      parameters: {
        ...DEFAULT_PARAMETERS,
        lidFace: "front",
        pcbMountingType: "rail-elastic",
        pcbReferences: [
          {
            id: "pcb-rotating",
            reference,
            offsetX: 42,
            offsetZ: -55,
            elevation: 0,
            rotation: 0,
          },
        ],
      },
    });

    useDesignerStore.getState().updatePcbReferencePlacement("pcb-rotating", {
      rotation: 90,
    });

    expect(useDesignerStore.getState().parameters.pcbReferences[0]).toEqual(
      expect.objectContaining({
        offsetX: 0,
        offsetZ: 0,
        rotation: 90,
      }),
    );
  });

  it("toggles generalized object transparency and keeps lid compatibility", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS },
      lidTransparent: false,
      transparentObjectIds: [],
    });

    useDesignerStore.getState().toggleObjectTransparency("lid");
    expect(useDesignerStore.getState().lidTransparent).toBe(true);
    expect(useDesignerStore.getState().transparentObjectIds).toContain("lid");

    useDesignerStore.getState().toggleLidTransparency();
    expect(useDesignerStore.getState().lidTransparent).toBe(false);
    expect(useDesignerStore.getState().transparentObjectIds).not.toContain("lid");

    useDesignerStore.getState().toggleObjectTransparency(connector.id);
    expect(useDesignerStore.getState().transparentObjectIds).toContain(connector.id);

    useDesignerStore.getState().showAllOpaque();
    expect(useDesignerStore.getState().transparentObjectIds).toEqual([]);
    expect(useDesignerStore.getState().lidTransparent).toBe(false);
  });

  it("separates PCB body visibility from full feature visibility", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS, pcbReferences: [] },
      hiddenFeatureIds: [],
      hiddenPcbBodyIds: [],
    });

    useDesignerStore
      .getState()
      .togglePcbBodyVisibility(PARAMETRIC_PCB_FEATURE_ID);
    expect(useDesignerStore.getState().hiddenPcbBodyIds).toContain(
      PARAMETRIC_PCB_FEATURE_ID,
    );
    expect(useDesignerStore.getState().hiddenFeatureIds).not.toContain(
      PARAMETRIC_PCB_FEATURE_ID,
    );

    useDesignerStore
      .getState()
      .toggleFeatureVisibility(PARAMETRIC_PCB_FEATURE_ID);
    expect(useDesignerStore.getState().hiddenFeatureIds).toContain(
      PARAMETRIC_PCB_FEATURE_ID,
    );

    useDesignerStore
      .getState()
      .toggleFeatureVisibility(PARAMETRIC_PCB_FEATURE_ID);
    expect(useDesignerStore.getState().hiddenFeatureIds).not.toContain(
      PARAMETRIC_PCB_FEATURE_ID,
    );
    expect(useDesignerStore.getState().hiddenPcbBodyIds).not.toContain(
      PARAMETRIC_PCB_FEATURE_ID,
    );

    useDesignerStore
      .getState()
      .togglePcbBodyVisibility(PARAMETRIC_PCB_FEATURE_ID);
    useDesignerStore.getState().showAllFeatures();
    expect(useDesignerStore.getState().hiddenFeatureIds).toEqual([]);
    expect(useDesignerStore.getState().hiddenPcbBodyIds).toEqual([]);
  });

  it("requires explicit transform edit mode and resets it on selection changes", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS },
      selectedPart: "connector",
      selectedFeatureId: connector.id,
      transformEditMode: false,
      transformAxisConstraint: "all",
    });

    useDesignerStore.getState().toggleTransformEditMode();
    useDesignerStore.getState().setTransformAxisConstraint("x");
    expect(useDesignerStore.getState().transformEditMode).toBe(true);
    expect(useDesignerStore.getState().transformAxisConstraint).toBe("x");

    useDesignerStore.getState().setSelectedFeature("connector", connector.id);
    expect(useDesignerStore.getState().transformEditMode).toBe(true);
    expect(useDesignerStore.getState().transformAxisConstraint).toBe("x");

    useDesignerStore.getState().setSelectedFeature("panel", "panel-1");
    expect(useDesignerStore.getState().transformEditMode).toBe(false);
    expect(useDesignerStore.getState().transformAxisConstraint).toBe("all");

    useDesignerStore.getState().setTransformEditMode(true);
    useDesignerStore.getState().setTransformAxisConstraint("z");
    useDesignerStore.getState().setTransformEditMode(false);
    expect(useDesignerStore.getState().transformEditMode).toBe(false);
    expect(useDesignerStore.getState().transformAxisConstraint).toBe("all");
  });

  it("drops transparent state for removed feature ids", () => {
    const connector = DEFAULT_PARAMETERS.connectorPlacements[0];
    useDesignerStore.setState({
      ...originalState,
      cacheStatus: "saved",
      parameters: { ...DEFAULT_PARAMETERS },
      selectedPart: "connector",
      selectedFeatureId: connector.id,
      transparentObjectIds: [connector.id, "lid"],
      lidTransparent: true,
    });
    useDesignerStore.getState().clearHistory();

    useDesignerStore.getState().removeConnectorPlacement(connector.id);

    expect(useDesignerStore.getState().transparentObjectIds).toEqual(["lid"]);
    expect(useDesignerStore.getState().lidTransparent).toBe(true);
  });

  it("creates, edits and removes custom primitive components", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS, customComponents: [] },
      customComponentPreviews: {},
    });

    useDesignerStore.getState().addCustomComponent("cylinder");
    const component = useDesignerStore.getState().parameters.customComponents[0];
    useDesignerStore.getState().updateCustomComponent(component.id, {
      width: 18,
      positionX: 12,
    });

    expect(useDesignerStore.getState().parameters.customComponents[0]).toEqual(
      expect.objectContaining({ width: 18, depth: 18, positionX: 12 }),
    );
    useDesignerStore.getState().removeCustomComponent(component.id);
    expect(useDesignerStore.getState().parameters.customComponents).toHaveLength(0);
  });

  it("creates and edits a battery compartment from a preset", () => {
    useDesignerStore.setState({
      ...originalState,
      parameters: { ...DEFAULT_PARAMETERS, batteryCompartments: [] },
    });

    useDesignerStore.getState().addBatteryCompartment("18650");
    const compartment =
      useDesignerStore.getState().parameters.batteryCompartments[0];
    useDesignerStore.getState().updateBatteryCompartment(compartment.id, {
      cellCount: 2,
      offsetX: 12,
      face: "top",
      retentionType: "elastic",
      insertionSide: "left",
    });

    expect(useDesignerStore.getState().parameters.batteryCompartments[0]).toEqual(
      expect.objectContaining({
        preset: "18650",
        cellCount: 2,
        offsetX: 12,
        face: "top",
        retentionType: "elastic",
        insertionSide: "left",
      }),
    );
    useDesignerStore.getState().removeBatteryCompartment(compartment.id);
    expect(useDesignerStore.getState().parameters.batteryCompartments).toHaveLength(0);
  });

  it("moves panel-mounted antennas to the enclosure face when deleting a panel", () => {
    const panel = {
      ...DEFAULT_PARAMETERS.panelPlacements[0],
      face: "right" as const,
      offsetU: 7,
      offsetV: -3,
    };
    useDesignerStore.setState({
      ...originalState,
      parameters: {
        ...DEFAULT_PARAMETERS,
        panelPlacements: [panel],
        antennaPlacements: [
          {
            id: "antenna-panel",
            definitionId: "sma-bulkhead-whip",
            surface: "panel",
            panelId: panel.id,
            offsetU: 2,
            offsetV: 4,
            rotation: 0,
            cutoutDiameter: 6.8,
          },
        ],
      },
      selectedPart: "antenna",
      selectedFeatureId: "antenna-panel",
    });

    useDesignerStore.getState().removePanelPlacement(panel.id);

    expect(useDesignerStore.getState().parameters.antennaPlacements[0]).toEqual(
      expect.objectContaining({
        surface: "right",
        panelId: null,
        offsetU: 9,
        offsetV: 1,
      }),
    );
  });
});
