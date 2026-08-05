import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../domain/enclosure";
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
    expect(state.parameters.pcbLength).toBe(60);
    expect(state.parameters.pcbReferences[1]).toEqual(
      expect.objectContaining({ elevation: 5, offsetX: 0 }),
    );
    expect(state.selectedFeatureId).toBe(state.parameters.pcbReferences[1].id);
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
    });

    expect(useDesignerStore.getState().parameters.batteryCompartments[0]).toEqual(
      expect.objectContaining({
        preset: "18650",
        cellCount: 2,
        offsetX: 12,
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
