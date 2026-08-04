declare module "occt-import-js" {
  export interface OcctMesh {
    name: string;
    color?: [number, number, number];
    attributes: {
      position: { array: number[] };
      normal?: { array: number[] };
    };
    index: { array: number[] };
  }

  export interface OcctImportResult {
    success: boolean;
    meshes: OcctMesh[];
  }

  export interface OcctModule {
    ReadStepFile(
      content: Uint8Array,
      params: {
        linearUnit: "millimeter";
        linearDeflectionType: "bounding_box_ratio" | "absolute_value";
        linearDeflection: number;
        angularDeflection: number;
      },
    ): OcctImportResult;
  }

  export default function createOcctModule(options?: {
    locateFile?: (path: string) => string;
  }): Promise<OcctModule>;
}

declare module "occt-import-js/dist/occt-import-js.wasm?url" {
  const url: string;
  export default url;
}
