import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../domain/enclosure";
import { useDesignerStore } from "./designerStore";

const originalState = useDesignerStore.getState();

afterEach(() => {
  useDesignerStore.setState(originalState, true);
});

describe("designer store", () => {
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
