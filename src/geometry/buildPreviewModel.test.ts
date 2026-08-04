import { describe, expect, it } from "vitest";
import { DEFAULT_PARAMETERS } from "../domain/enclosure";
import type { SelectablePart } from "../domain/model";
import { buildPreviewModel, disposePreviewModel } from "./buildPreviewModel";

function renderedParts(focusedPart: SelectablePart | null): Set<SelectablePart> {
  const model = buildPreviewModel(
    DEFAULT_PARAMETERS,
    focusedPart ?? "project",
    false,
    null,
    null,
    focusedPart,
  );
  const parts = new Set(
    model.children
      .map((child) => child.userData.partId as SelectablePart | undefined)
      .filter((part): part is SelectablePart => Boolean(part)),
  );
  disposePreviewModel(model);
  return parts;
}

describe("preview focus mode", () => {
  it("keeps only the focused lid", () => {
    expect([...renderedParts("lid")]).toEqual(["lid"]);
  });

  it("keeps only the focused base", () => {
    expect([...renderedParts("base")]).toEqual(["base"]);
  });

  it("renders the full assembly after showing all", () => {
    expect(renderedParts(null)).toEqual(
      new Set(["base", "lid", "panel", "pcb", "connector"]),
    );
  });
});
