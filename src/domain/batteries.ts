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

export function getBatteryPreset(id: BatteryPreset): BatteryPresetDefinition {
  return BATTERY_PRESETS.find((preset) => preset.id === id) ?? BATTERY_PRESETS[0];
}

function calculatedDimensions(
  preset: BatteryPresetDefinition,
  cellCount: number,
  wallThickness: number,
  clearance: number,
): readonly [number, number, number] {
  const count = preset.id === "lipo" ? 1 : cellCount;
  const gap = count > 1 ? (count - 1) * Math.max(1, wallThickness) : 0;
  return [
    preset.cellLength + (wallThickness + clearance) * 2,
    preset.cellWidth * count + gap + (wallThickness + clearance) * 2,
    Math.max(4, preset.cellHeight * 0.62 + wallThickness),
  ];
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
  return {
    ...placement,
    cellCount: Math.min(6, Math.max(1, Math.round(placement.cellCount))),
    width: clampDimension(placement.width),
    depth: clampDimension(placement.depth),
    height: clampDimension(placement.height),
    wallThickness: Number(
      Math.min(5, Math.max(0.8, placement.wallThickness)).toFixed(2),
    ),
    clearance: Number(Math.min(5, Math.max(0.2, placement.clearance)).toFixed(2)),
    offsetX: Number(Math.min(500, Math.max(-500, placement.offsetX)).toFixed(2)),
    offsetZ: Number(Math.min(500, Math.max(-500, placement.offsetZ)).toFixed(2)),
  };
}
