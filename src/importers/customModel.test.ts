import { describe, expect, it } from "vitest";
import { getPreviewSize } from "../domain/customComponents";
import { importCustomModel } from "./customModel";

function encode(source: string): ArrayBuffer {
  return new TextEncoder().encode(source).buffer as ArrayBuffer;
}

describe("custom model importer", () => {
  it("imports and centers an OBJ mesh", async () => {
    const preview = await importCustomModel(
      encode([
        "v 0 0 0",
        "v 10 0 0",
        "v 0 8 0",
        "v 0 0 6",
        "f 1 2 3",
        "f 1 4 2",
        "f 1 3 4",
        "f 2 4 3",
      ].join("\n")),
      "part.obj",
    );

    expect(preview.meshes).toHaveLength(1);
    expect(getPreviewSize(preview)).toEqual([10, 8, 6]);
  });

  it("imports an ASCII STL mesh", async () => {
    const triangle = (a: string, b: string, c: string) => [
      "facet normal 0 0 1",
      "outer loop",
      `vertex ${a}`,
      `vertex ${b}`,
      `vertex ${c}`,
      "endloop",
      "endfacet",
    ].join("\n");
    const source = [
      "solid tetrahedron",
      triangle("0 0 0", "10 0 0", "0 8 0"),
      triangle("0 0 0", "0 0 6", "10 0 0"),
      triangle("0 0 0", "0 8 0", "0 0 6"),
      triangle("10 0 0", "0 0 6", "0 8 0"),
      "endsolid tetrahedron",
    ].join("\n");
    const preview = await importCustomModel(encode(source), "part.stl");

    expect(preview.meshes).toHaveLength(1);
    expect(getPreviewSize(preview)).toEqual([10, 8, 6]);
  });
});
