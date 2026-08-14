export type CutoutShape = "rounded-rectangle" | "circle";
export type ConnectorCategory =
  | "usb"
  | "power"
  | "network"
  | "terminal"
  | "fpc"
  | "display"
  | "keypad"
  | "switch"
  | "indicator";
export type PanelCutoutMode = "through" | "surface";

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: ConnectorCategory;
  visualGeometry: {
    shape: CutoutShape;
    width: number;
    height: number;
    depth: number;
    color: string;
  };
  panelCutout: {
    shape: CutoutShape;
    width: number;
    height: number;
    cornerRadius: number;
    mode?: PanelCutoutMode;
  };
  boardAlignment: {
    heightAboveBoardCenter: number;
  };
  keepoutVolumes: Array<{
    role: "plug" | "wiring" | "tool";
    width: number;
    height: number;
    depth: number;
  }>;
  toleranceRules: {
    xyClearance: number;
    description: string;
  };
  metadata: {
    bomName: string;
    notes: string;
  };
  terminalSpec?: {
    pitch: number;
    positions: number;
  };
  displaySpec?: {
    source: "LCDWIKI" | "catalog-screenshot";
    diagonalInch: number;
    moduleSku: string;
    drawingSku: string;
    resolution: string;
    driveIc: string;
    interfaceMode?: string;
    panelKind?: "tft" | "oled";
    packageStyle?: "pcb-module" | "oled-module" | "bare-oled";
    connectorStyle?: "pin-header" | "side-pads" | "fpc-solder";
    touch: "none" | "resistive";
    pcbWidth: number;
    pcbHeight: number;
    panelWidth?: number;
    panelHeight?: number;
    windowWidth: number;
    windowHeight: number;
    activeAreaWidth: number;
    activeAreaHeight: number;
    displayOffsetU?: number;
    displayOffsetV?: number;
    totalThicknessWithoutHeader: number;
    totalThicknessWithHeader: number;
    headerPins: number;
    fpcWidth?: number;
    fpcTailLength?: number;
    activeColor?: string;
    hasMountingHoles?: boolean;
    sourceDrawing: string;
  };
}

export function hasThroughPanelCutout(
  definition: Pick<ConnectorDefinition, "panelCutout">,
): boolean {
  return definition.panelCutout.mode !== "surface";
}

export function supportsDisplayScrewMounting(
  definition: Pick<ConnectorDefinition, "displaySpec">,
): boolean {
  return Boolean(
    definition.displaySpec && definition.displaySpec.hasMountingHoles !== false,
  );
}

export type AntennaPlacement = "rear-bulkhead" | "inner-rear-wall" | "pcb-rear-edge";

export interface AntennaDefinition {
  id: string;
  name: string;
  placement: AntennaPlacement;
  visualGeometry: {
    width: number;
    height: number;
    depth: number;
    color: string;
    radiatorLength?: number;
    radiatorDiameter?: number;
  };
  enclosureCutout: {
    diameter: number;
    description: string;
  } | null;
  heightAboveBoardCenter: number;
  keepoutVolume: {
    width: number;
    height: number;
    depth: number;
  };
  metadata: {
    bomName: string;
    frequencyBand: string;
    notes: string;
  };
}

export type FastenerRecess = "pilot" | "heat-set" | "hex-nut";

export interface FastenerDefinition {
  id: string;
  name: string;
  thread: string;
  clearanceDiameter: number;
  bossDiameter: number;
  baseRecess: FastenerRecess;
  recessDiameter: number;
  recessDepth: number | null;
  metadata: {
    bomName: string;
    notes: string;
  };
}

interface TerminalFamily {
  id: string;
  pitch: number;
  height: number;
  depth: number;
  housingExtra: number;
  color: string;
  screwOperated: boolean;
}

const TERMINAL_FAMILIES: TerminalFamily[] = [
  {
    id: "100",
    pitch: 1,
    height: 3.2,
    depth: 5,
    housingExtra: 2.4,
    color: "#eee9dc",
    screwOperated: false,
  },
  {
    id: "125",
    pitch: 1.25,
    height: 4,
    depth: 6,
    housingExtra: 3,
    color: "#e9e4d8",
    screwOperated: false,
  },
  {
    id: "254",
    pitch: 2.54,
    height: 6,
    depth: 8,
    housingExtra: 4,
    color: "#d7d3c8",
    screwOperated: false,
  },
  {
    id: "508",
    pitch: 5.08,
    height: 8.2,
    depth: 10,
    housingExtra: 5.4,
    color: "#397b4a",
    screwOperated: true,
  },
];

const TERMINAL_POSITIONS = [2, 4, 5] as const;

function formatPitch(pitch: number): string {
  return pitch === 1 ? "1.0" : pitch.toFixed(2);
}

function createTerminalDefinition(
  family: TerminalFamily,
  positions: (typeof TERMINAL_POSITIONS)[number],
): ConnectorDefinition {
  const width = family.pitch * (positions - 1) + family.housingExtra;
  const pitchLabel = formatPitch(family.pitch);
  const connectorLabel = family.screwOperated ? "接线端子" : "线对板端子";
  const operationLabel = family.screwOperated ? "螺丝刀与导线" : "线束插拔";
  return {
    id: `terminal-${family.id}-${positions}p`,
    name: `${pitchLabel} mm ${positions}P ${connectorLabel}`,
    category: "terminal",
    visualGeometry: {
      shape: "rounded-rectangle",
      width,
      height: family.height,
      depth: family.depth,
      color: family.color,
    },
    panelCutout: {
      shape: "rounded-rectangle",
      width: width + 1.2,
      height: family.height + 1.3,
      cornerRadius: 0.8,
    },
    boardAlignment: { heightAboveBoardCenter: family.height / 2 + 0.8 },
    keepoutVolumes: [
      {
        role: family.screwOperated ? "tool" : "wiring",
        width: width + 5,
        height: family.height + 7,
        depth: family.depth + 22,
      },
    ],
    toleranceRules: {
      xyClearance: family.screwOperated ? 0.45 : 0.3,
      description: `通用 ${pitchLabel} mm ${positions}P 包络，已预留${operationLabel}空间`,
    },
    metadata: {
      bomName: `${pitchLabel} mm ${positions}-pin ${family.screwOperated ? "screw terminal" : "wire-to-board terminal"}`,
      notes: `不同厂商的塑壳、锁扣和进线方向存在差异，需按具体 ${pitchLabel} mm ${positions}P 器件图纸复核。`,
    },
    terminalSpec: { pitch: family.pitch, positions },
  };
}

export const TERMINAL_CONNECTOR_DEFINITIONS: ConnectorDefinition[] =
  TERMINAL_FAMILIES.flatMap((family) =>
    TERMINAL_POSITIONS.map((positions) =>
      createTerminalDefinition(family, positions),
    ),
  );

interface FpcFamily {
  id: "05" | "10";
  pitch: number;
  height: number;
  depth: number;
  housingExtra: number;
}

const FPC_FAMILIES: readonly FpcFamily[] = [
  { id: "05", pitch: 0.5, height: 2.2, depth: 5.5, housingExtra: 4 },
  { id: "10", pitch: 1, height: 3, depth: 6.5, housingExtra: 4.5 },
];

const FPC_POSITIONS = Array.from({ length: 36 }, (_, index) => index + 5);

function createFpcDefinition(
  family: FpcFamily,
  positions: number,
): ConnectorDefinition {
  const pitchLabel = family.pitch.toFixed(1);
  const width = family.pitch * (positions - 1) + family.housingExtra;
  const openingWidth = width + 1.2;
  const openingHeight = family.height + 1.2;
  return {
    id: `fpc-${positions}p-${family.id}`,
    name: `${pitchLabel} mm ${positions}P FPC 端子`,
    category: "fpc",
    visualGeometry: {
      shape: "rounded-rectangle",
      width,
      height: family.height,
      depth: family.depth,
      color: "#d7c7a4",
    },
    panelCutout: {
      shape: "rounded-rectangle",
      width: openingWidth,
      height: openingHeight,
      cornerRadius: Math.min(0.8, Math.min(openingWidth, openingHeight) / 4),
    },
    boardAlignment: { heightAboveBoardCenter: family.height / 2 + 0.4 },
    keepoutVolumes: [
      {
        role: "wiring",
        width: width + 6,
        height: family.height + 5,
        depth: 30,
      },
    ],
    toleranceRules: {
      xyClearance: 0.3,
      description: `${pitchLabel} mm ${positions}P FPC 仅表示器件包络与排线出口`,
    },
    metadata: {
      bomName: `${pitchLabel} mm ${positions}-pin FPC connector`,
      notes: "FPC 端子高度、锁扣方向和补强板厚度需按具体器件图纸复核。",
    },
    terminalSpec: { pitch: family.pitch, positions },
  };
}

export const FPC_CONNECTOR_DEFINITIONS: ConnectorDefinition[] =
  FPC_FAMILIES.flatMap((family) =>
    FPC_POSITIONS.map((positions) => createFpcDefinition(family, positions)),
  );

interface LcdwikiDisplaySpec {
  id: string;
  diagonalInch: number;
  moduleSku: string;
  drawingSku: string;
  resolution: "240x320" | "320x480";
  driveIc: "ILI9341V" | "ILI9488" | "ST7796S";
  touch: "none" | "resistive";
  pcbWidth: number;
  pcbHeight: number;
  windowWidth: number;
  windowHeight: number;
  activeAreaWidth: number;
  activeAreaHeight: number;
  totalThicknessWithoutHeader: number;
  totalThicknessWithHeader: number;
  headerPins: number;
  sourceDrawing: string;
}

const LCDWIKI_DISPLAY_SPECS: readonly LcdwikiDisplaySpec[] = [
  {
    id: "lcdwiki-msp2202",
    diagonalInch: 2.2,
    moduleSku: "MSP2202",
    drawingSku: "MSP2202",
    resolution: "240x320",
    driveIc: "ILI9341V",
    touch: "none",
    pcbWidth: 40.1,
    pcbHeight: 67.2,
    windowWidth: 33.84,
    windowHeight: 45.12,
    activeAreaWidth: 33.84,
    activeAreaHeight: 45.12,
    totalThicknessWithoutHeader: 4.45,
    totalThicknessWithHeader: 12.83,
    headerPins: 9,
    sourceDrawing: "lcdwiki_downloads/2.2inch_MSP2202/MSP2202_Size.pdf",
  },
  {
    id: "lcdwiki-msp2402",
    diagonalInch: 2.4,
    moduleSku: "MSP2402",
    drawingSku: "MSP2401",
    resolution: "240x320",
    driveIc: "ILI9341V",
    touch: "none",
    pcbWidth: 42.72,
    pcbHeight: 77.18,
    windowWidth: 36.72,
    windowHeight: 48.96,
    activeAreaWidth: 36.72,
    activeAreaHeight: 48.96,
    totalThicknessWithoutHeader: 4.3,
    totalThicknessWithHeader: 12.68,
    headerPins: 14,
    sourceDrawing: "lcdwiki_downloads/2.4inch_MSP2402/MSP2401_Size.pdf",
  },
  {
    id: "lcdwiki-msp2806",
    diagonalInch: 2.8,
    moduleSku: "MSP2806",
    drawingSku: "MSP2806",
    resolution: "240x320",
    driveIc: "ILI9341V",
    touch: "none",
    pcbWidth: 50,
    pcbHeight: 86,
    windowWidth: 43.2,
    windowHeight: 57.6,
    activeAreaWidth: 43.2,
    activeAreaHeight: 57.6,
    totalThicknessWithoutHeader: 4.4,
    totalThicknessWithHeader: 12.78,
    headerPins: 14,
    sourceDrawing: "lcdwiki_downloads/2.8inch_MSP2807/MSP2806_Size.pdf",
  },
  {
    id: "lcdwiki-msp2807",
    diagonalInch: 2.8,
    moduleSku: "MSP2807",
    drawingSku: "MSP2807",
    resolution: "240x320",
    driveIc: "ILI9341V",
    touch: "resistive",
    pcbWidth: 50,
    pcbHeight: 86,
    windowWidth: 45.2,
    windowHeight: 66.2,
    activeAreaWidth: 43.2,
    activeAreaHeight: 57.6,
    totalThicknessWithoutHeader: 5.6,
    totalThicknessWithHeader: 12.78,
    headerPins: 14,
    sourceDrawing: "lcdwiki_downloads/2.8inch_MSP2807/MSP2807_Size.pdf",
  },
  {
    id: "lcdwiki-msp3218",
    diagonalInch: 3.2,
    moduleSku: "MSP3218",
    drawingSku: "MSP3217",
    resolution: "240x320",
    driveIc: "ILI9341V",
    touch: "none",
    pcbWidth: 55.04,
    pcbHeight: 89.3,
    windowWidth: 48.6,
    windowHeight: 64.8,
    activeAreaWidth: 48.6,
    activeAreaHeight: 64.8,
    totalThicknessWithoutHeader: 4.5,
    totalThicknessWithHeader: 12.88,
    headerPins: 14,
    sourceDrawing: "lcdwiki_downloads/3.2inch_MSP3218/MSP3217_Size.pdf",
  },
  {
    id: "lcdwiki-msp3520",
    diagonalInch: 3.5,
    moduleSku: "MSP3520",
    drawingSku: "MSP3520",
    resolution: "320x480",
    driveIc: "ILI9488",
    touch: "resistive",
    pcbWidth: 56.34,
    pcbHeight: 98,
    windowWidth: 50.56,
    windowHeight: 77.84,
    activeAreaWidth: 48.96,
    activeAreaHeight: 73.44,
    totalThicknessWithoutHeader: 5.8,
    totalThicknessWithHeader: 14.18,
    headerPins: 14,
    sourceDrawing: "lcdwiki_downloads/3.5inch_MSP3520/MSP3520_Size.pdf",
  },
  {
    id: "lcdwiki-msp4021",
    diagonalInch: 4,
    moduleSku: "MSP4021",
    drawingSku: "MSP4021",
    resolution: "320x480",
    driveIc: "ST7796S",
    touch: "resistive",
    pcbWidth: 61.74,
    pcbHeight: 108.04,
    windowWidth: 56.88,
    windowHeight: 85.22,
    activeAreaWidth: 55.68,
    activeAreaHeight: 83.52,
    totalThicknessWithoutHeader: 5.65,
    totalThicknessWithHeader: 14,
    headerPins: 14,
    sourceDrawing: "lcdwiki_downloads/4.0inch_ST7796/MSP4021_Size.pdf",
  },
];

function createLcdwikiDisplayDefinition(spec: LcdwikiDisplaySpec): ConnectorDefinition {
  const windowClearance = spec.touch === "resistive" ? 1 : 0.8;
  const cutoutWidth = Number((spec.windowWidth + windowClearance).toFixed(2));
  const cutoutHeight = Number((spec.windowHeight + windowClearance).toFixed(2));
  const touchLabel = spec.touch === "resistive" ? "电阻触摸" : "无触摸";
  return {
    id: spec.id,
    name: `LCDWIKI ${spec.diagonalInch.toFixed(1)}寸 SPI 屏 ${spec.moduleSku}`,
    category: "display",
    visualGeometry: {
      shape: "rounded-rectangle",
      width: spec.pcbWidth,
      height: spec.pcbHeight,
      depth: spec.totalThicknessWithoutHeader,
      color: "#1f3434",
    },
    panelCutout: {
      shape: "rounded-rectangle",
      width: cutoutWidth,
      height: cutoutHeight,
      cornerRadius: 0.9,
    },
    boardAlignment: {
      heightAboveBoardCenter: spec.totalThicknessWithoutHeader / 2,
    },
    keepoutVolumes: [
      {
        role: "wiring",
        width: spec.pcbWidth + 6,
        height: spec.pcbHeight + 6,
        depth: Math.max(24, spec.totalThicknessWithHeader + 8),
      },
    ],
    toleranceRules: {
      xyClearance: windowClearance / 2,
      description: `${spec.diagonalInch.toFixed(1)}寸 LCDWIKI SPI 屏窗口；开窗按 ${spec.windowWidth.toFixed(2)} x ${spec.windowHeight.toFixed(2)} mm 视区加余量`,
    },
    metadata: {
      bomName: `LCDWIKI ${spec.diagonalInch.toFixed(1)} inch SPI TFT module ${spec.moduleSku}`,
      notes: `${touchLabel}；${spec.resolution.replace("x", "*RGB*")}；驱动 ${spec.driveIc}；PCB ${spec.pcbWidth.toFixed(2)} x ${spec.pcbHeight.toFixed(2)} mm；AA ${spec.activeAreaWidth.toFixed(2)} x ${spec.activeAreaHeight.toFixed(2)} mm；尺寸来源 ${spec.sourceDrawing}。`,
    },
    displaySpec: {
      source: "LCDWIKI",
      diagonalInch: spec.diagonalInch,
      moduleSku: spec.moduleSku,
      drawingSku: spec.drawingSku,
      resolution: spec.resolution,
      driveIc: spec.driveIc,
      interfaceMode: "SPI",
      panelKind: "tft",
      packageStyle: "pcb-module",
      connectorStyle: "pin-header",
      touch: spec.touch,
      pcbWidth: spec.pcbWidth,
      pcbHeight: spec.pcbHeight,
      windowWidth: spec.windowWidth,
      windowHeight: spec.windowHeight,
      activeAreaWidth: spec.activeAreaWidth,
      activeAreaHeight: spec.activeAreaHeight,
      totalThicknessWithoutHeader: spec.totalThicknessWithoutHeader,
      totalThicknessWithHeader: spec.totalThicknessWithHeader,
      headerPins: spec.headerPins,
      hasMountingHoles: true,
      sourceDrawing: spec.sourceDrawing,
    },
  };
}

export const LCDWIKI_DISPLAY_DEFINITIONS: ConnectorDefinition[] =
  LCDWIKI_DISPLAY_SPECS.map((spec) => createLcdwikiDisplayDefinition(spec));

interface OledDisplaySpec {
  id: string;
  name: string;
  diagonalInch: number;
  moduleSku: string;
  drawingSku: string;
  resolution: string;
  driveIc: string;
  interfaceMode: string;
  packageStyle: "oled-module" | "bare-oled";
  connectorStyle: "side-pads" | "fpc-solder";
  pcbWidth: number;
  pcbHeight: number;
  panelWidth: number;
  panelHeight: number;
  windowWidth: number;
  windowHeight: number;
  activeAreaWidth: number;
  activeAreaHeight: number;
  displayOffsetU: number;
  displayOffsetV: number;
  totalThicknessWithoutHeader: number;
  totalThicknessWithHeader: number;
  headerPins: number;
  fpcWidth?: number;
  fpcTailLength?: number;
  activeColor: string;
  sourceDrawing: string;
  notes: string;
}

const OLED_DISPLAY_SPECS: readonly OledDisplaySpec[] = [
  {
    id: "generic-oled-091-128x32-module-4p",
    name: "0.91寸 OLED 显示模块 128×32 4Pin",
    diagonalInch: 0.91,
    moduleSku: "OLED-091-MOD-4P",
    drawingSku: "0.91-12832-4P",
    resolution: "128x32",
    driveIc: "SSD1306",
    interfaceMode: "I2C",
    packageStyle: "oled-module",
    connectorStyle: "side-pads",
    pcbWidth: 38,
    pcbHeight: 12,
    panelWidth: 30,
    panelHeight: 11.5,
    windowWidth: 24.38,
    windowHeight: 7.58,
    activeAreaWidth: 22.38,
    activeAreaHeight: 5.58,
    displayOffsetU: 3.6,
    displayOffsetV: 0,
    totalThicknessWithoutHeader: 2.95,
    totalThicknessWithHeader: 2.95,
    headerPins: 4,
    activeColor: "#f0d34a",
    sourceDrawing: "截图规格标注：0.91 OLED 128×32 模块 4Pin",
    notes:
      "截图规格标注 PCB 38.00 × 12.00 mm、面板 30.00 × 11.50 mm、AA 22.38 × 5.58 mm、总厚 2.95 mm max；4Pin 焊盘在模块短边，具体针序和焊盘位置需按实物复核。",
  },
  {
    id: "generic-oled-091-128x32-bare-solder-14p",
    name: "0.91寸 OLED 裸屏 128×32 焊接 14Pin",
    diagonalInch: 0.91,
    moduleSku: "OLED-091-BARE-14P",
    drawingSku: "0.91-12832-SOLDER-14P",
    resolution: "128x32",
    driveIc: "SSD1306",
    interfaceMode: "I2C",
    packageStyle: "bare-oled",
    connectorStyle: "fpc-solder",
    pcbWidth: 30,
    pcbHeight: 11.5,
    panelWidth: 30,
    panelHeight: 11.5,
    windowWidth: 24.38,
    windowHeight: 7.58,
    activeAreaWidth: 22.38,
    activeAreaHeight: 5.58,
    displayOffsetU: 0,
    displayOffsetV: 0,
    totalThicknessWithoutHeader: 1.45,
    totalThicknessWithHeader: 1.45,
    headerPins: 14,
    fpcWidth: 9,
    fpcTailLength: 10.54,
    activeColor: "#f0d34a",
    sourceDrawing: "截图规格标注：0.91 OLED 128×32 焊接 14Pin",
    notes:
      "截图规格标注面板 30.00 × 11.50 mm、VA 24.38 × 7.58 mm、AA 22.38 × 5.58 mm、焊接排线 14Pin；柔性排线与补强片轮廓需按实物装配方向复核。",
  },
];

function createOledDisplayDefinition(spec: OledDisplaySpec): ConnectorDefinition {
  const cutoutWidth = Number((spec.windowWidth + 0.7).toFixed(2));
  const cutoutHeight = Number((spec.windowHeight + 0.7).toFixed(2));
  const packageLabel =
    spec.packageStyle === "bare-oled" ? "裸屏焊接" : "模块焊盘";
  return {
    id: spec.id,
    name: spec.name,
    category: "display",
    visualGeometry: {
      shape: "rounded-rectangle",
      width: spec.pcbWidth,
      height: spec.pcbHeight,
      depth: spec.totalThicknessWithoutHeader,
      color: spec.packageStyle === "bare-oled" ? "#111615" : "#155c78",
    },
    panelCutout: {
      shape: "rounded-rectangle",
      width: cutoutWidth,
      height: cutoutHeight,
      cornerRadius: 0.45,
    },
    boardAlignment: {
      heightAboveBoardCenter: spec.totalThicknessWithoutHeader / 2,
    },
    keepoutVolumes: [
      {
        role: "wiring",
        width: spec.pcbWidth + (spec.fpcTailLength ?? 0) + 6,
        height: Math.max(spec.pcbHeight, spec.fpcWidth ?? 0) + 6,
        depth: Math.max(18, spec.totalThicknessWithHeader + 10),
      },
    ],
    toleranceRules: {
      xyClearance: 0.35,
      description: `0.91寸 OLED ${packageLabel}窗口，开窗按 VA ${spec.windowWidth.toFixed(2)} × ${spec.windowHeight.toFixed(2)} mm 加余量`,
    },
    metadata: {
      bomName: `${spec.diagonalInch.toFixed(2)} inch OLED display ${spec.resolution} ${spec.connectorStyle}`,
      notes: spec.notes,
    },
    displaySpec: {
      source: "catalog-screenshot",
      diagonalInch: spec.diagonalInch,
      moduleSku: spec.moduleSku,
      drawingSku: spec.drawingSku,
      resolution: spec.resolution,
      driveIc: spec.driveIc,
      interfaceMode: spec.interfaceMode,
      panelKind: "oled",
      packageStyle: spec.packageStyle,
      connectorStyle: spec.connectorStyle,
      touch: "none",
      pcbWidth: spec.pcbWidth,
      pcbHeight: spec.pcbHeight,
      panelWidth: spec.panelWidth,
      panelHeight: spec.panelHeight,
      windowWidth: spec.windowWidth,
      windowHeight: spec.windowHeight,
      activeAreaWidth: spec.activeAreaWidth,
      activeAreaHeight: spec.activeAreaHeight,
      displayOffsetU: spec.displayOffsetU,
      displayOffsetV: spec.displayOffsetV,
      totalThicknessWithoutHeader: spec.totalThicknessWithoutHeader,
      totalThicknessWithHeader: spec.totalThicknessWithHeader,
      headerPins: spec.headerPins,
      fpcWidth: spec.fpcWidth,
      fpcTailLength: spec.fpcTailLength,
      activeColor: spec.activeColor,
      hasMountingHoles: false,
      sourceDrawing: spec.sourceDrawing,
    },
  };
}

export const OLED_DISPLAY_DEFINITIONS: ConnectorDefinition[] =
  OLED_DISPLAY_SPECS.map((spec) => createOledDisplayDefinition(spec));

interface MembraneSwitchSpec {
  keys: 1 | 2 | 3 | 4;
  model: string;
  width: number;
  height: number;
  thickness: number;
}

const MEMBRANE_SWITCH_SPECS: readonly MembraneSwitchSpec[] = [
  { keys: 1, model: "MGG01A", width: 20, height: 23, thickness: 1 },
  { keys: 2, model: "MGG01F", width: 40, height: 20, thickness: 0.8 },
  { keys: 3, model: "MGG01Y", width: 57, height: 20, thickness: 0.8 },
  { keys: 4, model: "MGG192B", width: 76, height: 20, thickness: 0.8 },
];

function createMembraneSwitchDefinition(
  spec: MembraneSwitchSpec,
): ConnectorDefinition {
  return {
    id: `membrane-switch-${spec.keys}key`,
    name: `${spec.keys}键薄膜开关 ${spec.model}`,
    category: "keypad",
    visualGeometry: {
      shape: "rounded-rectangle",
      width: spec.width,
      height: spec.height,
      depth: spec.thickness,
      color: "#222629",
    },
    panelCutout: {
      shape: "rounded-rectangle",
      width: spec.width,
      height: spec.height,
      cornerRadius: 2.2,
      mode: "surface",
    },
    boardAlignment: { heightAboveBoardCenter: spec.thickness / 2 },
    keepoutVolumes: [
      {
        role: "wiring",
        width: spec.width + 8,
        height: spec.height + 8,
        depth: 18,
      },
    ],
    toleranceRules: {
      xyClearance: 0.15,
      description: "薄膜开关为表面贴装足迹，不生成整块穿板开孔",
    },
    metadata: {
      bomName: `${spec.keys}-key membrane switch ${spec.model}`,
      notes:
        "截图规格标注 1/2/3/4 键、多色可选、PC 砂面、背胶、PET 透明尾带、2.54 方孔带保护套、排线约 90 mm；双键等线路定义需按实物和器件图纸复核。",
    },
  };
}

export const MEMBRANE_SWITCH_DEFINITIONS: ConnectorDefinition[] =
  MEMBRANE_SWITCH_SPECS.map((spec) => createMembraneSwitchDefinition(spec));

interface MetalPowerButtonSpec {
  holeDiameter: 12 | 16 | 19 | 22;
  bodyDepth: number;
}

const METAL_POWER_BUTTON_SPECS: readonly MetalPowerButtonSpec[] = [
  { holeDiameter: 12, bodyDepth: 24 },
  { holeDiameter: 16, bodyDepth: 28 },
  { holeDiameter: 19, bodyDepth: 31 },
  { holeDiameter: 22, bodyDepth: 34 },
];

function createMetalPowerButtonDefinition(
  spec: MetalPowerButtonSpec,
): ConnectorDefinition {
  const cutout = spec.holeDiameter + 0.4;
  const bezel = spec.holeDiameter + 3.2;
  return {
    id: `metal-power-button-${spec.holeDiameter}mm`,
    name: `${spec.holeDiameter} mm 金属带灯开机按钮`,
    category: "switch",
    visualGeometry: {
      shape: "circle",
      width: bezel,
      height: bezel,
      depth: spec.bodyDepth,
      color: "#c5c9c6",
    },
    panelCutout: {
      shape: "circle",
      width: cutout,
      height: cutout,
      cornerRadius: cutout / 2,
    },
    boardAlignment: { heightAboveBoardCenter: bezel / 2 },
    keepoutVolumes: [
      {
        role: "wiring",
        width: spec.holeDiameter + 12,
        height: spec.holeDiameter + 12,
        depth: spec.bodyDepth + 35,
      },
    ],
    toleranceRules: {
      xyClearance: 0.2,
      description: `按 ${spec.holeDiameter} mm 面板开孔加 0.4 mm 装配余量`,
    },
    metadata: {
      bomName: `${spec.holeDiameter} mm illuminated metal PC power switch`,
      notes:
        "截图规格标注电脑金属按钮开关、IP66、红/黄/蓝/绿/白灯色可选、铜镀镍或可定制氧化黑、线长约 50 mm、灯珠寿命约 40000 小时；端子接线和实际螺纹长度需按所选规格复核。",
    },
  };
}

export const METAL_POWER_BUTTON_DEFINITIONS: ConnectorDefinition[] =
  METAL_POWER_BUTTON_SPECS.map((spec) =>
    createMetalPowerButtonDefinition(spec),
  );

interface WiredLedIndicatorSpec {
  ledDiameter: 3 | 5;
  panelHole: 6 | 8;
  bodyDepth: number;
}

const WIRED_LED_INDICATOR_SPECS: readonly WiredLedIndicatorSpec[] = [
  { ledDiameter: 3, panelHole: 6, bodyDepth: 11 },
  { ledDiameter: 5, panelHole: 8, bodyDepth: 13 },
];

function createWiredLedIndicatorDefinition(
  spec: WiredLedIndicatorSpec,
): ConnectorDefinition {
  const cutout = spec.panelHole + 0.3;
  const bezel = spec.panelHole + 1.5;
  return {
    id: `wired-metal-led-${spec.ledDiameter}mm`,
    name: `${spec.ledDiameter} mm 金属 LED 指示灯（带线）`,
    category: "indicator",
    visualGeometry: {
      shape: "circle",
      width: bezel,
      height: bezel,
      depth: spec.bodyDepth,
      color: "#bcc4c1",
    },
    panelCutout: {
      shape: "circle",
      width: cutout,
      height: cutout,
      cornerRadius: cutout / 2,
    },
    boardAlignment: { heightAboveBoardCenter: bezel / 2 },
    keepoutVolumes: [
      {
        role: "wiring",
        width: spec.panelHole + 10,
        height: spec.panelHole + 10,
        depth: 230,
      },
    ],
    toleranceRules: {
      xyClearance: 0.15,
      description: `截图标称 ${spec.panelHole} mm 开孔，已加 0.3 mm 装配余量`,
    },
    metadata: {
      bomName: `${spec.ledDiameter} mm wired metal LED indicator`,
      notes:
        "截图规格标注 20 cm 线长，XH2.54、PH2.0、杜邦、公母头、SM/JST 等带线插头可选；3 mm 灯珠带座开孔 6 mm，5 mm 灯珠带座开孔 8 mm；红/蓝/绿/黄/白和七彩选项需按实物规格复核。",
    },
  };
}

export const WIRED_LED_INDICATOR_DEFINITIONS: ConnectorDefinition[] =
  WIRED_LED_INDICATOR_SPECS.map((spec) =>
    createWiredLedIndicatorDefinition(spec),
  );

export const CONNECTOR_DEFINITIONS: ConnectorDefinition[] = [
  {
    id: "usb-c-receptacle",
    name: "USB Type-C 母座",
    category: "usb",
    visualGeometry: { shape: "rounded-rectangle", width: 10, height: 3.6, depth: 8, color: "#9ca5a2" },
    panelCutout: { shape: "rounded-rectangle", width: 12, height: 7, cornerRadius: 2.4 },
    boardAlignment: { heightAboveBoardCenter: 2.3 },
    keepoutVolumes: [{ role: "plug", width: 16, height: 11, depth: 28 }],
    toleranceRules: { xyClearance: 0.35, description: "开孔已包含常规 FDM 装配余量" },
    metadata: { bomName: "USB-C receptacle", notes: "适合常见中置贴片母座，具体沉板高度需按封装复核。" },
  },
  {
    id: "usb-a-receptacle",
    name: "USB-A 母座",
    category: "usb",
    visualGeometry: { shape: "rounded-rectangle", width: 13.2, height: 5.8, depth: 14, color: "#a6adab" },
    panelCutout: { shape: "rounded-rectangle", width: 15, height: 7.5, cornerRadius: 1.2 },
    boardAlignment: { heightAboveBoardCenter: 3.4 },
    keepoutVolumes: [{ role: "plug", width: 20, height: 13, depth: 36 }],
    toleranceRules: { xyClearance: 0.4, description: "开孔为通用包络，需按具体外壳尺寸复核" },
    metadata: { bomName: "USB-A receptacle", notes: "覆盖常见卧式 USB-A，固定脚与屏蔽壳尺寸因型号而异。" },
  },
  {
    id: "micro-usb-receptacle",
    name: "Micro USB 母座",
    category: "usb",
    visualGeometry: { shape: "rounded-rectangle", width: 7.6, height: 3, depth: 6, color: "#9ca5a2" },
    panelCutout: { shape: "rounded-rectangle", width: 9, height: 4.5, cornerRadius: 1.2 },
    boardAlignment: { heightAboveBoardCenter: 1.8 },
    keepoutVolumes: [{ role: "plug", width: 13, height: 9, depth: 24 }],
    toleranceRules: { xyClearance: 0.3, description: "适用于常见 Micro-B 插拔包络" },
    metadata: { bomName: "Micro USB receptacle", notes: "母座沉板和外壳台阶需按具体器件确认。" },
  },
  {
    id: "dc-5521-jack",
    name: "DC 5.5/2.1 母座",
    category: "power",
    visualGeometry: { shape: "circle", width: 8, height: 8, depth: 14, color: "#323836" },
    panelCutout: { shape: "circle", width: 9, height: 9, cornerRadius: 4.5 },
    boardAlignment: { heightAboveBoardCenter: 4.5 },
    keepoutVolumes: [{ role: "plug", width: 14, height: 14, depth: 32 }],
    toleranceRules: { xyClearance: 0.4, description: "圆孔按通用 5.5 mm 电源座外径预留" },
    metadata: { bomName: "DC-005 5.5/2.1 jack", notes: "仅表示插孔包络，螺纹面板座需改用对应直径。" },
  },
  {
    id: "rj45-receptacle",
    name: "RJ45 网络母座",
    category: "network",
    visualGeometry: { shape: "rounded-rectangle", width: 16, height: 13.5, depth: 21, color: "#777f7b" },
    panelCutout: { shape: "rounded-rectangle", width: 17.2, height: 15, cornerRadius: 1.2 },
    boardAlignment: { heightAboveBoardCenter: 7.5 },
    keepoutVolumes: [{ role: "plug", width: 24, height: 20, depth: 46 }],
    toleranceRules: { xyClearance: 0.5, description: "包含水晶头卡扣活动空间" },
    metadata: { bomName: "RJ45 receptacle", notes: "带灯、带磁和屏蔽型号高度不同，需按器件图校核。" },
  },
  ...TERMINAL_CONNECTOR_DEFINITIONS,
  ...FPC_CONNECTOR_DEFINITIONS,
  ...LCDWIKI_DISPLAY_DEFINITIONS,
  ...OLED_DISPLAY_DEFINITIONS,
  ...MEMBRANE_SWITCH_DEFINITIONS,
  ...METAL_POWER_BUTTON_DEFINITIONS,
  ...WIRED_LED_INDICATOR_DEFINITIONS,
];

export const ANTENNA_DEFINITIONS: AntennaDefinition[] = [
  {
    id: "sma-bulkhead-whip",
    name: "SMA 穿板棒状天线",
    placement: "rear-bulkhead",
    visualGeometry: {
      width: 8,
      height: 8,
      depth: 11,
      color: "#c6a15b",
      radiatorLength: 52,
      radiatorDiameter: 3.2,
    },
    enclosureCutout: { diameter: 6.8, description: "后壁 6.8 mm 圆孔，适配常见 SMA 穿板座" },
    heightAboveBoardCenter: 6,
    keepoutVolume: { width: 18, height: 18, depth: 70 },
    metadata: {
      bomName: "SMA female bulkhead + whip antenna",
      frequencyBand: "2.4 GHz / 5.8 GHz",
      notes: "外部棒状天线，孔径和防松垫片空间需按实际 SMA 座复核。",
    },
  },
  {
    id: "rp-sma-bulkhead-whip",
    name: "RP-SMA 穿板棒状天线",
    placement: "rear-bulkhead",
    visualGeometry: {
      width: 8.2,
      height: 8.2,
      depth: 12,
      color: "#b99754",
      radiatorLength: 72,
      radiatorDiameter: 3.6,
    },
    enclosureCutout: { diameter: 6.8, description: "后壁 6.8 mm 圆孔，适配常见 RP-SMA 穿板座" },
    heightAboveBoardCenter: 6,
    keepoutVolume: { width: 20, height: 20, depth: 92 },
    metadata: {
      bomName: "RP-SMA female bulkhead + whip antenna",
      frequencyBand: "868 MHz / 915 MHz / 2.4 GHz",
      notes: "适合外置可更换天线，装配前确认公母针定义和同轴线弯折半径。",
    },
  },
  {
    id: "adhesive-fpc-antenna",
    name: "内贴 FPC 天线",
    placement: "inner-rear-wall",
    visualGeometry: { width: 35, height: 10, depth: 0.5, color: "#d0a63d" },
    enclosureCutout: null,
    heightAboveBoardCenter: 7,
    keepoutVolume: { width: 45, height: 18, depth: 8 },
    metadata: {
      bomName: "Adhesive FPC antenna with coax lead",
      frequencyBand: "2.4 GHz / 5 GHz",
      notes: "贴于非金属后壁内侧，黄色禁入区内避免铜箔、电池和屏蔽罩。",
    },
  },
  {
    id: "pcb-edge-antenna",
    name: "PCB 板边天线",
    placement: "pcb-rear-edge",
    visualGeometry: { width: 25, height: 1, depth: 8, color: "#d7b24c" },
    enclosureCutout: null,
    heightAboveBoardCenter: 0.8,
    keepoutVolume: { width: 32, height: 12, depth: 16 },
    metadata: {
      bomName: "PCB edge antenna keepout",
      frequencyBand: "2.4 GHz",
      notes: "表示 PCB 板边净空区，不生成外壳开孔；实际匹配网络需通过射频测试确认。",
    },
  },
];

export const FASTENER_DEFINITIONS: FastenerDefinition[] = [
  {
    id: "m2-machine",
    name: "M2 机牙螺丝",
    thread: "M2",
    clearanceDiameter: 2.4,
    bossDiameter: 5.6,
    baseRecess: "pilot",
    recessDiameter: 1.7,
    recessDepth: null,
    metadata: { bomName: "M2 machine screw", notes: "适合小型外壳，建议配铜螺母或金属嵌件。" },
  },
  {
    id: "m25-machine",
    name: "M2.5 机牙螺丝",
    thread: "M2.5",
    clearanceDiameter: 2.9,
    bossDiameter: 6.6,
    baseRecess: "pilot",
    recessDiameter: 2.1,
    recessDepth: null,
    metadata: { bomName: "M2.5 machine screw", notes: "适合开发板和中小型电子外壳。" },
  },
  {
    id: "m3-self-tapping",
    name: "M3 自攻螺丝",
    thread: "M3",
    clearanceDiameter: 3.2,
    bossDiameter: 7.6,
    baseRecess: "pilot",
    recessDiameter: 2.7,
    recessDepth: null,
    metadata: { bomName: "M3 self-tapping screw", notes: "导孔尺寸需按材料、层高和实物螺丝标定。" },
  },
  {
    id: "m3-heat-set",
    name: "M3 热熔螺母",
    thread: "M3",
    clearanceDiameter: 3.4,
    bossDiameter: 8.4,
    baseRecess: "heat-set",
    recessDiameter: 4.2,
    recessDepth: 5,
    metadata: { bomName: "M3 heat-set insert + screw", notes: "热熔温度、孔径和底部余量按嵌件供应商数据调整。" },
  },
  {
    id: "m3-hex-nut",
    name: "M3 六角螺母槽",
    thread: "M3",
    clearanceDiameter: 3.4,
    bossDiameter: 9,
    baseRecess: "hex-nut",
    recessDiameter: 5.7,
    recessDepth: 2.7,
    metadata: { bomName: "M3 hex nut + screw", notes: "六角槽按 5.5 mm 对边加装配余量生成。" },
  },
];

export function getConnectorDefinition(id: string): ConnectorDefinition {
  return CONNECTOR_DEFINITIONS.find((definition) => definition.id === id) ?? CONNECTOR_DEFINITIONS[0];
}

export function getAntennaDefinition(id: string): AntennaDefinition {
  return ANTENNA_DEFINITIONS.find((definition) => definition.id === id) ?? ANTENNA_DEFINITIONS[0];
}

export function getFastenerDefinition(id: string): FastenerDefinition {
  return FASTENER_DEFINITIONS.find((definition) => definition.id === id) ?? FASTENER_DEFINITIONS[2];
}
