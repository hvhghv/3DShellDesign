import type { MagnetSupportType } from "./model";

export interface MagnetSupportOption {
  id: MagnetSupportType;
  name: string;
  description: string;
}

export const MAGNET_SUPPORT_OPTIONS: readonly MagnetSupportOption[] = [
  {
    id: "corner-shelf",
    name: "双壁角托",
    description: "由相邻两面侧壁共同承托，占用底部空间较少。",
  },
  {
    id: "wall-bracket",
    name: "单壁耳台",
    description: "从前后侧壁局部伸出，适合避让角部结构。",
  },
  {
    id: "perimeter-flange",
    name: "四周内翻边",
    description: "沿壳体顶部形成连续承托边，整体刚度较高。",
  },
  {
    id: "floor-column",
    name: "底板连续立柱",
    description: "从底板延伸到顶部，抗冲击强但占用 PCB 周边空间。",
  },
] as const;

export const MAGNET_GEOMETRY = {
  diameter: 6,
  thickness: 1.8,
  pocketRadius: 3.15,
  basePocketDepth: 2,
  lidPocketDepth: 1.9,
  supportThickness: 3.2,
  supportSize: 11,
  wallBracketWidth: 8.5,
  wallBracketRibThickness: 1.8,
  wallBracketRibDrop: 4,
  perimeterFlangeWidth: 9,
  wallOverlap: 1,
  floorColumnRadius: 5.5,
  centerInset: 4.5,
} as const;

export function getClosurePoints(
  outsideLength: number,
  outsideWidth: number,
  wallThickness: number,
): Array<readonly [number, number]> {
  const x = outsideLength / 2 - wallThickness - MAGNET_GEOMETRY.centerInset;
  const y = outsideWidth / 2 - wallThickness - MAGNET_GEOMETRY.centerInset;
  return [
    [-x, -y],
    [x, -y],
    [-x, y],
    [x, y],
  ];
}

export function getMagnetSupportOption(
  id: MagnetSupportType,
): MagnetSupportOption {
  return (
    MAGNET_SUPPORT_OPTIONS.find((option) => option.id === id) ??
    MAGNET_SUPPORT_OPTIONS[0]
  );
}
