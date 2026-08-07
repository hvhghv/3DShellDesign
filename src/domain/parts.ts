import type { SelectablePart } from "./model";

export const SELECTABLE_PART_LABELS: Record<SelectablePart, string> = {
  project: "项目",
  pcb: "PCB",
  base: "壳体主体",
  lid: "可拆面",
  panel: "面板",
  connector: "接口",
  antenna: "天线",
  custom: "自定义组件",
  battery: "电池仓",
};
