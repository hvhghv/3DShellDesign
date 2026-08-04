export interface TriangleMeshData {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

function writeVector(
  view: DataView,
  offset: number,
  x: number,
  y: number,
  z: number,
): number {
  view.setFloat32(offset, x, true);
  view.setFloat32(offset + 4, y, true);
  view.setFloat32(offset + 8, z, true);
  return offset + 12;
}

export function serializeBinaryStl(
  mesh: TriangleMeshData,
  label: string,
): ArrayBuffer {
  const triangleCount = mesh.triVerts.length / 3;
  if (!Number.isInteger(triangleCount)) {
    throw new Error("Triangle index count must be divisible by three");
  }
  if (mesh.numProp < 3) {
    throw new Error("Mesh vertices must contain XYZ properties");
  }

  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const header = new TextEncoder().encode(`3DShellDesigner ${label}`);
  bytes.set(header.subarray(0, 80), 0);
  view.setUint32(80, triangleCount, true);
  let offset = 84;

  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const indices = [
      mesh.triVerts[triangle * 3],
      mesh.triVerts[triangle * 3 + 1],
      mesh.triVerts[triangle * 3 + 2],
    ];
    const vertices = indices.map((index) => {
      const start = index * mesh.numProp;
      return [
        mesh.vertProperties[start],
        mesh.vertProperties[start + 1],
        mesh.vertProperties[start + 2],
      ] as const;
    });
    const edgeA = [
      vertices[1][0] - vertices[0][0],
      vertices[1][1] - vertices[0][1],
      vertices[1][2] - vertices[0][2],
    ];
    const edgeB = [
      vertices[2][0] - vertices[0][0],
      vertices[2][1] - vertices[0][1],
      vertices[2][2] - vertices[0][2],
    ];
    let normalX = edgeA[1] * edgeB[2] - edgeA[2] * edgeB[1];
    let normalY = edgeA[2] * edgeB[0] - edgeA[0] * edgeB[2];
    let normalZ = edgeA[0] * edgeB[1] - edgeA[1] * edgeB[0];
    const normalLength = Math.hypot(normalX, normalY, normalZ);
    if (normalLength > 0) {
      normalX /= normalLength;
      normalY /= normalLength;
      normalZ /= normalLength;
    }

    offset = writeVector(view, offset, normalX, normalY, normalZ);
    for (const vertex of vertices) {
      offset = writeVector(view, offset, vertex[0], vertex[1], vertex[2]);
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  return buffer;
}

