import { describe, expect, it } from "vitest";
import { serializeBinaryStl } from "./binaryStl";

describe("binary STL serializer", () => {
  it("writes triangle count, vertices and a normalized face normal", () => {
    const buffer = serializeBinaryStl(
      {
        numProp: 3,
        vertProperties: new Float32Array([
          0, 0, 0,
          10, 0, 0,
          0, 10, 0,
        ]),
        triVerts: new Uint32Array([0, 1, 2]),
      },
      "test",
    );
    const view = new DataView(buffer);

    expect(buffer.byteLength).toBe(134);
    expect(view.getUint32(80, true)).toBe(1);
    expect(view.getFloat32(84, true)).toBeCloseTo(0);
    expect(view.getFloat32(88, true)).toBeCloseTo(0);
    expect(view.getFloat32(92, true)).toBeCloseTo(1);
    expect(view.getFloat32(108, true)).toBeCloseTo(10);
  });

  it("rejects malformed triangle indices", () => {
    expect(() =>
      serializeBinaryStl(
        {
          numProp: 3,
          vertProperties: new Float32Array([0, 0, 0]),
          triVerts: new Uint32Array([0, 0]),
        },
        "invalid",
      ),
    ).toThrow("divisible by three");
  });
});

