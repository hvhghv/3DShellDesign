import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { createThreeMfArchive } from "./threeMf";

const triangle = {
  numProp: 3,
  vertProperties: new Float32Array([0, 0, 0, 10, 0, 0, 0, 8, 0]),
  triVerts: new Uint32Array([0, 1, 2]),
};

describe("3MF serializer", () => {
  it("writes a millimeter package with independent materials and layout items", () => {
    const archive = createThreeMfArchive("控制器 & 外壳", [
      { name: "下壳", materialName: "PETG", color: "#c8d3cf", mesh: triangle },
      { name: "顶盖", materialName: "PETG", color: "#c8d3cf", mesh: triangle },
    ]);
    const files = unzipSync(new Uint8Array(archive));
    expect(Object.keys(files).sort()).toEqual([
      "3D/3dmodel.model",
      "[Content_Types].xml",
      "_rels/.rels",
    ]);
    const model = strFromU8(files["3D/3dmodel.model"]);
    expect(model).toContain('<model unit="millimeter"');
    expect(model).toContain("控制器 &amp; 外壳");
    expect(model.match(/<object /g)).toHaveLength(2);
    expect(model.match(/<item /g)).toHaveLength(2);
    expect(model).toContain('displaycolor="#C8D3CFFF"');
    expect(model).toContain('transform="1 0 0 0 1 0 0 0 1 5 5 0"');
    expect(model).toContain('transform="1 0 0 0 1 0 0 0 1 25 5 0"');
  });

  it("rejects triangle indices outside the vertex table", () => {
    expect(() =>
      createThreeMfArchive("invalid", [
        {
          name: "part",
          materialName: "PLA",
          color: "#ffffff",
          mesh: { ...triangle, triVerts: new Uint32Array([0, 1, 3]) },
        },
      ]),
    ).toThrow("unknown vertex");
  });
});
