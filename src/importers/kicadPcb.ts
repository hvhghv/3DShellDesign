import parseSExpression from "s-expression";
import type { PcbMountingHole, PcbReference } from "../domain/model";

interface StringLiteral {
  toString(): string;
}

type SExpression = string | StringLiteral | SExpression[];
type SList = SExpression[];

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

const TAU = Math.PI * 2;

function atom(value: SExpression | undefined): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.toString();
  }
  return null;
}

function listHead(value: SExpression | undefined): string | null {
  return Array.isArray(value) ? atom(value[0]) : null;
}

function child(node: SList, name: string): SList | null {
  return (
    node.find(
      (value): value is SList => Array.isArray(value) && listHead(value) === name,
    ) ?? null
  );
}

function children(node: SList, name: string): SList[] {
  return node.filter(
    (value): value is SList => Array.isArray(value) && listHead(value) === name,
  );
}

function numeric(value: SExpression | undefined): number | null {
  const text = atom(value);
  if (text === null || text.trim() === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function pointFrom(node: SList | null): Point | null {
  if (!node) return null;
  const x = numeric(node[1]);
  const y = numeric(node[2]);
  return x === null || y === null ? null : { x, y };
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

function includeArcBounds(
  bounds: BoundsAccumulator,
  start: Point,
  middle: Point,
  end: Point,
): void {
  includePoint(bounds, start);
  includePoint(bounds, middle);
  includePoint(bounds, end);
  const determinant =
    2 *
    (start.x * (middle.y - end.y) +
      middle.x * (end.y - start.y) +
      end.x * (start.y - middle.y));
  if (Math.abs(determinant) < 1e-9) return;

  const startSquared = start.x * start.x + start.y * start.y;
  const middleSquared = middle.x * middle.x + middle.y * middle.y;
  const endSquared = end.x * end.x + end.y * end.y;
  const center = {
    x:
      (startSquared * (middle.y - end.y) +
        middleSquared * (end.y - start.y) +
        endSquared * (start.y - middle.y)) /
      determinant,
    y:
      (startSquared * (end.x - middle.x) +
        middleSquared * (start.x - end.x) +
        endSquared * (middle.x - start.x)) /
      determinant,
  };
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  const startAngle = normalizedAngle(
    Math.atan2(start.y - center.y, start.x - center.x),
  );
  const middleAngle = normalizedAngle(
    Math.atan2(middle.y - center.y, middle.x - center.x),
  );
  const endAngle = normalizedAngle(Math.atan2(end.y - center.y, end.x - center.x));
  const counterClockwise =
    positiveDelta(startAngle, middleAngle) <=
    positiveDelta(startAngle, endAngle) + 1e-9;

  for (const angle of [0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2]) {
    const onArc = counterClockwise
      ? positiveDelta(startAngle, angle) <= positiveDelta(startAngle, endAngle) + 1e-9
      : positiveDelta(angle, startAngle) <= positiveDelta(endAngle, startAngle) + 1e-9;
    if (onArc) {
      includePoint(bounds, {
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
  }
}

function isEdgeCuts(node: SList): boolean {
  const layer = child(node, "layer");
  return atom(layer?.[1]) === "Edge.Cuts";
}

function extractOutline(root: SList): {
  bounds: PcbReference["bounds"];
  outlineElements: number;
  unsupportedOutlineElements: number;
} {
  const bounds: BoundsAccumulator = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  let outlineElements = 0;
  let unsupportedOutlineElements = 0;
  const graphicKinds = new Set([
    "gr_line",
    "gr_rect",
    "gr_arc",
    "gr_circle",
    "gr_poly",
    "gr_curve",
  ]);

  for (const value of root) {
    if (!Array.isArray(value)) continue;
    const kind = listHead(value);
    if (!kind || !graphicKinds.has(kind) || !isEdgeCuts(value)) continue;
    outlineElements += 1;

    if (kind === "gr_line" || kind === "gr_rect") {
      const start = pointFrom(child(value, "start"));
      const end = pointFrom(child(value, "end"));
      if (start && end) {
        includePoint(bounds, start);
        includePoint(bounds, end);
      } else unsupportedOutlineElements += 1;
      continue;
    }

    if (kind === "gr_circle") {
      const center = pointFrom(child(value, "center"));
      const end = pointFrom(child(value, "end"));
      if (center && end) {
        const radius = Math.hypot(end.x - center.x, end.y - center.y);
        includePoint(bounds, { x: center.x - radius, y: center.y - radius });
        includePoint(bounds, { x: center.x + radius, y: center.y + radius });
      } else unsupportedOutlineElements += 1;
      continue;
    }

    if (kind === "gr_arc") {
      const start = pointFrom(child(value, "start"));
      const middle = pointFrom(child(value, "mid"));
      const end = pointFrom(child(value, "end"));
      if (start && middle && end) includeArcBounds(bounds, start, middle, end);
      else unsupportedOutlineElements += 1;
      continue;
    }

    if (kind === "gr_poly") {
      const points = child(value, "pts");
      const polygonPoints = points ? children(points, "xy").map(pointFrom) : [];
      const validPoints = polygonPoints.filter((point): point is Point => point !== null);
      if (validPoints.length >= 3) validPoints.forEach((point) => includePoint(bounds, point));
      else unsupportedOutlineElements += 1;
      continue;
    }

    unsupportedOutlineElements += 1;
  }

  if (
    outlineElements === 0 ||
    !Number.isFinite(bounds.minX) ||
    bounds.maxX <= bounds.minX ||
    bounds.maxY <= bounds.minY
  ) {
    throw new Error("未找到有效的 Edge.Cuts 板框");
  }

  return { bounds, outlineElements, unsupportedOutlineElements };
}

function extractMountingHoles(root: SList): PcbMountingHole[] {
  const holes: PcbMountingHole[] = [];
  for (const footprint of children(root, "footprint")) {
    const footprintName = atom(footprint[1]) ?? "";
    const footprintAt = child(footprint, "at");
    const origin = pointFrom(footprintAt) ?? { x: 0, y: 0 };
    const rotation = ((numeric(footprintAt?.[3]) ?? 0) * Math.PI) / 180;

    for (const pad of children(footprint, "pad")) {
      const padType = atom(pad[2]);
      const isMountingHole =
        padType === "np_thru_hole" ||
        (padType === "thru_hole" && /mounting.?hole/i.test(footprintName));
      if (!isMountingHole) continue;
      const local = pointFrom(child(pad, "at")) ?? { x: 0, y: 0 };
      const drill = child(pad, "drill");
      const drillValues = drill
        ? drill.slice(1).map(numeric).filter((value): value is number => value !== null)
        : [];
      const diameter = drillValues.length > 0 ? Math.min(...drillValues) : null;
      if (diameter === null || diameter <= 0) continue;
      const x =
        origin.x + local.x * Math.cos(rotation) - local.y * Math.sin(rotation);
      const y =
        origin.y + local.x * Math.sin(rotation) + local.y * Math.cos(rotation);
      if (
        !holes.some(
          (hole) => Math.hypot(hole.x - x, hole.y - y) < 0.01,
        )
      ) {
        holes.push({ x, y, diameter });
      }
    }
  }
  return holes;
}

export function parseKicadPcb(source: string, sourceName: string): PcbReference {
  const parsed = parseSExpression(source);
  if (parsed instanceof Error) {
    const location =
      "line" in parsed && parsed.line
        ? `（第 ${String(parsed.line)} 行）`
        : "";
    throw new Error(`KiCad 文件语法错误${location}: ${parsed.message}`);
  }
  if (!Array.isArray(parsed) || listHead(parsed) !== "kicad_pcb") {
    throw new Error("文件不是 KiCad PCB 文档");
  }

  const outline = extractOutline(parsed);
  const general = child(parsed, "general");
  const thickness = numeric(child(general ?? [], "thickness")?.[1]) ?? 1.6;
  const version = atom(child(parsed, "version")?.[1]);

  return {
    format: "kicad_pcb",
    sourceName,
    version,
    thickness,
    ...outline,
    mountingHoles: extractMountingHoles(parsed),
  };
}
