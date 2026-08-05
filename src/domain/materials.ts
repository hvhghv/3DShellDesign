export interface MaterialProfile {
  id: string;
  name: string;
  shortName: string;
  process: string;
  color: string;
  minWall: number;
  minClearance: number;
  maxServiceTemp: number;
  notes: string;
  supportsSnapFit: boolean;
  panelOnly?: boolean;
}

export const MATERIALS: MaterialProfile[] = [
  {
    id: "pla",
    name: "PLA 通用打印",
    shortName: "PLA",
    process: "FDM",
    color: "#d9d9d2",
    minWall: 1.2,
    minClearance: 0.25,
    maxServiceTemp: 50,
    notes: "尺寸稳定，适合原型，不建议高温和长期受力卡扣。",
    supportsSnapFit: false,
  },
  {
    id: "petg",
    name: "PETG 韧性打印",
    shortName: "PETG",
    process: "FDM",
    color: "#c8d3cf",
    minWall: 1.4,
    minClearance: 0.3,
    maxServiceTemp: 70,
    notes: "韧性和耐候性均衡，适合常规电子外壳。",
    supportsSnapFit: true,
  },
  {
    id: "abs",
    name: "ABS 工程打印",
    shortName: "ABS",
    process: "FDM",
    color: "#c9c7c0",
    minWall: 1.5,
    minClearance: 0.35,
    maxServiceTemp: 85,
    notes: "耐温较好，需要考虑翘曲和收缩补偿。",
    supportsSnapFit: true,
  },
  {
    id: "asa",
    name: "ASA 户外打印",
    shortName: "ASA",
    process: "FDM",
    color: "#d8d2c7",
    minWall: 1.5,
    minClearance: 0.35,
    maxServiceTemp: 90,
    notes: "耐紫外线，适合户外壳体，需要封闭打印环境。",
    supportsSnapFit: true,
  },
  {
    id: "pc",
    name: "PC 高强度打印",
    shortName: "PC",
    process: "FDM",
    color: "#d4d8d6",
    minWall: 1.6,
    minClearance: 0.4,
    maxServiceTemp: 110,
    notes: "高强耐温，对设备和打印环境要求较高。",
    supportsSnapFit: true,
  },
  {
    id: "pa",
    name: "PA 尼龙打印",
    shortName: "PA",
    process: "FDM",
    color: "#cbc8bb",
    minWall: 1.4,
    minClearance: 0.4,
    maxServiceTemp: 100,
    notes: "韧性和耐磨性好，吸湿与翘曲需要受控打印环境。",
    supportsSnapFit: true,
  },
  {
    id: "tpu",
    name: "TPU 柔性打印",
    shortName: "TPU",
    process: "FDM",
    color: "#57635c",
    minWall: 1.8,
    minClearance: 0.5,
    maxServiceTemp: 70,
    notes: "适合护套和缓冲件，不适合承载螺柱与刚性定位。",
    supportsSnapFit: true,
  },
  {
    id: "tough-resin",
    name: "韧性光敏树脂",
    shortName: "韧性树脂",
    process: "SLA/DLP",
    color: "#aaa89f",
    minWall: 1.2,
    minClearance: 0.25,
    maxServiceTemp: 65,
    notes: "细节精度高，长期耐候和螺纹寿命需按树脂数据确认。",
    supportsSnapFit: false,
  },
  {
    id: "acrylic-clear",
    name: "透明亚克力板",
    shortName: "透明亚克力",
    process: "激光切割",
    color: "#8ad7df",
    minWall: 1.5,
    minClearance: 0.2,
    maxServiceTemp: 70,
    notes: "透明度高，内角和固定孔需避免应力集中。",
    supportsSnapFit: false,
    panelOnly: true,
  },
  {
    id: "pc-sheet",
    name: "透明 PC 板",
    shortName: "PC 板",
    process: "板材加工",
    color: "#96cbd2",
    minWall: 1,
    minClearance: 0.25,
    maxServiceTemp: 115,
    notes: "抗冲击优于亚克力，切割工艺需单独确认。",
    supportsSnapFit: false,
    panelOnly: true,
  },
  {
    id: "aluminum-sheet",
    name: "铝合金面板",
    shortName: "铝板",
    process: "CNC/钣金",
    color: "#a9adb0",
    minWall: 1,
    minClearance: 0.2,
    maxServiceTemp: 180,
    notes: "强度和散热较好，需要检查绝缘与天线遮挡。",
    supportsSnapFit: false,
    panelOnly: true,
  },
  {
    id: "abs-sheet",
    name: "ABS 板材",
    shortName: "ABS 板",
    process: "板材加工",
    color: "#d0cdc5",
    minWall: 1,
    minClearance: 0.25,
    maxServiceTemp: 80,
    notes: "抗冲击且易加工，激光切割前需确认烟气处理和设备许可。",
    supportsSnapFit: false,
    panelOnly: true,
  },
  {
    id: "stainless-sheet",
    name: "不锈钢面板",
    shortName: "不锈钢",
    process: "钣金/激光",
    color: "#9fa5a2",
    minWall: 0.8,
    minClearance: 0.2,
    maxServiceTemp: 250,
    notes: "刚度和耐久性高，需要检查绝缘、毛刺和天线遮挡。",
    supportsSnapFit: false,
    panelOnly: true,
  },
];

export const SHELL_MATERIALS = MATERIALS.filter((material) => !material.panelOnly);
export const PANEL_MATERIALS = MATERIALS;

export function getMaterial(id: string): MaterialProfile {
  return MATERIALS.find((material) => material.id === id) ?? MATERIALS[1];
}
