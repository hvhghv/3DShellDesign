import { describe, expect, it } from "vitest";
import {
  ANTENNA_DEFINITIONS,
  CONNECTOR_DEFINITIONS,
  FASTENER_DEFINITIONS,
  FPC_CONNECTOR_DEFINITIONS,
  LCDWIKI_DISPLAY_DEFINITIONS,
  MEMBRANE_SWITCH_DEFINITIONS,
  METAL_POWER_BUTTON_DEFINITIONS,
  OLED_DISPLAY_DEFINITIONS,
  TERMINAL_CONNECTOR_DEFINITIONS,
  WIRED_LED_INDICATOR_DEFINITIONS,
  getAntennaDefinition,
  getConnectorDefinition,
  getFastenerDefinition,
  hasThroughPanelCutout,
} from "./components";

describe("component library", () => {
  it("contains unique, manufacturing-complete connector definitions", () => {
    expect(new Set(CONNECTOR_DEFINITIONS.map((item) => item.id)).size).toBe(
      CONNECTOR_DEFINITIONS.length,
    );
    expect(CONNECTOR_DEFINITIONS.map((item) => item.category)).toEqual(
      expect.arrayContaining([
        "usb",
        "power",
        "network",
        "terminal",
        "fpc",
        "display",
        "keypad",
        "switch",
        "indicator",
      ]),
    );
    for (const definition of CONNECTOR_DEFINITIONS) {
      expect(definition.panelCutout.width).toBeGreaterThan(0);
      expect(definition.panelCutout.height).toBeGreaterThan(0);
      expect(definition.keepoutVolumes.length).toBeGreaterThan(0);
      expect(definition.metadata.bomName).not.toBe("");
    }
  });

  it("provides common terminal pitches and position counts", () => {
    expect(TERMINAL_CONNECTOR_DEFINITIONS).toHaveLength(12);
    for (const pitch of [1, 1.25, 2.54, 5.08]) {
      for (const positions of [2, 4, 5]) {
        expect(
          TERMINAL_CONNECTOR_DEFINITIONS.find(
            (definition) =>
              definition.terminalSpec?.pitch === pitch &&
              definition.terminalSpec.positions === positions,
          ),
        ).toEqual(
          expect.objectContaining({
            category: "terminal",
            panelCutout: expect.objectContaining({
              width: expect.any(Number),
              height: expect.any(Number),
            }),
          }),
        );
      }
    }
  });

  it("provides 5P through 40P FPC connectors at common pitches", () => {
    expect(FPC_CONNECTOR_DEFINITIONS).toHaveLength(72);
    for (const pitch of [0.5, 1]) {
      for (let positions = 5; positions <= 40; positions += 1) {
        expect(
          FPC_CONNECTOR_DEFINITIONS.find(
            (definition) =>
              definition.terminalSpec?.pitch === pitch &&
              definition.terminalSpec.positions === positions,
          ),
        ).toEqual(
          expect.objectContaining({
            category: "fpc",
            panelCutout: expect.objectContaining({
              width: expect.any(Number),
              height: expect.any(Number),
            }),
          }),
        );
      }
    }
    expect(getConnectorDefinition("fpc-20p-05").panelCutout.width).toBe(14.7);
    expect(getConnectorDefinition("fpc-20p-05").panelCutout.height).toBeCloseTo(3.4);
  });

  it("provides LCDWIKI SPI display modules from the download archive", () => {
    expect(LCDWIKI_DISPLAY_DEFINITIONS).toHaveLength(7);
    expect(LCDWIKI_DISPLAY_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "lcdwiki-msp2202",
      "lcdwiki-msp2402",
      "lcdwiki-msp2806",
      "lcdwiki-msp2807",
      "lcdwiki-msp3218",
      "lcdwiki-msp3520",
      "lcdwiki-msp4021",
    ]);
    expect(
      LCDWIKI_DISPLAY_DEFINITIONS.map(
        (definition) => definition.displaySpec?.source,
      ),
    ).toEqual(Array(7).fill("LCDWIKI"));
    expect(getConnectorDefinition("lcdwiki-msp4021")).toEqual(
      expect.objectContaining({
        category: "display",
        panelCutout: expect.objectContaining({
          width: 57.88,
          height: 86.22,
        }),
        displaySpec: expect.objectContaining({
          driveIc: "ST7796S",
          touch: "resistive",
        }),
      }),
    );
  });

  it("provides generic OLED display devices from screenshot specs", () => {
    expect(OLED_DISPLAY_DEFINITIONS).toHaveLength(2);
    expect(OLED_DISPLAY_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "generic-oled-091-128x32-module-4p",
      "generic-oled-091-128x32-bare-solder-14p",
    ]);
    expect(
      OLED_DISPLAY_DEFINITIONS.map(
        (definition) => definition.displaySpec?.source,
      ),
    ).toEqual(Array(2).fill("catalog-screenshot"));
    expect(getConnectorDefinition("generic-oled-091-128x32-module-4p")).toEqual(
      expect.objectContaining({
        category: "display",
        panelCutout: expect.objectContaining({
          width: 25.08,
          height: 8.28,
        }),
        displaySpec: expect.objectContaining({
          packageStyle: "oled-module",
          connectorStyle: "side-pads",
          interfaceMode: "I2C",
          pcbWidth: 38,
          pcbHeight: 12,
          panelWidth: 30,
          panelHeight: 11.5,
          activeAreaWidth: 22.38,
          activeAreaHeight: 5.58,
          headerPins: 4,
        }),
      }),
    );
    expect(getConnectorDefinition("generic-oled-091-128x32-bare-solder-14p")).toEqual(
      expect.objectContaining({
        category: "display",
        displaySpec: expect.objectContaining({
          packageStyle: "bare-oled",
          connectorStyle: "fpc-solder",
          pcbWidth: 30,
          pcbHeight: 11.5,
          fpcWidth: 9,
          fpcTailLength: 10.54,
          headerPins: 14,
        }),
      }),
    );
  });

  it("provides panel controls and indicators from screenshot specs", () => {
    expect(MEMBRANE_SWITCH_DEFINITIONS).toHaveLength(4);
    expect(MEMBRANE_SWITCH_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "membrane-switch-1key",
      "membrane-switch-2key",
      "membrane-switch-3key",
      "membrane-switch-4key",
    ]);
    expect(getConnectorDefinition("membrane-switch-1key")).toEqual(
      expect.objectContaining({
        category: "keypad",
        panelCutout: expect.objectContaining({
          width: 20,
          height: 23,
          mode: "surface",
        }),
      }),
    );
    expect(
      hasThroughPanelCutout(getConnectorDefinition("membrane-switch-1key")),
    ).toBe(false);

    expect(METAL_POWER_BUTTON_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "metal-power-button-12mm",
      "metal-power-button-16mm",
      "metal-power-button-19mm",
      "metal-power-button-22mm",
    ]);
    expect(
      METAL_POWER_BUTTON_DEFINITIONS.map(
        (definition) => definition.panelCutout.width,
      ),
    ).toEqual([12.4, 16.4, 19.4, 22.4]);

    expect(WIRED_LED_INDICATOR_DEFINITIONS.map((definition) => definition.id)).toEqual([
      "wired-metal-led-3mm",
      "wired-metal-led-5mm",
    ]);
    expect(
      WIRED_LED_INDICATOR_DEFINITIONS.map(
        (definition) => definition.panelCutout.width,
      ),
    ).toEqual([6.3, 8.3]);
    expect(
      hasThroughPanelCutout(getConnectorDefinition("wired-metal-led-3mm")),
    ).toBe(true);
  });

  it("provides screw, heat-set insert and hex nut closure recipes", () => {
    expect(FASTENER_DEFINITIONS.map((item) => item.baseRecess)).toEqual(
      expect.arrayContaining(["pilot", "heat-set", "hex-nut"]),
    );
    expect(getFastenerDefinition("m3-heat-set").recessDepth).toBe(5);
    expect(getConnectorDefinition("dc-5521-jack").panelCutout.shape).toBe("circle");
  });

  it("provides external and internal antenna recipes with RF keepouts", () => {
    expect(new Set(ANTENNA_DEFINITIONS.map((item) => item.id)).size).toBe(
      ANTENNA_DEFINITIONS.length,
    );
    expect(ANTENNA_DEFINITIONS.map((item) => item.placement)).toEqual(
      expect.arrayContaining(["rear-bulkhead", "inner-rear-wall", "pcb-rear-edge"]),
    );
    for (const definition of ANTENNA_DEFINITIONS) {
      expect(definition.keepoutVolume.width).toBeGreaterThan(definition.visualGeometry.width);
      expect(definition.metadata.frequencyBand).not.toBe("");
      expect(definition.metadata.bomName).not.toBe("");
    }
    expect(getAntennaDefinition("sma-bulkhead-whip").enclosureCutout?.diameter).toBe(6.8);
    expect(getAntennaDefinition("pcb-edge-antenna").enclosureCutout).toBeNull();
  });
});
