import { strToU8, zipSync } from "fflate";
import type { TriangleMeshData } from "../geometry/binaryStl";

export interface ThreeMfPart {
  name: string;
  materialName: string;
  color: string;
  mesh: TriangleMeshData;
}

interface MeshBounds {
  minX: number;
  minY: number;
  minZ: number;
  width: number;
}

const CORE_NAMESPACE =
  "http://schemas.microsoft.com/3dmanufacturing/core/2015/02";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function format(value: number): string {
  return Number(value.toFixed(5)).toString();
}

function displayColor(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color.toUpperCase()}FF` : "#BFC4C2FF";
}

function getBounds(mesh: TriangleMeshData): MeshBounds {
  if (mesh.numProp < 3 || mesh.vertProperties.length < mesh.numProp) {
    throw new Error("3MF mesh must contain XYZ vertices");
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  for (let offset = 0; offset < mesh.vertProperties.length; offset += mesh.numProp) {
    minX = Math.min(minX, mesh.vertProperties[offset]);
    maxX = Math.max(maxX, mesh.vertProperties[offset]);
    minY = Math.min(minY, mesh.vertProperties[offset + 1]);
    minZ = Math.min(minZ, mesh.vertProperties[offset + 2]);
  }
  return { minX, minY, minZ, width: maxX - minX };
}

function meshXml(mesh: TriangleMeshData): string {
  if (mesh.triVerts.length % 3 !== 0) {
    throw new Error("3MF triangle index count must be divisible by three");
  }
  const vertexCount = mesh.vertProperties.length / mesh.numProp;
  if (!Number.isInteger(vertexCount)) {
    throw new Error("3MF vertex properties are malformed");
  }
  const vertices: string[] = [];
  for (let index = 0; index < vertexCount; index += 1) {
    const offset = index * mesh.numProp;
    vertices.push(
      `        <vertex x="${format(mesh.vertProperties[offset])}" y="${format(mesh.vertProperties[offset + 1])}" z="${format(mesh.vertProperties[offset + 2])}"/>`,
    );
  }
  const triangles: string[] = [];
  for (let offset = 0; offset < mesh.triVerts.length; offset += 3) {
    const v1 = mesh.triVerts[offset];
    const v2 = mesh.triVerts[offset + 1];
    const v3 = mesh.triVerts[offset + 2];
    if (v1 >= vertexCount || v2 >= vertexCount || v3 >= vertexCount) {
      throw new Error("3MF triangle references an unknown vertex");
    }
    triangles.push(`        <triangle v1="${v1}" v2="${v2}" v3="${v3}"/>`);
  }
  return [
    "      <mesh>",
    "        <vertices>",
    ...vertices,
    "        </vertices>",
    "        <triangles>",
    ...triangles,
    "        </triangles>",
    "      </mesh>",
  ].join("\n");
}

export function createThreeMfArchive(
  projectName: string,
  parts: ThreeMfPart[],
): ArrayBuffer {
  if (parts.length === 0) throw new Error("3MF layout requires at least one part");

  const materialXml = parts.map(
    (part) =>
      `      <base name="${escapeXml(part.materialName)}" displaycolor="${displayColor(part.color)}"/>`,
  );
  const objectXml = parts.map((part, index) =>
    [
      `    <object id="${index + 1}" type="model" name="${escapeXml(part.name)}" pid="1" pindex="${index}">`,
      meshXml(part.mesh),
      "    </object>",
    ].join("\n"),
  );

  let cursorX = 5;
  const buildXml = parts.map((part, index) => {
    const bounds = getBounds(part.mesh);
    const translateX = cursorX - bounds.minX;
    const translateY = 5 - bounds.minY;
    const translateZ = -bounds.minZ;
    cursorX += bounds.width + 10;
    return `    <item objectid="${index + 1}" transform="1 0 0 0 1 0 0 0 1 ${format(translateX)} ${format(translateY)} ${format(translateZ)}"/>`;
  });

  const model = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<model unit="millimeter" xml:lang="zh-CN" xmlns="${CORE_NAMESPACE}">`,
    `  <metadata name="Title">${escapeXml(projectName)}</metadata>`,
    '  <metadata name="Designer">3DShellDesigner</metadata>',
    "  <resources>",
    '    <basematerials id="1">',
    ...materialXml,
    "    </basematerials>",
    ...objectXml,
    "  </resources>",
    "  <build>",
    ...buildXml,
    "  </build>",
    "</model>",
    "",
  ].join("\n");
  const contentTypes = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>',
    "</Types>",
    "",
  ].join("\n");
  const relationships = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    `  <Relationship Target="/3D/3dmodel.model" Id="rel0" Type="${CORE_NAMESPACE}/3dmodel"/>`,
    "</Relationships>",
    "",
  ].join("\n");
  const archive = zipSync(
    {
      "[Content_Types].xml": strToU8(contentTypes),
      "_rels/.rels": strToU8(relationships),
      "3D/3dmodel.model": strToU8(model),
    },
    { level: 6 },
  );
  const copy = new Uint8Array(archive.byteLength);
  copy.set(archive);
  return copy.buffer;
}
