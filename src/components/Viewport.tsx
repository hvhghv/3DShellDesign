import { useEffect, useRef } from "react";
import { Eye, Focus, Move3D, Scaling } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { buildPreviewModel, disposePreviewModel } from "../geometry/buildPreviewModel";
import { useDesignerStore } from "../store/designerStore";
import type { EnclosureFace, SelectablePart } from "../domain/model";
import { getPlacementSurfaceOffsets } from "../domain/placements";

function getEditableFeature(object: THREE.Object3D | null): THREE.Object3D | null {
  let current = object;
  while (current) {
    if (
      current instanceof THREE.Group &&
      typeof current.userData.featureId === "string" &&
      (current.userData.featureKind === "panel" ||
        current.userData.featureKind === "connector" ||
        current.userData.featureKind === "antenna")
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
  featureKind: "panel" | "connector" | "antenna",
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

function commitFeatureTransform(object: THREE.Object3D): void {
  const state = useDesignerStore.getState();
  const featureId = object.userData.featureId as string | undefined;
  const featureKind = object.userData.featureKind as string | undefined;
  const face = object.userData.face as EnclosureFace | undefined;
  if (!featureId || !face) return;

  if (state.transformMode === "move" || featureKind === "antenna") {
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
  const selectedPart = useDesignerStore((state) => state.selectedPart);
  const selectedFeatureId = useDesignerStore((state) => state.selectedFeatureId);
  const transformMode = useDesignerStore((state) => state.transformMode);
  const focusedPart = useDesignerStore((state) => state.focusedPart);
  const setSelectedPart = useDesignerStore((state) => state.setSelectedPart);
  const setSelectedFeature = useDesignerStore((state) => state.setSelectedFeature);
  const setTransformMode = useDesignerStore((state) => state.setTransformMode);
  const focusSelectedPart = useDesignerStore((state) => state.focusSelectedPart);
  const showAllParts = useDesignerStore((state) => state.showAllParts);
  const showGrid = useDesignerStore((state) => state.showGrid);
  const exploded = useDesignerStore((state) => state.exploded);
  const cameraResetToken = useDesignerStore((state) => state.cameraResetToken);

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
    controls.maxPolarAngle = Math.PI * 0.495;

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
    };
    const onTransformMouseUp = () => {
      if (attachedFeatureRef.current) {
        commitFeatureTransform(attachedFeatureRef.current);
      }
    };
    transformControls.addEventListener("dragging-changed", onDraggingChanged);
    transformControls.addEventListener("mouseUp", onTransformMouseUp);

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
    scene.add(grid);

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
          feature.userData.featureKind as "panel" | "connector" | "antenna",
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
      controls.dispose();
      transformControls.removeEventListener("dragging-changed", onDraggingChanged);
      transformControls.removeEventListener("mouseUp", onTransformMouseUp);
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
    );
    scene.add(model);
    modelRef.current = model;

    const transformControls = transformControlsRef.current;
    if (
      transformControls &&
      selectedFeatureId &&
      (selectedPart === "panel" ||
        selectedPart === "connector" ||
        selectedPart === "antenna")
    ) {
      const feature = findEditableFeature(model, selectedFeatureId, selectedPart);
      if (feature) {
        attachedFeatureRef.current = feature;
        transformControls.setMode(
          selectedPart === "antenna" || transformMode === "move"
            ? "translate"
            : "scale",
        );
        configureTransformAxes(transformControls, feature.userData.face as EnclosureFace);
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
    selectedFeatureId,
    selectedPart,
    stepPreview,
    transformMode,
  ]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    if (cameraResetToken === 0) return;
    if (cameraRef.current && controlsRef.current && modelRef.current) {
      fitCamera(cameraRef.current, controlsRef.current, modelRef.current);
    }
  }, [cameraResetToken]);

  return (
    <>
      <div
        className="viewport-canvas"
        data-focused-part={focusedPart ?? "all"}
        data-selected-feature={selectedFeatureId ?? "none"}
        data-transform-mode={selectedPart === "antenna" ? "move" : transformMode}
        data-reference-kind={stepPreview ? "step" : pcbReference ? pcbReference.format : "parametric"}
        ref={hostRef}
      />
      <div className="viewport-transform-controls" role="group" aria-label="3D 编辑工具">
        <button
          className={`icon-button ${transformMode === "move" || selectedPart === "antenna" ? "is-active" : ""}`}
          type="button"
          disabled={
            selectedPart !== "panel" &&
            selectedPart !== "connector" &&
            selectedPart !== "antenna"
          }
          onClick={() => setTransformMode("move")}
          title="移动选中对象"
          aria-label="移动选中对象"
          aria-pressed={transformMode === "move" || selectedPart === "antenna"}
        >
          <Move3D size={17} />
        </button>
        <button
          className={`icon-button ${transformMode === "scale" && selectedPart !== "antenna" ? "is-active" : ""}`}
          type="button"
          disabled={
            selectedPart !== "panel" &&
            selectedPart !== "connector"
          }
          onClick={() => setTransformMode("scale")}
          title="缩放选中对象"
          aria-label="缩放选中对象"
          aria-pressed={transformMode === "scale" && selectedPart !== "antenna"}
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
