import { useEffect, useRef } from "react";
import { Eye, Focus, Move3D, Scaling, X } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { buildPreviewModel, disposePreviewModel } from "../geometry/buildPreviewModel";
import { getPcbRailMovementAxis } from "../domain/pcbRailDirection";
import {
  useDesignerStore,
  type TransformAxisConstraint,
  type TransformMode,
} from "../store/designerStore";
import type { DesignerParameters, EnclosureFace, SelectablePart } from "../domain/model";
import { SELECTABLE_PART_LABELS } from "../domain/parts";
import { getPlacementSurfaceOffsets } from "../domain/placements";

type EditableViewportPart =
  | "pcb"
  | "panel"
  | "connector"
  | "antenna"
  | "custom"
  | "battery";

function isEditableViewportPart(part: SelectablePart): part is EditableViewportPart {
  return (
    part === "pcb" ||
    part === "panel" ||
    part === "connector" ||
    part === "antenna" ||
    part === "custom" ||
    part === "battery"
  );
}

function canScalePart(part: SelectablePart): boolean {
  return part === "panel" || part === "custom";
}

function canScaleFeatureKind(featureKind: string | undefined): boolean {
  return featureKind === "panel" || featureKind === "custom";
}

function getEffectiveTransformMode(
  requestedMode: TransformMode,
  scalable: boolean,
): TransformMode {
  return requestedMode === "scale" && scalable ? "scale" : "move";
}

function isShortcutInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest("input, textarea, select, button, [contenteditable='true']"),
  );
}

function getEditableFeature(object: THREE.Object3D | null): THREE.Object3D | null {
  let current = object;
  while (current) {
    if (
      current instanceof THREE.Group &&
      typeof current.userData.featureId === "string" &&
      (current.userData.featureKind === "panel" ||
        current.userData.featureKind === "connector" ||
        current.userData.featureKind === "antenna" ||
        current.userData.featureKind === "pcb" ||
        current.userData.featureKind === "custom" ||
        current.userData.featureKind === "battery")
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function findEditableFeature(
  root: THREE.Object3D,
  featureId: string,
  featureKind:
    | "pcb"
    | "panel"
    | "connector"
    | "antenna"
    | "custom"
    | "battery",
): THREE.Object3D | null {
  let result: THREE.Object3D | null = null;
  root.traverse((child) => {
    if (
      !result &&
      child instanceof THREE.Group &&
      child.userData.featureId === featureId &&
      child.userData.featureKind === featureKind
    ) {
      result = child;
    }
  });
  return result;
}

function getSurfaceCoordinates(
  face: EnclosureFace,
  position: THREE.Vector3,
  baseHeight: number,
): readonly [number, number] {
  if (face === "top" || face === "bottom") return [position.x, position.z];
  if (face === "left" || face === "right") {
    return [position.z, position.y - baseHeight / 2];
  }
  return [position.x, position.y - baseHeight / 2];
}

function getSurfaceScale(
  face: EnclosureFace,
  scale: THREE.Vector3,
): readonly [number, number] {
  if (face === "top" || face === "bottom") return [scale.x, scale.z];
  if (face === "left" || face === "right") return [scale.z, scale.y];
  return [scale.x, scale.y];
}

function roundMeasurement(value: number): number {
  return Number(value.toFixed(2));
}

function configureTransformAxes(
  controls: TransformControls,
  face: EnclosureFace,
): void {
  controls.showX = face !== "left" && face !== "right";
  controls.showY = face !== "top" && face !== "bottom";
  controls.showZ =
    face === "top" || face === "bottom" || face === "left" || face === "right";
  controls.showXY = controls.showX && controls.showY;
  controls.showYZ = controls.showY && controls.showZ;
  controls.showXZ = controls.showX && controls.showZ;
}

function configureAllTransformAxes(controls: TransformControls): void {
  controls.showX = true;
  controls.showY = true;
  controls.showZ = true;
  controls.showXY = true;
  controls.showYZ = true;
  controls.showXZ = true;
}

function configurePcbTransformAxes(
  controls: TransformControls,
  railMovementAxis: "x" | "z" | null,
): void {
  if (railMovementAxis === null) {
    configureAllTransformAxes(controls);
    return;
  }
  controls.showX = railMovementAxis === "x";
  controls.showY = false;
  controls.showZ = railMovementAxis === "z";
  controls.showXY = false;
  controls.showYZ = false;
  controls.showXZ = false;
}

function applyAxisConstraint(
  controls: TransformControls,
  axis: TransformAxisConstraint,
): void {
  if (axis === "all") return;
  if (
    (axis === "x" && !controls.showX) ||
    (axis === "y" && !controls.showY) ||
    (axis === "z" && !controls.showZ)
  ) {
    return;
  }
  const allowX = controls.showX;
  const allowY = controls.showY;
  const allowZ = controls.showZ;
  controls.showX = axis === "x" && allowX;
  controls.showY = axis === "y" && allowY;
  controls.showZ = axis === "z" && allowZ;
  controls.showXY = false;
  controls.showYZ = false;
  controls.showXZ = false;
}

function isAxisAvailableOnFace(
  face: EnclosureFace,
  axis: TransformAxisConstraint,
): boolean {
  if (axis === "all") return true;
  if (face === "top" || face === "bottom") return axis === "x" || axis === "z";
  if (face === "left" || face === "right") return axis === "y" || axis === "z";
  return axis === "x" || axis === "y";
}

function getPcbFeatureRotation(
  parameters: Pick<DesignerParameters, "pcbReferences">,
  selectedFeatureId: string | null,
): number {
  if (!selectedFeatureId) return 0;
  return (
    parameters.pcbReferences.find((placement) => placement.id === selectedFeatureId)
      ?.rotation ?? 0
  );
}

function canUseAxisConstraint(
  axis: TransformAxisConstraint,
  selectedPart: SelectablePart,
  selectedFeatureId: string | null,
  model: THREE.Object3D | null,
  parameters: Pick<
    DesignerParameters,
    | "lidFace"
    | "pcbInsertionSide"
    | "pcbMountingType"
    | "pcbRailAxis"
    | "pcbReferences"
  >,
): boolean {
  if (axis === "all") return true;
  if (selectedPart === "pcb") {
    const railMovementAxis = getPcbRailMovementAxis(
      parameters,
      getPcbFeatureRotation(parameters, selectedFeatureId),
    );
    return railMovementAxis === null ? true : axis === railMovementAxis;
  }
  if (selectedPart === "custom") return true;
  if (!selectedFeatureId || !isEditableViewportPart(selectedPart)) return false;
  const feature = model
    ? findEditableFeature(model, selectedFeatureId, selectedPart)
    : null;
  const face = feature?.userData.face as EnclosureFace | undefined;
  return face ? isAxisAvailableOnFace(face, axis) : true;
}

function commitFeatureTransform(object: THREE.Object3D): void {
  const state = useDesignerStore.getState();
  const featureId = object.userData.featureId as string | undefined;
  const featureKind = object.userData.featureKind as string | undefined;
  const face = object.userData.face as EnclosureFace | undefined;
  if (!featureId) return;
  const effectiveTransformMode = getEffectiveTransformMode(
    state.transformMode,
    canScaleFeatureKind(featureKind),
  );

  if (featureKind === "pcb") {
    state.updatePcbReferencePlacement(featureId, {
      offsetX: object.position.x,
      offsetZ: object.position.z,
      elevation:
        object.position.y -
        state.parameters.bottomThickness -
        state.parameters.standoffHeight,
    });
    return;
  }

  if (featureKind === "custom") {
    if (effectiveTransformMode === "move") {
      state.updateCustomComponent(featureId, {
        positionX: object.position.x,
        positionY: object.position.y,
        positionZ: object.position.z,
      });
    } else {
      const baseWidth = Number(object.userData.baseWidth);
      const baseHeight = Number(object.userData.baseHeight);
      const baseDepth = Number(object.userData.baseDepth);
      if (
        Number.isFinite(baseWidth) &&
        Number.isFinite(baseHeight) &&
        Number.isFinite(baseDepth)
      ) {
        state.updateCustomComponent(featureId, {
          width: roundMeasurement(baseWidth * Math.abs(object.scale.x)),
          height: roundMeasurement(baseHeight * Math.abs(object.scale.y)),
          depth: roundMeasurement(baseDepth * Math.abs(object.scale.z)),
        });
      }
    }
    return;
  }

  if (featureKind === "battery") {
    if (face) {
      const [offsetX, offsetZ] = getSurfaceCoordinates(
        face,
        object.position,
        state.parameters.baseHeight,
      );
      state.updateBatteryCompartment(featureId, { offsetX, offsetZ });
      return;
    }
    state.updateBatteryCompartment(featureId, {
      offsetX: object.position.x,
      offsetZ: object.position.z,
    });
    return;
  }

  if (!face) return;

  if (effectiveTransformMode === "move") {
    let [offsetU, offsetV] = getSurfaceCoordinates(
      face,
      object.position,
      state.parameters.baseHeight,
    );
    if (featureKind === "connector") {
      const connector = state.parameters.connectorPlacements.find(
        (placement) => placement.id === featureId,
      );
      if (!connector) return;
      [offsetU, offsetV] = getPlacementSurfaceOffsets(
        connector,
        state.parameters,
        offsetU,
        offsetV,
      );
      state.updateConnectorPlacement(featureId, { offsetU, offsetV });
    } else if (featureKind === "antenna") {
      const antenna = state.parameters.antennaPlacements.find(
        (placement) => placement.id === featureId,
      );
      if (!antenna) return;
      [offsetU, offsetV] = getPlacementSurfaceOffsets(
        antenna,
        state.parameters,
        offsetU,
        offsetV,
      );
      state.updateAntennaPlacement(featureId, { offsetU, offsetV });
    } else if (featureKind === "panel") {
      state.updatePanelPlacement(featureId, { offsetU, offsetV });
    }
    return;
  }

  const [scaleU, scaleV] = getSurfaceScale(face, object.scale);
  const baseWidth = Number(object.userData.baseWidth);
  const baseHeight = Number(object.userData.baseHeight);
  if (!Number.isFinite(baseWidth) || !Number.isFinite(baseHeight)) return;
  if (featureKind === "panel") {
    state.updatePanelPlacement(featureId, {
      width: roundMeasurement(baseWidth * Math.abs(scaleU)),
      height: roundMeasurement(baseHeight * Math.abs(scaleV)),
    });
  } else if (featureKind === "connector") {
    const connector = state.parameters.connectorPlacements.find(
      (placement) => placement.id === featureId,
    );
    if (!connector) return;
    const definitionIsCircular = Boolean(object.userData.uniformScale);
    let surfaceWidth = baseWidth * Math.abs(scaleU);
    let surfaceHeight = baseHeight * Math.abs(scaleV);
    if (definitionIsCircular) {
      const factor =
        Math.abs(scaleU - 1) >= Math.abs(scaleV - 1)
          ? Math.abs(scaleU)
          : Math.abs(scaleV);
      surfaceWidth = baseWidth * factor;
      surfaceHeight = surfaceWidth;
    }
    const quarterTurn = connector.rotation === 90 || connector.rotation === 270;
    state.updateConnectorPlacement(featureId, {
      cutoutWidth: roundMeasurement(quarterTurn ? surfaceHeight : surfaceWidth),
      cutoutHeight: roundMeasurement(quarterTurn ? surfaceWidth : surfaceHeight),
    });
  }
}

function fitCamera(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
): void {
  const bounds = new THREE.Box3().setFromObject(object);
  if (bounds.isEmpty()) return;

  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  const distance = Math.max(80, maxDimension * 1.55);
  const direction = new THREE.Vector3(1.05, 0.82, 1.2).normalize();

  controls.target.copy(center);
  camera.position.copy(center).add(direction.multiplyScalar(distance));
  camera.near = Math.max(0.1, distance / 100);
  camera.far = distance * 12;
  camera.updateProjectionMatrix();
  controls.update();
}

export function Viewport() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const attachedFeatureRef = useRef<THREE.Object3D | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const didInitialFit = useRef(false);
  const previousFocus = useRef<SelectablePart | null>(null);
  const parameters = useDesignerStore((state) => state.parameters);
  const pcbReference = useDesignerStore((state) => state.pcbReference);
  const stepPreview = useDesignerStore((state) => state.stepPreview);
  const pcbPreviews = useDesignerStore((state) => state.pcbPreviews);
  const customComponentPreviews = useDesignerStore(
    (state) => state.customComponentPreviews,
  );
  const lidTransparent = useDesignerStore((state) => state.lidTransparent);
  const transparentObjectIds = useDesignerStore(
    (state) => state.transparentObjectIds,
  );
  const hiddenFaces = useDesignerStore((state) => state.hiddenFaces);
  const hiddenFeatureIds = useDesignerStore((state) => state.hiddenFeatureIds);
  const hiddenPcbBodyIds = useDesignerStore((state) => state.hiddenPcbBodyIds);
  const lockedFeatureIds = useDesignerStore((state) => state.lockedFeatureIds);
  const selectedPart = useDesignerStore((state) => state.selectedPart);
  const selectedFeatureId = useDesignerStore((state) => state.selectedFeatureId);
  const transformMode = useDesignerStore((state) => state.transformMode);
  const transformEditMode = useDesignerStore((state) => state.transformEditMode);
  const transformAxisConstraint = useDesignerStore(
    (state) => state.transformAxisConstraint,
  );
  const focusedPart = useDesignerStore((state) => state.focusedPart);
  const setSelectedPart = useDesignerStore((state) => state.setSelectedPart);
  const setSelectedFeature = useDesignerStore((state) => state.setSelectedFeature);
  const setTransformMode = useDesignerStore((state) => state.setTransformMode);
  const setTransformEditMode = useDesignerStore(
    (state) => state.setTransformEditMode,
  );
  const focusSelectedPart = useDesignerStore((state) => state.focusSelectedPart);
  const showAllParts = useDesignerStore((state) => state.showAllParts);
  const showGrid = useDesignerStore((state) => state.showGrid);
  const exploded = useDesignerStore((state) => state.exploded);
  const cameraResetToken = useDesignerStore((state) => state.cameraResetToken);
  const selectedPartEditable = isEditableViewportPart(selectedPart);
  const selectedFeatureReadOnly = Boolean(
    selectedFeatureId &&
      (hiddenFeatureIds.includes(selectedFeatureId) ||
        lockedFeatureIds.includes(selectedFeatureId)),
  );
  const selectedFeatureEditable = Boolean(
    selectedFeatureId && selectedPartEditable && !selectedFeatureReadOnly,
  );
  const selectedFeatureScalable = canScalePart(selectedPart);
  const effectiveTransformMode = getEffectiveTransformMode(
    transformMode,
    selectedFeatureScalable,
  );

  useEffect(() => {
    const handleTransformShortcuts = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isShortcutInputTarget(event.target)
      ) {
        return;
      }

      const state = useDesignerStore.getState();
      const editable =
        Boolean(state.selectedFeatureId) &&
        isEditableViewportPart(state.selectedPart) &&
        !state.hiddenFeatureIds.includes(state.selectedFeatureId as string) &&
        !state.lockedFeatureIds.includes(state.selectedFeatureId as string);
      if (event.key === "Tab") {
        if (!editable) return;
        state.toggleTransformEditMode();
        event.preventDefault();
        return;
      }

      if (event.key === "Escape" && state.transformEditMode) {
        state.setTransformEditMode(false);
        event.preventDefault();
        return;
      }

      const key = event.key.toLocaleLowerCase();
      if (
        state.transformEditMode &&
        (key === "x" || key === "y" || key === "z")
      ) {
        const nextAxis = key as TransformAxisConstraint;
        if (
          !canUseAxisConstraint(
            nextAxis,
            state.selectedPart,
            state.selectedFeatureId,
            modelRef.current,
            state.parameters,
          )
        ) {
          event.preventDefault();
          return;
        }
        state.setTransformAxisConstraint(
          state.transformAxisConstraint === nextAxis ? "all" : nextAxis,
        );
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleTransformShortcuts);
    return () => window.removeEventListener("keydown", handleTransformShortcuts);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f3f0);
    scene.fog = new THREE.Fog(0xf1f3f0, 280, 680);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
    camera.position.set(130, 95, 145);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.setAttribute("aria-label", "3D 外壳设计视口");
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.screenSpacePanning = true;
    controls.minDistance = 28;
    controls.maxDistance = 900;
    controls.minPolarAngle = Math.PI * 0.03;
    controls.maxPolarAngle = Math.PI * 0.97;

    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setSpace("world");
    transformControls.setTranslationSnap(0.5);
    transformControls.setScaleSnap(0.05);
    transformControls.setSize(0.82);
    const transformHelper = transformControls.getHelper();
    scene.add(transformHelper);
    let transformWasDragging = false;
    const onDraggingChanged = (event: { value: unknown }) => {
      const dragging = Boolean(event.value);
      controls.enabled = !dragging;
      if (dragging) transformWasDragging = true;
      else if (transformWasDragging && attachedFeatureRef.current) {
        commitFeatureTransform(attachedFeatureRef.current);
      }
    };
    transformControls.addEventListener("dragging-changed", onDraggingChanged);

    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x9ca79f, 2.2);
    scene.add(hemisphere);

    const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
    keyLight.position.set(120, 180, 90);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.left = -180;
    keyLight.shadow.camera.right = 180;
    keyLight.shadow.camera.top = 180;
    keyLight.shadow.camera.bottom = -180;
    keyLight.shadow.bias = -0.00015;
    keyLight.shadow.normalBias = 0.65;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd9eee2, 1.35);
    fillLight.position.set(-100, 80, -120);
    scene.add(fillLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(900, 900),
      new THREE.ShadowMaterial({ color: 0x536059, opacity: 0.12 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(600, 60, 0xaeb5af, 0xd9ddd9);
    grid.position.y = 0.02;
    grid.userData.requestedVisible = useDesignerStore.getState().showGrid;
    scene.add(grid);

    let belowWorkPlane = false;
    const updateCameraState = () => {
      const polarAngle = controls.getPolarAngle();
      if (!belowWorkPlane && polarAngle > Math.PI / 2 + 0.035) {
        belowWorkPlane = true;
      } else if (belowWorkPlane && polarAngle < Math.PI / 2 - 0.035) {
        belowWorkPlane = false;
      }
      host.dataset.cameraPolarAngle = controls.getPolarAngle().toFixed(4);
      host.dataset.cameraBelowWorkPlane = String(belowWorkPlane);
      ground.visible = !belowWorkPlane;
      grid.visible = Boolean(grid.userData.requestedVisible) && !belowWorkPlane;
    };
    controls.addEventListener("change", updateCameraState);
    updateCameraState();

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown = { x: 0, y: 0 };

    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };

    const onPointerUp = (event: PointerEvent) => {
      if (transformWasDragging) {
        transformWasDragging = false;
        return;
      }
      const moved = Math.hypot(
        event.clientX - pointerDown.x,
        event.clientY - pointerDown.y,
      );
      if (moved > 4 || !modelRef.current) return;

      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(modelRef.current.children, true);
      const hit = hits.find((candidate) => candidate.object instanceof THREE.Mesh);
      const feature = getEditableFeature(hit?.object ?? null);
      if (feature) {
        setSelectedFeature(
          feature.userData.featureKind as
            | "pcb"
            | "panel"
            | "connector"
            | "antenna"
            | "custom"
            | "battery",
          feature.userData.featureId as string,
        );
        return;
      }
      const partId = hit?.object.userData.partId;
      if (typeof partId === "string") {
        setSelectedPart(partId as SelectablePart);
      } else {
        setSelectedPart("project");
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);

    let animationFrame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;
    transformControlsRef.current = transformControls;
    gridRef.current = grid;

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.removeEventListener("change", updateCameraState);
      controls.dispose();
      transformControls.removeEventListener("dragging-changed", onDraggingChanged);
      transformControls.detach();
      scene.remove(transformHelper);
      transformControls.dispose();
      renderer.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      grid.geometry.dispose();
      if (Array.isArray(grid.material)) {
        grid.material.forEach((material) => material.dispose());
      } else {
        grid.material.dispose();
      }
      host.removeChild(renderer.domElement);
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
      transformControlsRef.current = null;
      attachedFeatureRef.current = null;
      gridRef.current = null;
    };
  }, [setSelectedFeature, setSelectedPart]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (modelRef.current) {
      scene.remove(modelRef.current);
      disposePreviewModel(modelRef.current);
    }
    const model = buildPreviewModel(
      parameters,
      selectedPart,
      exploded,
      pcbReference,
      stepPreview,
      focusedPart,
      selectedFeatureId,
      pcbPreviews,
      customComponentPreviews,
      lidTransparent,
      hiddenFaces,
      hiddenFeatureIds,
      transparentObjectIds,
      hiddenPcbBodyIds,
    );
    scene.add(model);
    modelRef.current = model;

    const transformControls = transformControlsRef.current;
    if (
      transformControls &&
      transformEditMode &&
      selectedFeatureId &&
      !hiddenFeatureIds.includes(selectedFeatureId) &&
      !lockedFeatureIds.includes(selectedFeatureId) &&
      selectedPartEditable
    ) {
      const feature = findEditableFeature(model, selectedFeatureId, selectedPart);
      if (feature) {
        attachedFeatureRef.current = feature;
        transformControls.setMode(
          effectiveTransformMode === "scale" ? "scale" : "translate",
        );
        if (selectedPart === "battery") {
          configureTransformAxes(
            transformControls,
            feature.userData.face as EnclosureFace,
          );
        } else if (selectedPart === "pcb") {
          configurePcbTransformAxes(
            transformControls,
            getPcbRailMovementAxis(
              parameters,
              getPcbFeatureRotation(parameters, selectedFeatureId),
            ),
          );
        } else if (selectedPart === "custom") {
          configureAllTransformAxes(transformControls);
        } else {
          configureTransformAxes(
            transformControls,
            feature.userData.face as EnclosureFace,
          );
        }
        applyAxisConstraint(transformControls, transformAxisConstraint);
        transformControls.attach(feature);
      } else {
        transformControls.detach();
        attachedFeatureRef.current = null;
      }
    } else if (transformControls) {
      transformControls.detach();
      attachedFeatureRef.current = null;
    }

    if (
      (!didInitialFit.current || previousFocus.current !== focusedPart) &&
      cameraRef.current &&
      controlsRef.current
    ) {
      fitCamera(cameraRef.current, controlsRef.current, model);
      didInitialFit.current = true;
    }
    previousFocus.current = focusedPart;

    return () => {
      if (modelRef.current === model) {
        scene.remove(model);
        disposePreviewModel(model);
        modelRef.current = null;
      }
    };
  }, [
    exploded,
    focusedPart,
    parameters,
    pcbReference,
    pcbPreviews,
    customComponentPreviews,
    hiddenFaces,
    hiddenFeatureIds,
    hiddenPcbBodyIds,
    lidTransparent,
    transparentObjectIds,
    lockedFeatureIds,
    effectiveTransformMode,
    selectedFeatureId,
    selectedPartEditable,
    selectedPart,
    stepPreview,
    transformAxisConstraint,
    transformEditMode,
    transformMode,
  ]);

  useEffect(() => {
    if (!gridRef.current) return;
    gridRef.current.userData.requestedVisible = showGrid;
    const belowWorkPlane =
      hostRef.current?.dataset.cameraBelowWorkPlane === "true";
    gridRef.current.visible = showGrid && !belowWorkPlane;
  }, [showGrid]);

  useEffect(() => {
    if (cameraResetToken === 0) return;
    if (cameraRef.current && controlsRef.current && modelRef.current) {
      fitCamera(cameraRef.current, controlsRef.current, modelRef.current);
    }
  }, [cameraResetToken]);

  useEffect(() => {
    if (transformEditMode && !selectedFeatureEditable) {
      setTransformEditMode(false);
    }
  }, [selectedFeatureEditable, setTransformEditMode, transformEditMode]);

  return (
    <>
      <div
        className="viewport-canvas"
        data-focused-part={focusedPart ?? "all"}
        data-selected-feature={selectedFeatureId ?? "none"}
        data-lid-transparent={String(lidTransparent)}
        data-transparent-objects={transparentObjectIds.join(",")}
        data-selected-feature-readonly={String(selectedFeatureReadOnly)}
        data-transform-mode={effectiveTransformMode}
        data-transform-edit-mode={String(transformEditMode)}
        data-transform-axis={transformAxisConstraint}
        data-reference-kind={
          parameters.pcbReferences.length > 1
            ? "multiple"
            : parameters.pcbReferences.length === 1
              ? parameters.pcbReferences[0].reference.format
            : stepPreview
              ? "step"
              : pcbReference
                ? pcbReference.format
                : "parametric"
        }
        ref={hostRef}
      />
      {focusedPart ? (
        <div className="viewport-focus-state" role="status">
          <Focus size={14} />
          <span>仅显示：{SELECTABLE_PART_LABELS[focusedPart]}</span>
          <button
            type="button"
            onClick={showAllParts}
            title="显示全部零件"
            aria-label="退出聚焦并显示全部零件"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}
      {selectedFeatureId && selectedPartEditable ? (
        <div
          className={`viewport-edit-state ${transformEditMode ? "is-editing" : ""}`}
          role="status"
        >
          <Move3D size={14} />
          <span>
            {selectedFeatureReadOnly
              ? "对象已隐藏或锁定，不能编辑"
              : transformEditMode
                ? `${effectiveTransformMode === "scale" ? "缩放" : "移动"}编辑中 · ${
                    transformAxisConstraint === "all"
                      ? "自由轴"
                      : `${transformAxisConstraint.toUpperCase()} 轴`
                  }`
                : "已选中对象，按 Tab 进入编辑模式"}
          </span>
          {!selectedFeatureReadOnly ? (
            <span className="viewport-edit-shortcuts">
              <kbd>Tab</kbd>
              {transformEditMode ? "退出" : "编辑"}
              {transformEditMode ? (
                <>
                  <kbd>X</kbd>
                  <kbd>Y</kbd>
                  <kbd>Z</kbd>
                  锁轴
                </>
              ) : null}
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="viewport-transform-controls" role="group" aria-label="3D 编辑工具">
        <button
          className={`icon-button ${effectiveTransformMode === "move" ? "is-active" : ""}`}
          type="button"
          disabled={!selectedFeatureEditable}
          onClick={() => setTransformMode("move")}
          title="移动选中对象（按 Tab 进入编辑模式后拖动）"
          aria-label="移动选中对象"
          aria-pressed={effectiveTransformMode === "move"}
        >
          <Move3D size={17} />
        </button>
        <button
          className={`icon-button ${effectiveTransformMode === "scale" ? "is-active" : ""}`}
          type="button"
          disabled={!selectedFeatureEditable || !selectedFeatureScalable}
          onClick={() => setTransformMode("scale")}
          title={
            selectedFeatureScalable
              ? "缩放选中对象（按 Tab 进入编辑模式后拖动）"
              : "该器件为固定尺寸，不能用拖动缩放"
          }
          aria-label="缩放选中对象"
          aria-pressed={effectiveTransformMode === "scale"}
        >
          <Scaling size={17} />
        </button>
      </div>
      <div className="viewport-focus-controls" role="group" aria-label="零件显示">
        <button
          className={`icon-button ${focusedPart ? "is-active" : ""}`}
          type="button"
          disabled={selectedPart === "project"}
          onClick={focusSelectedPart}
          title="聚焦选中零件"
          aria-label="聚焦选中零件"
          aria-pressed={focusedPart !== null}
        >
          <Focus size={17} />
        </button>
        <button
          className="icon-button"
          type="button"
          disabled={!focusedPart}
          onClick={showAllParts}
          title="显示全部零件"
          aria-label="显示全部零件"
        >
          <Eye size={17} />
        </button>
      </div>
    </>
  );
}
