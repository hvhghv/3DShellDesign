export type CutoutShape = "rounded-rectangle" | "circle";

export interface ConnectorDefinition {
  id: string;
  name: string;
  category: "usb" | "power" | "network" | "terminal" | "fpc";
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
      width: width + 1.5,
      height: family.height + 1.8,
      cornerRadius: 0.8,
    },
    boardAlignment: { heightAboveBoardCenter: family.height / 2 + 0.4 },
    keepoutVolumes: [
      {
        role: "wiring",
        width: width + 4.5,
        height: family.height + 5.8,
        depth: 35,
      },
    ],
    toleranceRules: {
      xyClearance: 0.3,
      description: `${pitchLabel} mm ${positions}P FPC 软排线穿出包络，不代替锁扣操作校核`,
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
