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
  placementAnchor: {
    face: "front";
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

export const CONNECTOR_DEFINITIONS: ConnectorDefinition[] = [
  {
    id: "usb-c-receptacle",
    name: "USB Type-C 母座",
    category: "usb",
    visualGeometry: { shape: "rounded-rectangle", width: 10, height: 3.6, depth: 8, color: "#9ca5a2" },
    panelCutout: { shape: "rounded-rectangle", width: 12, height: 7, cornerRadius: 2.4 },
    placementAnchor: { face: "front", heightAboveBoardCenter: 2.3 },
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
    placementAnchor: { face: "front", heightAboveBoardCenter: 3.4 },
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
    placementAnchor: { face: "front", heightAboveBoardCenter: 1.8 },
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
    placementAnchor: { face: "front", heightAboveBoardCenter: 4.5 },
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
    placementAnchor: { face: "front", heightAboveBoardCenter: 7.5 },
    keepoutVolumes: [{ role: "plug", width: 24, height: 20, depth: 46 }],
    toleranceRules: { xyClearance: 0.5, description: "包含水晶头卡扣活动空间" },
    metadata: { bomName: "RJ45 receptacle", notes: "带灯、带磁和屏蔽型号高度不同，需按器件图校核。" },
  },
  {
    id: "terminal-508-2p",
    name: "5.08 mm 两位接线端子",
    category: "terminal",
    visualGeometry: { shape: "rounded-rectangle", width: 10.5, height: 8.2, depth: 10, color: "#397b4a" },
    panelCutout: { shape: "rounded-rectangle", width: 11.5, height: 9.5, cornerRadius: 0.8 },
    placementAnchor: { face: "front", heightAboveBoardCenter: 5 },
    keepoutVolumes: [{ role: "tool", width: 16, height: 18, depth: 30 }],
    toleranceRules: { xyClearance: 0.45, description: "为导线与螺丝刀操作预留包络" },
    metadata: { bomName: "5.08 mm 2-pin terminal", notes: "端子开口方向和螺丝刀角度需结合装配方向检查。" },
  },
  {
    id: "fpc-20p-05",
    name: "0.5 mm 20P FPC 端子",
    category: "fpc",
    visualGeometry: { shape: "rounded-rectangle", width: 13.5, height: 2.2, depth: 5.5, color: "#d7c7a4" },
    panelCutout: { shape: "rounded-rectangle", width: 15, height: 4, cornerRadius: 0.8 },
    placementAnchor: { face: "front", heightAboveBoardCenter: 1.5 },
    keepoutVolumes: [{ role: "wiring", width: 18, height: 8, depth: 35 }],
    toleranceRules: { xyClearance: 0.3, description: "仅为软排线穿出包络，不代替锁扣操作校核" },
    metadata: { bomName: "0.5 mm 20-pin FPC connector", notes: "FPC 通常不直接贴壳，建议优先使用独立排线槽。" },
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

export function getFastenerDefinition(id: string): FastenerDefinition {
  return FASTENER_DEFINITIONS.find((definition) => definition.id === id) ?? FASTENER_DEFINITIONS[2];
}
