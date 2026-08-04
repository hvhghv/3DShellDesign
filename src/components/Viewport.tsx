import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildPreviewModel, disposePreviewModel } from "../geometry/buildPreviewModel";
import { useDesignerStore } from "../store/designerStore";
import type { SelectablePart } from "../domain/model";

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
  const modelRef = useRef<THREE.Group | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const didInitialFit = useRef(false);
  const parameters = useDesignerStore((state) => state.parameters);
  const pcbReference = useDesignerStore((state) => state.pcbReference);
  const stepPreview = useDesignerStore((state) => state.stepPreview);
  const selectedPart = useDesignerStore((state) => state.selectedPart);
  const setSelectedPart = useDesignerStore((state) => state.setSelectedPart);
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
    gridRef.current = grid;

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      controls.dispose();
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
      gridRef.current = null;
    };
  }, [setSelectedPart]);

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
    );
    scene.add(model);
    modelRef.current = model;

    if (!didInitialFit.current && cameraRef.current && controlsRef.current) {
      fitCamera(cameraRef.current, controlsRef.current, model);
      didInitialFit.current = true;
    }

    return () => {
      if (modelRef.current === model) {
        scene.remove(model);
        disposePreviewModel(model);
        modelRef.current = null;
      }
    };
  }, [exploded, parameters, pcbReference, selectedPart, stepPreview]);

  useEffect(() => {
    if (gridRef.current) gridRef.current.visible = showGrid;
  }, [showGrid]);

  useEffect(() => {
    if (cameraResetToken === 0) return;
    if (cameraRef.current && controlsRef.current && modelRef.current) {
      fitCamera(cameraRef.current, controlsRef.current, modelRef.current);
    }
  }, [cameraResetToken]);

  return <div className="viewport-canvas" ref={hostRef} />;
}
