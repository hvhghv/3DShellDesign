import type {
  BatteryCompartmentPlacement,
  BatteryPreset,
} from "./model";

export interface BatteryPresetDefinition {
  id: BatteryPreset;
  name: string;
  shape: "cylinder" | "box";
  cellLength: number;
  cellWidth: number;
  cellHeight: number;
  defaultCount: number;
}

export const BATTERY_PRESETS: readonly BatteryPresetDefinition[] = [
  { id: "aaa", name: "AAA 电池仓", shape: "cylinder", cellLength: 44.5, cellWidth: 10.5, cellHeight: 10.5, defaultCount: 2 },
  { id: "aa", name: "AA 电池仓", shape: "cylinder", cellLength: 50.5, cellWidth: 14.5, cellHeight: 14.5, defaultCount: 2 },
  { id: "18650", name: "18650 电池仓", shape: "cylinder", cellLength: 65.2, cellWidth: 18.6, cellHeight: 18.6, defaultCount: 1 },
  { id: "lipo", name: "软包锂电池仓", shape: "box", cellLength: 60, cellWidth: 40, cellHeight: 8, defaultCount: 1 },
  { id: "custom", name: "自定义电池仓", shape: "box", cellLength: 50, cellWidth: 30, cellHeight: 10, defaultCount: 1 },
];

export const BATTERY_TERMINAL_ALLOWANCE = 2.8;
export const BATTERY_LIPO_TERMINAL_ALLOWANCE = 1.2;

export interface BatteryCompartmentLayout {
  preset: BatteryPresetDefinition;
  cellCount: number;
  innerWidth: number;
  innerDepth: number;
  terminalAllowance: number;
  railHeight: number;
  laneCenters: number[];
  lanePitch: number;
}

export function getBatteryPreset(id: BatteryPreset): BatteryPresetDefinition {
  return BATTERY_PRESETS.find((preset) => preset.id === id) ?? BATTERY_PRESETS[0];
}

export function getBatteryTerminalAllowance(
  preset: BatteryPresetDefinition,
): number {
  if (preset.shape === "cylinder") return BATTERY_TERMINAL_ALLOWANCE;
  return preset.id === "lipo" ? BATTERY_LIPO_TERMINAL_ALLOWANCE : 0;
}

export function getBatteryMaxRailHeight(
  preset: BatteryPresetDefinition,
): number {
  if (preset.shape !== "cylinder") return 300;
  return Number(
    Math.max(3.2, Math.min(preset.cellHeight * 0.45, preset.cellHeight / 2 - 0.7)).toFixed(2),
  );
}

function calculatedDimensions(
  preset: BatteryPresetDefinition,
  cellCount: number,
  wallThickness: number,
  clearance: number,
): readonly [number, number, number] {
  const count = preset.id === "lipo" ? 1 : cellCount;
  const terminalAllowance = getBatteryTerminalAllowance(preset);
  const dividerWidth = preset.id === "lipo" ? 0 : Math.max(1, wallThickness);
  const laneClearance = preset.id === "lipo" ? clearance * 2 : clearance * 2 * count;
  const gap = count > 1 ? (count - 1) * dividerWidth : 0;
  const railHeight =
    preset.shape === "cylinder"
      ? getBatteryMaxRailHeight(preset)
      : Math.max(4, Math.min(preset.cellHeight, preset.cellHeight * 0.55 + wallThickness));
  return [
    preset.cellLength + terminalAllowance * 2 + clearance * 2 + wallThickness * 2,
    preset.cellWidth * count + gap + laneClearance + wallThickness * 2,
    railHeight,
  ];
}

export function getBatteryCompartmentLayout(
  placement: BatteryCompartmentPlacement,
): BatteryCompartmentLayout {
  const preset = getBatteryPreset(placement.preset);
  const cellCount = preset.id === "lipo" ? 1 : Math.min(6, Math.max(1, placement.cellCount));
  const innerWidth = Math.max(
    preset.cellLength + getBatteryTerminalAllowance(preset) * 2,
    placement.width - placement.wallThickness * 2,
  );
  const innerDepth = Math.max(
    preset.cellWidth * cellCount,
    placement.depth - placement.wallThickness * 2,
  );
  const lanePitch = cellCount > 1
    ? (innerDepth - preset.cellWidth) / (cellCount - 1)
    : 0;
  const startZ = cellCount > 1 ? -innerDepth / 2 + preset.cellWidth / 2 : 0;
  return {
    preset,
    cellCount,
    innerWidth,
    innerDepth,
    terminalAllowance: getBatteryTerminalAllowance(preset),
    railHeight: Math.min(placement.height, getBatteryMaxRailHeight(preset)),
    lanePitch,
    laneCenters: Array.from({ length: cellCount }, (_, index) =>
      Number((startZ + lanePitch * index).toFixed(3)),
    ),
  };
}

export function getBatteryMinimumDimensions(
  placement: BatteryCompartmentPlacement,
): readonly [number, number, number] {
  return calculatedDimensions(
    getBatteryPreset(placement.preset),
    placement.cellCount,
    placement.wallThickness,
    placement.clearance,
  );
}

export function createBatteryCompartment(
  id: string,
  presetId: BatteryPreset = "aa",
): BatteryCompartmentPlacement {
  const preset = getBatteryPreset(presetId);
  const wallThickness = 1.6;
  const clearance = 0.6;
  const [width, depth, height] = calculatedDimensions(
    preset,
    preset.defaultCount,
    wallThickness,
    clearance,
  );
  return {
    id,
    preset: preset.id,
    cellCount: preset.defaultCount,
    width: Number(width.toFixed(2)),
    depth: Number(depth.toFixed(2)),
    height: Number(height.toFixed(2)),
    wallThickness,
    clearance,
    offsetX: 0,
    offsetZ: 0,
    rotation: 0,
  };
}

export function applyBatteryPreset(
  placement: BatteryCompartmentPlacement,
  presetId: BatteryPreset,
  cellCount = getBatteryPreset(presetId).defaultCount,
): BatteryCompartmentPlacement {
  const preset = getBatteryPreset(presetId);
  const count = preset.id === "lipo" ? 1 : Math.min(6, Math.max(1, cellCount));
  const [width, depth, height] = calculatedDimensions(
    preset,
    count,
    placement.wallThickness,
    placement.clearance,
  );
  return {
    ...placement,
    preset: preset.id,
    cellCount: count,
    width: Number(width.toFixed(2)),
    depth: Number(depth.toFixed(2)),
    height: Number(height.toFixed(2)),
  };
}

export function constrainBatteryCompartment(
  placement: BatteryCompartmentPlacement,
): BatteryCompartmentPlacement {
  const clampDimension = (value: number) =>
    Number(Math.min(300, Math.max(4, value)).toFixed(2));
  const preset = getBatteryPreset(placement.preset);
  const cellCount =
    preset.id === "lipo"
      ? 1
      : Math.min(6, Math.max(1, Math.round(placement.cellCount)));
  const maxHeight = getBatteryMaxRailHeight(preset);
  return {
    ...placement,
    cellCount,
    width: clampDimension(placement.width),
    depth: clampDimension(placement.depth),
    height: Number(Math.min(maxHeight, clampDimension(placement.height)).toFixed(2)),
    wallThickness: Number(
      Math.min(5, Math.max(0.8, placement.wallThickness)).toFixed(2),
    ),
    clearance: Number(Math.min(5, Math.max(0.2, placement.clearance)).toFixed(2)),
    offsetX: Number(Math.min(500, Math.max(-500, placement.offsetX)).toFixed(2)),
    offsetZ: Number(Math.min(500, Math.max(-500, placement.offsetZ)).toFixed(2)),
  };
}
