import type { DesignerParameters } from "../domain/model";

export interface EnclosureTemplateDefinition {
  id: string;
  name: string;
  description: string;
  parameterOverrides: Partial<DesignerParameters>;
}

export const ENCLOSURE_TEMPLATES: EnclosureTemplateDefinition[] = [
  {
    id: "rounded-split",
    name: "圆角主体 + 可拆面",
    description: "通用 PCB 外壳，支持可拆面固定与六面器件布置。",
    parameterOverrides: {
      pcbLength: 100,
      pcbWidth: 70,
      baseHeight: 24,
      closureType: "screw",
    },
  },
  {
    id: "single-board-base",
    name: "单板主体与薄可拆面",
    description: "适合开发板保护和快速打印。",
    parameterOverrides: {
      pcbLength: 70,
      pcbWidth: 45,
      baseHeight: 18,
      closureType: "snap",
    },
  },
  {
    id: "instrument-panel",
    name: "可更换面板仪表盒",
    description: "加高壳体与独立透明或金属面板。",
    parameterOverrides: {
      pcbLength: 120,
      pcbWidth: 80,
      baseHeight: 36,
      closureType: "screw",
    },
  },
  {
    id: "wall-mount",
    name: "壁挂式外壳",
    description: "壳体主体带外伸安装耳和墙面固定孔。",
    parameterOverrides: {
      pcbLength: 90,
      pcbWidth: 60,
      baseHeight: 26,
      closureType: "screw",
    },
  },
];

export function getEnclosureTemplate(id: string): EnclosureTemplateDefinition {
  return ENCLOSURE_TEMPLATES.find((template) => template.id === id) ?? ENCLOSURE_TEMPLATES[0];
}
