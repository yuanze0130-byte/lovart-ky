"use client";

/* eslint-disable @next/next/no-img-element -- Captures are generated locally by the WebGL canvas. */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import {
  Aperture,
  Box,
  Camera,
  Circle,
  CircleHelp,
  Focus,
  Maximize2,
  MousePointer2,
  Move3d,
  Rotate3d,
  RotateCcw,
  Scaling,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';

type VectorTuple = [number, number, number];
type DirectorObjectKind = 'actor' | 'crowd' | 'box' | 'sphere' | 'cylinder' | 'camera';
type TransformMode = 'translate' | 'rotate' | 'scale';
type ViewMode = 'director' | 'camera';
type CaptureAspect = 'auto' | '16:9' | '4:3' | '1:1';

interface DirectorObjectState {
  id: string;
  kind: DirectorObjectKind;
  name: string;
  color: string;
  position: VectorTuple;
  rotation: VectorTuple;
  scale: VectorTuple;
}

interface SceneSettings {
  scale: number;
  position: VectorTuple;
  rotation: VectorTuple;
  skyColor: string;
  showLabels: boolean;
  gridSnap: boolean;
  showGround: boolean;
  groundOpacity: number;
  groundHeight: number;
}

interface DirectorCapture {
  id: string;
  dataUrl: string;
  createdAt: string;
}

interface ThreeDDirectorModalProps {
  onClose: () => void;
  onInsertCapture: (dataUrl: string) => void | Promise<void>;
}

const DEFAULT_SCENE_SETTINGS: SceneSettings = {
  scale: 1,
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  skyColor: '#d1d5db',
  showLabels: true,
  gridSnap: false,
  showGround: true,
  groundOpacity: 1,
  groundHeight: 0,
};

const OBJECT_META: Record<DirectorObjectKind, { label: string; color: string }> = {
  actor: { label: '角色', color: '#3b82f6' },
  crowd: { label: '群众', color: '#8b5cf6' },
  box: { label: '立方体', color: '#64748b' },
  sphere: { label: '球体', color: '#f59e0b' },
  cylinder: { label: '圆柱体', color: '#10b981' },
  camera: { label: '摄像机', color: '#111827' },
};

const toDegrees = (radians: number) => Math.round(THREE.MathUtils.radToDeg(radians) * 10) / 10;
const toRadians = (degrees: number) => THREE.MathUtils.degToRad(degrees);
const roundTransform = (value: number) => Math.round(value * 100) / 100;

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach((material) => material.dispose());
  });
}

function createTextLabel(text: string) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  if (context) {
    context.fillStyle = 'rgba(15,23,42,0.82)';
    context.roundRect(8, 8, 240, 48, 16);
    context.fill();
    context.fillStyle = '#ffffff';
    context.font = '600 25px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 128, 32);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.name = '__director-label';
  sprite.position.set(0, 2.8, 0);
  sprite.scale.set(2.2, 0.55, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function createActor(color: string) {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: '#f2c6a0', roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.82, 5, 10), material);
  torso.position.y = 1.45;
  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), skin);
  head.position.y = 2.35;
  group.add(head);

  const limbGeometry = new THREE.CapsuleGeometry(0.12, 0.72, 4, 8);
  const leftLeg = new THREE.Mesh(limbGeometry, material);
  leftLeg.position.set(-0.2, 0.53, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = 0.2;
  const leftArm = new THREE.Mesh(limbGeometry, material);
  leftArm.position.set(-0.56, 1.5, 0);
  leftArm.rotation.z = -0.15;
  const rightArm = leftArm.clone();
  rightArm.position.x = 0.56;
  rightArm.rotation.z = 0.15;
  group.add(leftLeg, rightLeg, leftArm, rightArm);
  return group;
}

function createDirectorObject(kind: DirectorObjectKind, color: string, label: string) {
  let object: THREE.Object3D;
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.08 });

  if (kind === 'actor') {
    object = createActor(color);
  } else if (kind === 'crowd') {
    const group = new THREE.Group();
    [-1.1, 0, 1.1].forEach((x, index) => {
      const actor = createActor(index === 1 ? color : '#64748b');
      actor.position.set(x, 0, index === 1 ? -0.4 : 0.35);
      actor.scale.setScalar(index === 1 ? 1 : 0.88);
      group.add(actor);
    });
    object = group;
  } else if (kind === 'sphere') {
    object = new THREE.Mesh(new THREE.SphereGeometry(0.9, 32, 24), material);
    object.position.y = 0.9;
  } else if (kind === 'cylinder') {
    object = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1.8, 28), material);
    object.position.y = 0.9;
  } else if (kind === 'camera') {
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.68, 0.62), material);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.38, 0.55, 20), material);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.55;
    const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 1.3, 10), material);
    tripod.position.y = -0.95;
    group.add(body, lens, tripod);
    group.position.y = 1.65;
    object = group;
  } else {
    object = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), material);
    object.position.y = 0.8;
  }

  object.add(createTextLabel(label));
  return object;
}

function NumberField({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange: (value: number) => void; step?: number }) {
  return (
    <label className="min-w-0 flex-1 text-[11px] text-slate-500">
      <span className="mb-1 block">{label}</span>
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        step={step}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
        className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function ToggleButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-9 items-center justify-between rounded-lg border px-3 text-xs transition ${active ? 'border-blue-200 bg-blue-50 text-blue-600' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
    >
      <span>{children}</span>
      <span className={`h-2 w-2 rounded-full ${active ? 'bg-blue-500' : 'bg-slate-300'}`} />
    </button>
  );
}

export function ThreeDDirectorModal({ onClose, onInsertCapture }: ThreeDDirectorModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const stageRootRef = useRef<THREE.Group | null>(null);
  const directorCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const shotCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const shotCameraHelperRef = useRef<THREE.CameraHelper | null>(null);
  const orbitControlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const objectMapRef = useRef(new Map<string, THREE.Object3D>());
  const selectedIdRef = useRef<string | null>(null);
  const viewModeRef = useRef<ViewMode>('director');
  const gridSnapRef = useRef(false);

  const [objects, setObjects] = useState<DirectorObjectState[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sceneSettings, setSceneSettings] = useState<SceneSettings>(DEFAULT_SCENE_SETTINGS);
  const [viewMode, setViewMode] = useState<ViewMode>('director');
  const [transformMode, setTransformMode] = useState<TransformMode>('translate');
  const [captureAspect, setCaptureAspect] = useState<CaptureAspect>('auto');
  const [captures, setCaptures] = useState<DirectorCapture[]>([]);
  const [search, setSearch] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  const selectedObject = useMemo(() => objects.find((object) => object.id === selectedId) || null, [objects, selectedId]);

  const syncObjectState = useCallback((id: string, object: THREE.Object3D) => {
    setObjects((current) => current.map((item) => item.id === id ? {
      ...item,
      position: [roundTransform(object.position.x), roundTransform(object.position.y), roundTransform(object.position.z)],
      rotation: [roundTransform(object.rotation.x), roundTransform(object.rotation.y), roundTransform(object.rotation.z)],
      scale: [roundTransform(object.scale.x), roundTransform(object.scale.y), roundTransform(object.scale.z)],
    } : item));
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    viewModeRef.current = viewMode;
    if (orbitControlsRef.current) orbitControlsRef.current.enabled = viewMode === 'director';
    if (shotCameraHelperRef.current) shotCameraHelperRef.current.visible = viewMode === 'director';
  }, [viewMode]);

  useEffect(() => {
    gridSnapRef.current = sceneSettings.gridSnap;
    transformControlsRef.current?.setTranslationSnap(sceneSettings.gridSnap ? 0.5 : null);
  }, [sceneSettings.gridSnap]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const objectMap = objectMapRef.current;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(DEFAULT_SCENE_SETTINGS.skyColor);
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.className = 'h-full w-full touch-none';
    viewport.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const directorCamera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    directorCamera.position.set(8.5, 6.5, 10.5);
    directorCameraRef.current = directorCamera;

    const shotCamera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 14);
    shotCamera.position.set(0, 2.4, 8);
    shotCamera.lookAt(0, 1.35, 0);
    shotCameraRef.current = shotCamera;
    objectMap.set('main-camera', shotCamera);

    const stageRoot = new THREE.Group();
    scene.add(stageRoot);
    stageRootRef.current = stageRoot;

    const ambient = new THREE.HemisphereLight('#ffffff', '#475569', 2.2);
    scene.add(ambient);
    const keyLight = new THREE.DirectionalLight('#ffffff', 3.5);
    keyLight.position.set(5, 9, 6);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const groundMaterial = new THREE.MeshStandardMaterial({ color: '#b8bdc5', roughness: 0.92, transparent: true });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    const grid = new THREE.GridHelper(40, 40, '#e2e8f0', '#cbd5e1');
    grid.position.y = 0.006;
    scene.add(grid);
    gridRef.current = grid;

    const axes = new THREE.AxesHelper(2.5);
    axes.position.y = 0.015;
    scene.add(axes);

    const cameraHelper = new THREE.CameraHelper(shotCamera);
    cameraHelper.visible = true;
    scene.add(cameraHelper);
    shotCameraHelperRef.current = cameraHelper;

    const orbitControls = new OrbitControls(directorCamera, renderer.domElement);
    orbitControls.enableDamping = true;
    orbitControls.dampingFactor = 0.08;
    orbitControls.target.set(0, 1.1, 0);
    orbitControlsRef.current = orbitControls;

    const transformControls = new TransformControls(directorCamera, renderer.domElement);
    scene.add(transformControls.getHelper());
    transformControlsRef.current = transformControls;
    transformControls.addEventListener('dragging-changed', (event) => {
      orbitControls.enabled = !(event as unknown as { value: boolean }).value;
    });
    transformControls.addEventListener('objectChange', () => {
      const id = selectedIdRef.current;
      const object = transformControls.object;
      if (!id || !object) return;
      if (id === 'main-camera') cameraHelper.update();
      syncObjectState(id, object);
    });

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerDown = (event: PointerEvent) => {
      if (viewModeRef.current !== 'director') return;
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, directorCamera);
      const intersections = raycaster.intersectObjects(stageRoot.children, true);
      const hit = intersections.find((entry) => entry.object.userData.directorId);
      if (hit?.object.userData.directorId) setSelectedId(String(hit.object.userData.directorId));
    };
    renderer.domElement.addEventListener('pointerdown', handlePointerDown);

    const resize = () => {
      const width = Math.max(viewport.clientWidth, 1);
      const height = Math.max(viewport.clientHeight, 1);
      renderer.setSize(width, height, false);
      directorCamera.aspect = width / height;
      directorCamera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(viewport);
    resize();

    let animationFrame = 0;
    const render = () => {
      animationFrame = window.requestAnimationFrame(render);
      orbitControls.update();
      const activeCamera = viewModeRef.current === 'camera' ? shotCamera : directorCamera;
      renderer.render(scene, activeCamera);
    };
    render();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      transformControls.dispose();
      orbitControls.dispose();
      objectMap.clear();
      scene.traverse(disposeObject);
      renderer.dispose();
      renderer.domElement.remove();
      rendererRef.current = null;
      sceneRef.current = null;
    };
  }, [syncObjectState]);

  useEffect(() => {
    const scene = sceneRef.current;
    const stageRoot = stageRootRef.current;
    if (!scene || !stageRoot) return;
    scene.background = new THREE.Color(sceneSettings.skyColor);
    stageRoot.scale.setScalar(Math.max(sceneSettings.scale, 0.05));
    stageRoot.position.set(...sceneSettings.position);
    stageRoot.rotation.set(...sceneSettings.rotation);
    if (groundRef.current) {
      groundRef.current.visible = sceneSettings.showGround;
      groundRef.current.position.y = sceneSettings.groundHeight;
      const material = groundRef.current.material as THREE.MeshStandardMaterial;
      material.opacity = sceneSettings.groundOpacity;
      material.transparent = sceneSettings.groundOpacity < 1;
    }
    if (gridRef.current) {
      gridRef.current.visible = sceneSettings.showGround;
      gridRef.current.position.y = sceneSettings.groundHeight + 0.006;
    }
    objectMapRef.current.forEach((object, id) => {
      if (id === 'main-camera') return;
      const label = object.getObjectByName('__director-label');
      if (label) label.visible = sceneSettings.showLabels;
    });
  }, [sceneSettings]);

  useEffect(() => {
    const controls = transformControlsRef.current;
    if (!controls) return;
    const object = selectedId ? objectMapRef.current.get(selectedId) : null;
    if (object) controls.attach(object);
    else controls.detach();
  }, [selectedId, objects]);

  useEffect(() => {
    transformControlsRef.current?.setMode(transformMode);
  }, [transformMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'w' || event.key === 'W') setTransformMode('translate');
      if (event.key === 'e' || event.key === 'E') setTransformMode('rotate');
      if (event.key === 'r' || event.key === 'R') setTransformMode('scale');
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIdRef.current && selectedIdRef.current !== 'main-camera') {
        event.preventDefault();
        const id = selectedIdRef.current;
        const object = objectMapRef.current.get(id);
        if (object) {
          object.parent?.remove(object);
          disposeObject(object);
          objectMapRef.current.delete(id);
        }
        setObjects((current) => current.filter((item) => item.id !== id));
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const addObject = useCallback((kind: DirectorObjectKind) => {
    const stageRoot = stageRootRef.current;
    if (!stageRoot) return;
    const meta = OBJECT_META[kind];
    const id = `director-${kind}-${crypto.randomUUID()}`;
    const count = objects.filter((item) => item.kind === kind).length + 1;
    const name = `${meta.label} ${count}`;
    const object = createDirectorObject(kind, meta.color, name);
    object.position.x += (objects.length % 4 - 1.5) * 1.4;
    object.position.z += Math.floor(objects.length / 4) * 1.4;
    object.traverse((child) => {
      child.userData.directorId = id;
      if ((child as THREE.Mesh).isMesh) {
        (child as THREE.Mesh).castShadow = true;
        (child as THREE.Mesh).receiveShadow = true;
      }
    });
    stageRoot.add(object);
    objectMapRef.current.set(id, object);
    const next: DirectorObjectState = {
      id,
      kind,
      name,
      color: meta.color,
      position: [object.position.x, object.position.y, object.position.z],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    };
    setObjects((current) => [...current, next]);
    setSelectedId(id);
  }, [objects]);

  const updateSelectedTransform = useCallback((field: 'position' | 'rotation' | 'scale', axis: 0 | 1 | 2, value: number) => {
    if (!selectedId) return;
    const object = objectMapRef.current.get(selectedId);
    if (!object) return;
    const normalizedValue = field === 'rotation' ? toRadians(value) : sceneSettings.gridSnap && field === 'position' ? Math.round(value * 2) / 2 : value;
    if (field === 'rotation') {
      object.rotation[axis === 0 ? 'x' : axis === 1 ? 'y' : 'z'] = normalizedValue;
    } else {
      object[field].setComponent(axis, normalizedValue);
    }
    if (selectedId === 'main-camera') shotCameraHelperRef.current?.update();
    syncObjectState(selectedId, object);
  }, [sceneSettings.gridSnap, selectedId, syncObjectState]);

  const updateObjectColor = useCallback((color: string) => {
    if (!selectedObject) return;
    const object = objectMapRef.current.get(selectedObject.id);
    object?.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) material.color.set(color);
      });
    });
    setObjects((current) => current.map((item) => item.id === selectedObject.id ? { ...item, color } : item));
  }, [selectedObject]);

  const removeSelectedObject = useCallback(() => {
    if (!selectedObject) return;
    const object = objectMapRef.current.get(selectedObject.id);
    if (object) {
      object.parent?.remove(object);
      disposeObject(object);
      objectMapRef.current.delete(selectedObject.id);
    }
    setObjects((current) => current.filter((item) => item.id !== selectedObject.id));
    setSelectedId(null);
  }, [selectedObject]);

  const resetView = useCallback(() => {
    const camera = directorCameraRef.current;
    const controls = orbitControlsRef.current;
    if (!camera || !controls) return;
    camera.position.set(8.5, 6.5, 10.5);
    controls.target.set(0, 1.1, 0);
    controls.update();
    setViewMode('director');
  }, []);

  const takeCapture = useCallback(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = shotCameraRef.current;
    const viewport = viewportRef.current;
    if (!renderer || !scene || !camera || !viewport) return;

    const currentSize = new THREE.Vector2();
    renderer.getSize(currentSize);
    const ratio = captureAspect === '16:9' ? 16 / 9 : captureAspect === '4:3' ? 4 / 3 : captureAspect === '1:1' ? 1 : currentSize.x / currentSize.y;
    const width = 1280;
    const height = Math.max(720, Math.round(width / ratio));
    const helperVisible = shotCameraHelperRef.current?.visible ?? false;
    if (shotCameraHelperRef.current) shotCameraHelperRef.current.visible = false;
    renderer.setSize(width, height, false);
    camera.aspect = ratio;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL('image/png');
    renderer.setSize(Math.max(viewport.clientWidth, 1), Math.max(viewport.clientHeight, 1), false);
    if (shotCameraHelperRef.current) shotCameraHelperRef.current.visible = helperVisible;
    setCaptures((current) => [{ id: crypto.randomUUID(), dataUrl, createdAt: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }, ...current]);
  }, [captureAspect]);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) void modalRef.current?.requestFullscreen();
    else void document.exitFullscreen();
  }, []);

  const filteredObjects = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return keyword ? objects.filter((object) => object.name.toLowerCase().includes(keyword)) : objects;
  }, [objects, search]);

  const sceneVectorChange = (field: 'position' | 'rotation', axis: 0 | 1 | 2, value: number) => {
    setSceneSettings((current) => {
      const next = [...current[field]] as VectorTuple;
      next[axis] = field === 'rotation' ? toRadians(value) : value;
      return { ...current, [field]: next };
    });
  };

  const selectMainCamera = () => {
    const camera = shotCameraRef.current;
    if (!camera) return;
    setObjects((current) => current.some((item) => item.id === 'main-camera') ? current : [{
      id: 'main-camera',
      kind: 'camera',
      name: '主机位',
      color: '#111827',
      position: [camera.position.x, camera.position.y, camera.position.z],
      rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
      scale: [1, 1, 1],
    }, ...current]);
    setSelectedId('main-camera');
  };

  return (
    <div ref={modalRef} role="dialog" aria-modal="true" aria-label="3D 导演台" className="fixed inset-0 z-[300] flex flex-col bg-[#f7f8fa] text-slate-900">
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">
        <div className="flex items-center gap-3 text-base font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200"><Camera size={18} /></span>
          3D导演台
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1 text-sm">
            <button type="button" onClick={() => setViewMode('director')} className={`rounded-lg px-4 py-2 ${viewMode === 'director' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600'}`}>导演视角</button>
            <button type="button" onClick={() => setViewMode('camera')} className={`rounded-lg px-4 py-2 ${viewMode === 'camera' ? 'bg-blue-500 text-white shadow-sm' : 'text-slate-600'}`}>机位视角</button>
          </div>
          <button type="button" onClick={resetView} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm text-slate-600 hover:bg-slate-50"><RotateCcw size={16} />重置视角</button>
          <button type="button" onClick={() => setShowHelp((value) => !value)} title="操作帮助" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><CircleHelp size={18} /></button>
          <button type="button" onClick={onClose} title="关闭" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50"><X size={18} /></button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[264px] shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-4">
            <label className="flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-slate-400">
              <Search size={15} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索对象" className="min-w-0 flex-1 bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400" />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <button type="button" onClick={() => setSelectedId(null)} className={`mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${selectedId === null ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}><Focus size={16} />场景</button>
            <button type="button" onClick={() => addObject('actor')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><UserRound size={16} />角色</button>
            <button type="button" onClick={() => addObject('crowd')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><Users size={16} />群众</button>
            <div className="group relative">
              <button type="button" onClick={() => addObject('box')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><Box size={16} />几何体</button>
              <div className="ml-7 hidden gap-1 pb-1 group-hover:flex">
                <button type="button" onClick={() => addObject('sphere')} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">球体</button>
                <button type="button" onClick={() => addObject('cylinder')} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">圆柱</button>
              </div>
            </div>
            <button type="button" onClick={() => addObject('camera')} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"><Aperture size={16} />摄像机</button>
            <button type="button" onClick={selectMainCamera} className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${selectedId === 'main-camera' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}><Camera size={16} />主机位</button>

            {filteredObjects.filter((object) => object.id !== 'main-camera').length > 0 && <div className="my-3 h-px bg-slate-100" />}
            {filteredObjects.filter((object) => object.id !== 'main-camera').map((object) => (
              <button key={object.id} type="button" onClick={() => setSelectedId(object.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs ${selectedId === object.id ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}>
                <span className="truncate">{object.name}</span><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: object.color }} />
              </button>
            ))}
          </div>
        </aside>

        <main className="relative min-w-0 flex-1 overflow-hidden bg-slate-300">
          <div ref={viewportRef} className="absolute inset-0" />
          {showHelp && (
            <div className="absolute right-4 top-4 z-20 w-72 rounded-2xl border border-white/50 bg-white/95 p-4 text-xs leading-6 text-slate-600 shadow-xl backdrop-blur">
              <div className="mb-1 font-semibold text-slate-900">导演台操作</div>
              左键选择物体，拖动彩色轴移动/旋转/缩放；右键旋转导演视角，滚轮缩放。快捷键 W/E/R 切换工具，Delete 删除对象。切到机位视角可预览最终构图。
            </div>
          )}

          <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-white/70 bg-white/95 p-2 shadow-[0_16px_40px_rgba(15,23,42,0.2)] backdrop-blur">
            {([
              ['translate', Move3d, '移动 W'],
              ['rotate', Rotate3d, '旋转 E'],
              ['scale', Scaling, '缩放 R'],
            ] as const).map(([mode, Icon, title]) => (
              <button key={mode} type="button" onClick={() => setTransformMode(mode)} title={title} className={`flex h-9 w-9 items-center justify-center rounded-xl ${transformMode === mode ? 'bg-blue-50 text-blue-600 ring-1 ring-blue-200' : 'text-slate-500 hover:bg-slate-100'}`}><Icon size={17} /></button>
            ))}
            <span className="mx-1 h-6 w-px bg-slate-200" />
            <button type="button" onClick={() => addObject('actor')} title="添加角色" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><UserRound size={17} /></button>
            <button type="button" onClick={() => addObject('crowd')} title="添加群众" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><Users size={17} /></button>
            <button type="button" onClick={() => addObject('box')} title="添加立方体" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><Box size={17} /></button>
            <button type="button" onClick={() => addObject('sphere')} title="添加球体" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><Circle size={17} /></button>
            <button type="button" onClick={() => addObject('camera')} title="添加摄像机" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><Aperture size={17} /></button>
            <span className="mx-1 h-6 w-px bg-slate-200" />
            <select value={captureAspect} onChange={(event) => setCaptureAspect(event.target.value as CaptureAspect)} className="h-9 rounded-xl border border-slate-200 bg-white px-2 text-xs text-slate-600 outline-none">
              <option value="auto">Auto</option><option value="16:9">16:9</option><option value="4:3">4:3</option><option value="1:1">1:1</option>
            </select>
            <button type="button" onClick={takeCapture} title="使用主机位拍摄" className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"><Camera size={17} /></button>
            <button type="button" onClick={toggleFullscreen} title="全屏" className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"><Maximize2 size={17} /></button>
          </div>
        </main>

        <aside className="flex w-[320px] shrink-0 flex-col border-l border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-500">属性面板</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {!selectedObject ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 font-semibold"><Move3d size={17} />场景</div>
                <NumberField label="整体缩放" value={sceneSettings.scale} step={0.05} onChange={(scale) => setSceneSettings((current) => ({ ...current, scale: Math.max(scale, 0.05) }))} />
                <div>
                  <div className="mb-2 text-xs text-slate-500">平移</div>
                  <div className="flex gap-2">{(['X', 'Y', 'Z'] as const).map((axis, index) => <NumberField key={axis} label={axis} value={sceneSettings.position[index]} onChange={(value) => sceneVectorChange('position', index as 0 | 1 | 2, value)} />)}</div>
                </div>
                <div>
                  <div className="mb-2 text-xs text-slate-500">旋转</div>
                  <div className="flex gap-2">{(['X', 'Y', 'Z'] as const).map((axis, index) => <NumberField key={axis} label={axis} value={toDegrees(sceneSettings.rotation[index])} step={1} onChange={(value) => sceneVectorChange('rotation', index as 0 | 1 | 2, value)} />)}</div>
                </div>
                <label className="block text-xs text-slate-500">天空颜色<input type="color" value={sceneSettings.skyColor} onChange={(event) => setSceneSettings((current) => ({ ...current, skyColor: event.target.value }))} className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-1" /></label>
                <div className="grid grid-cols-2 gap-2">
                  <ToggleButton active={sceneSettings.showLabels} onClick={() => setSceneSettings((current) => ({ ...current, showLabels: !current.showLabels }))}>角色标签</ToggleButton>
                  <ToggleButton active={sceneSettings.gridSnap} onClick={() => setSceneSettings((current) => ({ ...current, gridSnap: !current.gridSnap }))}>网格吸附</ToggleButton>
                  <ToggleButton active={sceneSettings.showGround} onClick={() => setSceneSettings((current) => ({ ...current, showGround: !current.showGround }))}>显示地面</ToggleButton>
                </div>
                <NumberField label="透明度" value={sceneSettings.groundOpacity} step={0.05} onChange={(groundOpacity) => setSceneSettings((current) => ({ ...current, groundOpacity: THREE.MathUtils.clamp(groundOpacity, 0, 1) }))} />
                <NumberField label="地面高度" value={sceneSettings.groundHeight} onChange={(groundHeight) => setSceneSettings((current) => ({ ...current, groundHeight }))} />
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between"><div className="font-semibold">{selectedObject.name}</div>{selectedObject.id !== 'main-camera' && <button type="button" onClick={removeSelectedObject} className="flex h-8 w-8 items-center justify-center rounded-lg text-red-500 hover:bg-red-50" title="删除对象"><Trash2 size={16} /></button>}</div>
                <div>
                  <div className="mb-2 text-xs text-slate-500">位置</div>
                  <div className="flex gap-2">{(['X', 'Y', 'Z'] as const).map((axis, index) => <NumberField key={axis} label={axis} value={selectedObject.position[index]} onChange={(value) => updateSelectedTransform('position', index as 0 | 1 | 2, value)} />)}</div>
                </div>
                <div>
                  <div className="mb-2 text-xs text-slate-500">旋转</div>
                  <div className="flex gap-2">{(['X', 'Y', 'Z'] as const).map((axis, index) => <NumberField key={axis} label={axis} value={toDegrees(selectedObject.rotation[index])} step={1} onChange={(value) => updateSelectedTransform('rotation', index as 0 | 1 | 2, value)} />)}</div>
                </div>
                <div>
                  <div className="mb-2 text-xs text-slate-500">缩放</div>
                  <div className="flex gap-2">{(['X', 'Y', 'Z'] as const).map((axis, index) => <NumberField key={axis} label={axis} value={selectedObject.scale[index]} step={0.05} onChange={(value) => updateSelectedTransform('scale', index as 0 | 1 | 2, Math.max(value, 0.05))} />)}</div>
                </div>
                {selectedObject.id !== 'main-camera' && <label className="block text-xs text-slate-500">对象颜色<input type="color" value={selectedObject.color} onChange={(event) => updateObjectColor(event.target.value)} className="mt-2 h-9 w-full cursor-pointer rounded-lg border border-slate-200 bg-white p-1" /></label>}
              </div>
            )}
          </div>
          <div className="border-t border-slate-100 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600"><MousePointer2 size={14} />截图记录 · 主机位</div>
            {captures.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 py-5 text-center text-xs text-slate-400">暂无截图，使用底部相机按钮拍摄</div> : (
              <div className="flex max-h-44 flex-col gap-2 overflow-y-auto">
                {captures.map((capture) => <div key={capture.id} className="flex items-center gap-2 rounded-xl border border-slate-200 p-2"><img src={capture.dataUrl} alt="主机位截图" className="h-14 w-20 rounded-lg object-cover" /><div className="min-w-0 flex-1"><div className="text-xs font-medium">主机位</div><div className="text-[10px] text-slate-400">{capture.createdAt}</div></div><button type="button" onClick={() => onInsertCapture(capture.dataUrl)} className="rounded-lg bg-blue-500 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-blue-600">插入画布</button></div>)}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
