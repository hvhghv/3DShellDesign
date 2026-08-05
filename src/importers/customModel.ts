import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { StepPreview, StepPreviewMesh } from "../domain/model";
import { importStepReference } from "./stepWorkerClient";

interface SourceMesh {
  name: string;
  geometry: THREE.BufferGeometry;
  color: readonly [number, number, number];
}

function materialColor(material: THREE.Material | THREE.Material[]): readonly [number, number, number] {
  const candidate = Array.isArray(material) ? material[0] : material;
  if (candidate && "color" in candidate && candidate.color instanceof THREE.Color) {
    return [candidate.color.r, candidate.color.g, candidate.color.b];
  }
  return [0.31, 0.5, 0.42];
}

function previewFromMeshes(meshes: SourceMesh[]): StepPreview {
  if (meshes.length === 0) throw new Error("模型中没有可显示的三角网格");
  const minimum = new THREE.Vector3(Infinity, Infinity, Infinity);
  const maximum = new THREE.Vector3(-Infinity, -Infinity, -Infinity);

  for (const mesh of meshes) {
    const positions = mesh.geometry.getAttribute("position");
    if (!positions) continue;
    for (let index = 0; index < positions.count; index += 1) {
      minimum.min(new THREE.Vector3().fromBufferAttribute(positions, index));
      maximum.max(new THREE.Vector3().fromBufferAttribute(positions, index));
    }
  }
  const size = maximum.clone().sub(minimum);
  if (![size.x, size.y, size.z].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("模型包围盒无效");
  }
  const centerX = (minimum.x + maximum.x) / 2;
  const centerZ = (minimum.z + maximum.z) / 2;

  const previewMeshes: StepPreviewMesh[] = meshes.map((mesh, meshIndex) => {
    const positionAttribute = mesh.geometry.getAttribute("position");
    const normalAttribute = mesh.geometry.getAttribute("normal");
    const positions = new Float32Array(positionAttribute.count * 3);
    for (let index = 0; index < positionAttribute.count; index += 1) {
      positions[index * 3] = positionAttribute.getX(index) - centerX;
      positions[index * 3 + 1] = positionAttribute.getY(index) - minimum.y;
      positions[index * 3 + 2] = positionAttribute.getZ(index) - centerZ;
    }
    const normals = normalAttribute
      ? new Float32Array(normalAttribute.array as ArrayLike<number>)
      : null;
    const sourceIndex = mesh.geometry.getIndex();
    const indices = sourceIndex
      ? new Uint32Array(sourceIndex.array as ArrayLike<number>)
      : Uint32Array.from({ length: positionAttribute.count }, (_, index) => index);
    return {
      name: mesh.name || `网格 ${meshIndex + 1}`,
      color: mesh.color,
      positions,
      normals,
      indices,
    };
  });

  meshes.forEach((mesh) => mesh.geometry.dispose());
  return { meshes: previewMeshes, size: [size.x, size.y, size.z] };
}

function importStl(buffer: ArrayBuffer, sourceName: string): StepPreview {
  const geometry = new STLLoader().parse(buffer);
  geometry.computeVertexNormals();
  return previewFromMeshes([
    { name: sourceName, geometry, color: [0.31, 0.5, 0.42] },
  ]);
}

function importObj(buffer: ArrayBuffer): StepPreview {
  const object = new OBJLoader().parse(new TextDecoder().decode(buffer));
  object.updateMatrixWorld(true);
  const meshes: SourceMesh[] = [];
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const geometry = child.geometry.clone();
    geometry.applyMatrix4(child.matrixWorld);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    meshes.push({
      name: child.name,
      geometry,
      color: materialColor(child.material),
    });
  });
  return previewFromMeshes(meshes);
}

export async function importCustomModel(
  buffer: ArrayBuffer,
  sourceName: string,
): Promise<StepPreview> {
  const extension = sourceName.split(".").pop()?.toLocaleLowerCase();
  if (extension === "step" || extension === "stp") {
    return (await importStepReference(buffer, sourceName, 1.6)).preview;
  }
  if (extension === "stl") return importStl(buffer, sourceName);
  if (extension === "obj") return importObj(buffer);
  throw new Error("自定义模型仅支持 STEP、STP、STL 或 OBJ");
}
