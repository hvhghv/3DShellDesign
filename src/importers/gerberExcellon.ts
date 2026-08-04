import {
  ABSOLUTE,
  CCW_ARC,
  createParser,
  DRILL,
  GERBER,
  IN,
  INCREMENTAL,
  type CoordinateFormat,
  type Graphic,
  type Root,
  type ToolDefinition,
} from "@tracespace/parser";
import type { PcbMountingHole, PcbReference } from "../domain/model";

interface Point {
  x: number;
  y: number;
}

interface BoundsAccumulator {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface CoordinateState {
  format: CoordinateFormat["format"];
  zeroSuppression: CoordinateFormat["zeroSuppression"];
  mode: CoordinateFormat["mode"];
  unitFactor: number | null;
}

const MIN_MOUNTING_HOLE_DIAMETER = 2;
const TAU = Math.PI * 2;

function parseTree(source: string, expectedType: typeof GERBER | typeof DRILL): Root {
  // The parser version predates the common Excellon standalone '%' header delimiter.
  const normalized =
    expectedType === DRILL ? source.replace(/^\s*%\s*$/gm, "") : source;
  const parser = createParser();
  parser.feed(normalized.endsWith("\n") ? normalized : `${normalized}\n`);
  const tree = parser.results();
  if (tree.filetype !== expectedType) {
    throw new Error(
      expectedType === GERBER
        ? "所选板框文件不是有效 Gerber"
        : "所选钻孔文件不是有效 Excellon",
    );
  }
  return tree;
}

function decodeCoordinate(
  source: string,
  state: CoordinateState,
  label: string,
): number {
  const direct = Number(source);
  if (source.includes(".")) {
    if (!Number.isFinite(direct)) throw new Error(`${label} 坐标无效`);
    if (state.unitFactor === null) throw new Error(`${label} 文件未声明单位`);
    return direct * state.unitFactor;
  }
  if (!state.format) throw new Error(`${label} 文件缺少明确坐标格式`);
  if (state.unitFactor === null) throw new Error(`${label} 文件未声明单位`);
  const negative = source.startsWith("-");
  const unsigned = source.replace(/^[+-]/, "");
  const totalDigits = state.format[0] + state.format[1];
  if (!/^\d+$/.test(unsigned) || unsigned.length > totalDigits) {
    throw new Error(`${label} 坐标位数与格式不匹配`);
  }
  let digits = unsigned;
  if (digits.length < totalDigits) {
    if (state.zeroSuppression === "leading") digits = digits.padStart(totalDigits, "0");
    else if (state.zeroSuppression === "trailing") digits = digits.padEnd(totalDigits, "0");
    else throw new Error(`${label} 坐标省略零但未声明省略方式`);
  }
  const value = Number(digits) / 10 ** state.format[1];
  return (negative ? -value : value) * state.unitFactor;
}

function updateCoordinateState(
  node: Root["children"][number],
  state: CoordinateState,
): void {
  if (node.type === "units") state.unitFactor = node.units === IN ? 25.4 : 1;
  if (node.type === "coordinateFormat") {
    state.format = node.format ?? state.format;
    state.zeroSuppression = node.zeroSuppression ?? state.zeroSuppression;
    state.mode = node.mode ?? state.mode;
  }
}

function coordinatePoint(
  coordinates: Graphic["coordinates"],
  current: Point,
  state: CoordinateState,
  label: string,
): Point {
  const x =
    coordinates.x === undefined
      ? current.x
      : decodeCoordinate(coordinates.x, state, label);
  const y =
    coordinates.y === undefined
      ? current.y
      : decodeCoordinate(coordinates.y, state, label);
  return state.mode === INCREMENTAL
    ? {
        x: current.x + (coordinates.x === undefined ? 0 : x),
        y: current.y + (coordinates.y === undefined ? 0 : y),
      }
    : { x, y };
}

function includePoint(bounds: BoundsAccumulator, point: Point): void {
  bounds.minX = Math.min(bounds.minX, point.x);
  bounds.minY = Math.min(bounds.minY, point.y);
  bounds.maxX = Math.max(bounds.maxX, point.x);
  bounds.maxY = Math.max(bounds.maxY, point.y);
}

function normalizedAngle(value: number): number {
  return ((value % TAU) + TAU) % TAU;
}

function positiveDelta(from: number, to: number): number {
  return normalizedAngle(to - from);
}

function includeArc(
  bounds: BoundsAccumulator,
  start: Point,
  end: Point,
  center: Point,
  counterClockwise: boolean,
): void {
  includePoint(bounds, start);
  includePoint(bounds, end);
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  if (radius < 1e-9) return;
  const startAngle = normalizedAngle(Math.atan2(start.y - center.y, start.x - center.x));
  const endAngle = normalizedAngle(Math.atan2(end.y - center.y, end.x - center.x));
  const fullCircle = Math.hypot(start.x - end.x, start.y - end.y) < 1e-7;
  for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
    const onArc =
      fullCircle ||
      (counterClockwise
        ? positiveDelta(startAngle, angle) <= positiveDelta(startAngle, endAngle) + 1e-9
        : positiveDelta(angle, startAngle) <= positiveDelta(endAngle, startAngle) + 1e-9);
    if (onArc) {
      includePoint(bounds, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
  }
}

function extractGerberOutline(source: string): Pick<
  PcbReference,
  "bounds" | "outlineElements" | "unsupportedOutlineElements"
> {
  const tree = parseTree(source, GERBER);
  const state: CoordinateState = {
    format: null,
    zeroSuppression: null,
    mode: ABSOLUTE,
    unitFactor: null,
  };
  const bounds: BoundsAccumulator = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  let current: Point = { x: 0, y: 0 };
  let hasCurrent = false;
  let interpolation: "line" | "cwArc" | "ccwArc" = "line";
  let modalGraphic: Graphic["graphic"] = null;
  let outlineElements = 0;
  let unsupportedOutlineElements = 0;

  for (const node of tree.children) {
    updateCoordinateState(node, state);
    if (node.type === "interpolateMode" && node.mode) {
      if (node.mode === "line" || node.mode === "cwArc" || node.mode === "ccwArc") {
        interpolation = node.mode;
      }
      continue;
    }
    if (node.type !== "graphic") continue;
    const graphic = node.graphic ?? modalGraphic;
    if (node.graphic) modalGraphic = node.graphic;
    const target = coordinatePoint(node.coordinates, current, state, "Gerber");
    if (graphic === "move") {
      current = target;
      hasCurrent = true;
      continue;
    }
    if (graphic !== "segment") continue;
    if (!hasCurrent) {
      unsupportedOutlineElements += 1;
      current = target;
      hasCurrent = true;
      continue;
    }
    outlineElements += 1;
    if (interpolation === "line") {
      includePoint(bounds, current);
      includePoint(bounds, target);
    } else if (node.coordinates.i !== undefined || node.coordinates.j !== undefined) {
      const center = {
        x:
          current.x +
          (node.coordinates.i === undefined
            ? 0
            : decodeCoordinate(node.coordinates.i, state, "Gerber")),
        y:
          current.y +
          (node.coordinates.j === undefined
            ? 0
            : decodeCoordinate(node.coordinates.j, state, "Gerber")),
      };
      includeArc(bounds, current, target, center, interpolation === CCW_ARC);
    } else {
      includePoint(bounds, current);
      includePoint(bounds, target);
      unsupportedOutlineElements += 1;
    }
    current = target;
  }

  if (
    outlineElements < 2 ||
    !Number.isFinite(bounds.minX) ||
    bounds.maxX <= bounds.minX ||
    bounds.maxY <= bounds.minY
  ) {
    throw new Error("板框 Gerber 中未找到可用的封闭外形轨迹");
  }
  return { bounds, outlineElements, unsupportedOutlineElements };
}

function extractExcellonHoles(source: string): {
  mountingHoles: PcbMountingHole[];
  drillHoleCount: number;
} {
  const tree = parseTree(source, DRILL);
  const state: CoordinateState = {
    format: null,
    zeroSuppression: null,
    mode: ABSOLUTE,
    unitFactor: null,
  };
  const tools = new Map<string, { diameter: number; unitFactor: number }>();
  let activeTool: string | null = null;
  let current: Point = { x: 0, y: 0 };
  let drilling = true;
  const allHoles: PcbMountingHole[] = [];

  for (const node of tree.children) {
    updateCoordinateState(node, state);
    if (node.type === "toolDefinition") {
      const definition = node as ToolDefinition;
      if (definition.shape.type === "circle" && state.unitFactor !== null) {
        tools.set(definition.code, {
          diameter: definition.shape.diameter,
          unitFactor: state.unitFactor,
        });
      }
      continue;
    }
    if (node.type === "toolChange") {
      activeTool = node.code;
      continue;
    }
    if (node.type === "interpolateMode") {
      drilling = node.mode === "drill" || node.mode === null;
      continue;
    }
    if (node.type !== "graphic") continue;
    const target = coordinatePoint(node.coordinates, current, state, "Excellon");
    current = target;
    const tool = activeTool ? tools.get(activeTool) : null;
    const isDrillHit = node.graphic === "shape" || (node.graphic === null && drilling);
    if (!isDrillHit || !tool) continue;
    const diameter = tool.diameter * tool.unitFactor;
    allHoles.push({ x: target.x, y: target.y, diameter });
  }

  return {
    mountingHoles: allHoles.filter(
      (hole) => hole.diameter >= MIN_MOUNTING_HOLE_DIAMETER,
    ),
    drillHoleCount: allHoles.length,
  };
}

export function parseGerberExcellon(
  outlineSource: string,
  outlineName: string,
  drillSource: string | null = null,
  drillName: string | null = null,
  thickness = 1.6,
): PcbReference {
  const outline = extractGerberOutline(outlineSource);
  const holes = drillSource
    ? extractExcellonHoles(drillSource)
    : { mountingHoles: [], drillHoleCount: 0 };
  return {
    format: "gerber-excellon",
    sourceName: outlineName,
    auxiliarySourceName: drillName,
    version: null,
    thickness,
    ...outline,
    ...holes,
  };
}
