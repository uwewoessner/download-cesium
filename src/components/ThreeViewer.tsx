import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  RotateCcw,
  Sun,
  Maximize2,
  Box,
  Layers,
  Image as ImageIcon,
  Info,
  ChevronRight
} from 'lucide-react';
import { ConvertedTileResult } from '../types/stuttgart';

interface ThreeViewerProps {
  tile: ConvertedTileResult | null;
  allTiles: ConvertedTileResult[];
  onSelectTile: (tile: ConvertedTileResult) => void;
}

export const ThreeViewer: React.FC<ThreeViewerProps> = ({
  tile,
  allTiles,
  onSelectTile,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [wireframe, setWireframe] = useState<boolean>(false);
  const [showTexture, setShowTexture] = useState<boolean>(true);
  const [lightIntensity, setLightIntensity] = useState<number>(1.2);
  const [renderMode, setRenderMode] = useState<'single' | 'all'>('single');

  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const meshGroupRef = useRef<THREE.Group | null>(null);
  const lightRef = useRef<THREE.DirectionalLight | null>(null);

  // Initialize Three.js scene
  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#090d16');
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 50000);
    camera.position.set(0, -300, 200);
    camera.up.set(0, 0, 1); // Z-up for GIS/geospatial
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    rendererRef.current = renderer;

    containerRef.current.replaceChildren(renderer.domElement);

    // Ambient & Directional Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, lightIntensity);
    dirLight.position.set(200, -200, 300);
    scene.add(dirLight);
    lightRef.current = dirLight;

    // Grid helper (oriented on XY plane)
    const grid = new THREE.GridHelper(1000, 20, 0x334155, 0x1e293b);
    grid.rotation.x = Math.PI / 2;
    scene.add(grid);

    // Group for tile meshes
    const meshGroup = new THREE.Group();
    scene.add(meshGroup);
    meshGroupRef.current = meshGroup;

    // Orbit interaction handlers
    let isDragging = false;
    let prevMouseX = 0;
    let prevMouseY = 0;
    let spherical = new THREE.Spherical(500, Math.PI / 3, Math.PI / 4);
    let target = new THREE.Vector3(0, 0, 0);

    const updateCameraFromSpherical = () => {
      camera.position.setFromSpherical(spherical).add(target);
      camera.lookAt(target);
    };
    updateCameraFromSpherical();

    const dom = renderer.domElement;

    const onMouseDown = (e: MouseEvent) => {
      isDragging = true;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - prevMouseX;
      const dy = e.clientY - prevMouseY;
      prevMouseX = e.clientX;
      prevMouseY = e.clientY;

      if (e.buttons === 1) { // Left click: Orbit
        spherical.theta -= dx * 0.005;
        spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi - dy * 0.005));
        updateCameraFromSpherical();
      } else if (e.buttons === 2) { // Right click: Pan
        const right = new THREE.Vector3();
        camera.getWorldDirection(right);
        right.cross(camera.up).normalize();

        const up = new THREE.Vector3();
        up.copy(camera.up).normalize();

        const panSpeed = spherical.radius * 0.001;
        target.addScaledVector(right, -dx * panSpeed);
        target.addScaledVector(up, dy * panSpeed);
        updateCameraFromSpherical();
      }
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      spherical.radius = Math.max(5, Math.min(20000, spherical.radius * (e.deltaY > 0 ? 1.1 : 0.9)));
      updateCameraFromSpherical();
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('contextmenu', onContextMenu);

    // Animation Loop
    let animId: number;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 500;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
      dom.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, []);

  // Update light intensity
  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.intensity = lightIntensity;
    }
  }, [lightIntensity]);

  // Load and render mesh geometry whenever tile or allTiles changes
  useEffect(() => {
    if (!meshGroupRef.current) return;
    const group = meshGroupRef.current;

    // Clear previous objects
    while (group.children.length > 0) {
      const obj = group.children[0] as THREE.Mesh;
      if (obj.geometry) obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else if (obj.material) {
        obj.material.dispose();
      }
      group.remove(obj);
    }

    const tilesToRender = renderMode === 'all' ? allTiles : tile ? [tile] : [];
    if (tilesToRender.length === 0) return;

    // Compute center offset across the rendered set so models center around (0,0,0)
    let avgCenterX = 0;
    let avgCenterY = 0;
    let avgCenterZ = 0;

    for (const t of tilesToRender) {
      avgCenterX += t.geometryData.center[0];
      avgCenterY += t.geometryData.center[1];
      avgCenterZ += t.geometryData.center[2];
    }
    avgCenterX /= tilesToRender.length;
    avgCenterY /= tilesToRender.length;
    avgCenterZ /= tilesToRender.length;

    for (const t of tilesToRender) {
      const geom = new THREE.BufferGeometry();

      // Normalize positions relative to average center
      const rawPos = t.geometryData.positions;
      const centeredPos = new Float32Array(rawPos.length);
      for (let i = 0; i < rawPos.length; i += 3) {
        centeredPos[i] = rawPos[i] - avgCenterX;
        centeredPos[i + 1] = rawPos[i + 1] - avgCenterY;
        centeredPos[i + 2] = rawPos[i + 2] - avgCenterZ;
      }

      geom.setAttribute('position', new THREE.BufferAttribute(centeredPos, 3));
      geom.setIndex(new THREE.BufferAttribute(t.geometryData.indices, 1));

      if (t.geometryData.uvs && t.geometryData.uvs.length > 0) {
        geom.setAttribute('uv', new THREE.BufferAttribute(t.geometryData.uvs, 2));
      }

      geom.computeVertexNormals();

      // Texture
      let material: THREE.Material;
      if (showTexture && t.textureBuffer) {
        const blob = new Blob([t.textureBuffer], { type: 'image/jpeg' });
        const imgUrl = URL.createObjectURL(blob);
        const texture = new THREE.TextureLoader().load(imgUrl, () => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.needsUpdate = true;
        });

        material = new THREE.MeshStandardMaterial({
          map: texture,
          wireframe,
          roughness: 0.6,
          metalness: 0.1,
          side: THREE.DoubleSide,
        });
      } else {
        material = new THREE.MeshStandardMaterial({
          color: 0xe2e8f0,
          wireframe,
          roughness: 0.5,
          metalness: 0.2,
          side: THREE.DoubleSide,
        });
      }

      const mesh = new THREE.Mesh(geom, material);
      group.add(mesh);
    }
  }, [tile, allTiles, renderMode, wireframe, showTexture]);

  return (
    <div className="space-y-4">
      {/* Viewport Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl flex flex-col h-[650px] relative">
        {/* Top Control Bar */}
        <div className="px-5 py-3 bg-slate-850/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between flex-wrap gap-3 z-10">
          <div className="flex items-center gap-2">
            <Box className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">
              Interactive 3D WebGL Mesh Viewer
            </h3>
            {tile && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                {tile.tileId}.osg (LOD {tile.lod})
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Render mode selector */}
            {allTiles.length > 1 && (
              <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-700 text-xs">
                <button
                  onClick={() => setRenderMode('single')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    renderMode === 'single' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Selected Tile
                </button>
                <button
                  onClick={() => setRenderMode('all')}
                  className={`px-2.5 py-1 rounded font-medium transition-colors ${
                    renderMode === 'all' ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All ({allTiles.length})
                </button>
              </div>
            )}

            {/* Wireframe Toggle */}
            <button
              onClick={() => setWireframe(!wireframe)}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                wireframe
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Toggle Wireframe"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Wireframe</span>
            </button>

            {/* Texture Toggle */}
            <button
              onClick={() => setShowTexture(!showTexture)}
              className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                showTexture
                  ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Toggle Texture Maps"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Textures</span>
            </button>
          </div>
        </div>

        {/* 3D Canvas Container */}
        <div ref={containerRef} className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing">
          {(!tile && allTiles.length === 0) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-slate-950/80 z-20">
              <Box className="w-12 h-12 text-slate-700 mb-3 animate-pulse" />
              <h4 className="text-base font-bold text-white">No 3D Tile Loaded</h4>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Go to &quot;Download & OSG DB&quot; tab to download and convert mesh tiles from Stuttgart 3D.
              </p>
            </div>
          )}
        </div>

        {/* Bottom Floating Stats Overlay */}
        {tile && (
          <div className="absolute bottom-4 left-4 right-4 sm:right-auto bg-slate-900/90 backdrop-blur-md border border-slate-700/80 p-3 rounded-xl shadow-2xl text-xs font-mono text-slate-300 flex flex-wrap items-center gap-4 z-10 pointer-events-none">
            <div>
              <span className="text-slate-500 block text-[10px]">Vertices</span>
              <span className="font-bold text-sky-400">
                {(tile.geometryData.positions.length / 3).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Triangles</span>
              <span className="font-bold text-amber-400">
                {(tile.geometryData.indices.length / 3).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Bounding Radius</span>
              <span className="font-bold text-emerald-400">
                {tile.geometryData.radius.toFixed(1)} m
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px]">Navigation Controls</span>
              <span className="text-slate-400 font-sans text-[11px]">
                Left: Rotate • Right: Pan • Scroll: Zoom
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tile Carousel Switcher */}
      {allTiles.length > 1 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs font-semibold text-slate-400 px-2 shrink-0">
            Available Tiles:
          </span>
          {allTiles.map((t) => (
            <button
              key={t.tileId}
              onClick={() => onSelectTile(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono shrink-0 transition-colors cursor-pointer border ${
                tile?.tileId === t.tileId
                  ? 'bg-amber-500 text-slate-950 font-bold border-amber-400'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {t.tileId} (L{t.lod})
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
