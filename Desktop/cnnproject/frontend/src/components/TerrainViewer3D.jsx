import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function TerrainViewer3D({
  grid, shadowMask, minElev, maxElev, solarElevation, solarAzimuth, showShadowOverlay
}) {
  const containerRef = useRef(null);
  const rendererRef  = useRef(null);
  const sceneRef     = useRef(null);
  const cameraRef    = useRef(null);
  const terrainRef   = useRef(null);
  const sunLightRef  = useRef(null);
  const animIdRef    = useRef(null);

  const [isRotating, setIsRotating] = useState(false);
  const rotZRef = useRef(0);

  const elevColor = (height, minH, maxH) => {
    const norm = maxH > minH ? (height - minH) / (maxH - minH) : 0.5;
    const c = new THREE.Color();
    if      (norm < 0.18) c.lerpColors(new THREE.Color(0x05021a), new THREE.Color(0x1a0540), norm / 0.18);
    else if (norm < 0.42) c.lerpColors(new THREE.Color(0x1a0540), new THREE.Color(0x003d88), (norm-0.18)/0.24);
    else if (norm < 0.62) c.lerpColors(new THREE.Color(0x003d88), new THREE.Color(0x00f0ff), (norm-0.42)/0.20);
    else if (norm < 0.80) c.lerpColors(new THREE.Color(0x00f0ff), new THREE.Color(0x10b981), (norm-0.62)/0.18);
    else if (norm < 0.92) c.lerpColors(new THREE.Color(0x10b981), new THREE.Color(0xf59e0b), (norm-0.80)/0.12);
    else                  c.lerpColors(new THREE.Color(0xf59e0b), new THREE.Color(0xfffbeb), (norm-0.92)/0.08);
    return c;
  };

  useEffect(() => {
    if (!containerRef.current || !grid || grid.length === 0) return;

    const W = containerRef.current.clientWidth;
    const H = containerRef.current.clientHeight || 360;

    // Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x060810);
    // Subtle fog for depth
    scene.fog = new THREE.FogExp2(0x060810, 0.035);

    // Camera
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.1, 100);
    camera.position.set(0, -8.5, 7.5);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    // Renderer (fix: PCFSoftShadowMap deprecated in r176+)
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;   // use PCFShadowMap (not soft, deprecated)
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const rows = grid.length;
    const cols = grid[0].length;
    const SIZE = 6.2;

    // High-resolution terrain geometry
    const geom = new THREE.PlaneGeometry(SIZE, SIZE, cols - 1, rows - 1);
    const pos  = geom.attributes.position;
    const cols2 = new Float32Array(rows * cols * 3);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx  = r * cols + c;
        const elev = grid[r][c];
        const norm = maxElev > minElev ? (elev - minElev) / (maxElev - minElev) : 0.5;
        pos.setZ(idx, (norm * 1.8) - 0.9);
        const col = elevColor(elev, minElev, maxElev);
        cols2[idx * 3]     = col.r;
        cols2[idx * 3 + 1] = col.g;
        cols2[idx * 3 + 2] = col.b;
      }
    }
    geom.setAttribute('color', new THREE.BufferAttribute(cols2, 3));
    geom.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.80, metalness: 0.06,
      flatShading: false, side: THREE.DoubleSide
    });

    const terrain = new THREE.Mesh(geom, mat);
    terrain.rotation.x = -Math.PI / 7;
    terrain.castShadow    = true;
    terrain.receiveShadow = true;
    scene.add(terrain);
    terrainRef.current = terrain;

    // Wireframe overlay (subtle grid lines)
    const wireMat  = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.04 });
    const wireGeom = geom.clone();
    const wire     = new THREE.Mesh(wireGeom, wireMat);
    wire.rotation.x = -Math.PI / 7;
    scene.add(wire);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.12));

    const sun = new THREE.DirectionalLight(0xfff8e7, 2.8);
    sun.castShadow = true;
    sun.shadow.mapSize.width  = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near    = 0.5;
    sun.shadow.camera.far     = 30;
    const d = 6;
    sun.shadow.camera.left   = -d; sun.shadow.camera.right = d;
    sun.shadow.camera.top    =  d; sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0003;
    scene.add(sun);
    sunLightRef.current = sun;

    const sunTarget = new THREE.Object3D();
    sunTarget.position.set(0, 0, 0);
    scene.add(sunTarget);
    sun.target = sunTarget;

    // Blue fill light (lunar scatter)
    const fill = new THREE.DirectionalLight(0x4466cc, 0.38);
    fill.position.set(-5, -4, 2);
    scene.add(fill);

    // Subtle hemisphere light for sky-ground
    const hemi = new THREE.HemisphereLight(0x111133, 0x000005, 0.3);
    scene.add(hemi);

    // Mouse drag rotation
    let isDragging = false;
    let prevMouse  = { x: 0, y: 0 };

    const onDown = e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; };
    const onMove = e => {
      if (!isDragging) return;
      terrain.rotation.z += (e.clientX - prevMouse.x) * 0.008;
      terrain.rotation.x += (e.clientY - prevMouse.y) * 0.006;
      wire.rotation.z = terrain.rotation.z;
      wire.rotation.x = terrain.rotation.x;
      prevMouse = { x: e.clientX, y: e.clientY };
    };
    const onUp = () => isDragging = false;

    renderer.domElement.addEventListener('mousedown', onDown);
    renderer.domElement.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    // Animation — performance.now() based, no THREE.Clock
    let lastTs = performance.now();
    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      const now   = performance.now();
      const delta = (now - lastTs) / 1000;
      lastTs = now;

      if (isRotating) {
        rotZRef.current += delta * 0.38;
        terrain.rotation.z = rotZRef.current;
        wire.rotation.z    = rotZRef.current;
      }
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 360;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animIdRef.current);
      renderer.domElement.removeEventListener('mousedown', onDown);
      renderer.domElement.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('resize', onResize);
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      geom.dispose(); mat.dispose(); wireGeom.dispose(); wireMat.dispose();
      renderer.dispose();
    };
  }, [grid, minElev, maxElev]);

  // Sun position update
  useEffect(() => {
    if (!sunLightRef.current) return;
    const elevRad = (solarElevation * Math.PI) / 180;
    const azRad   = (solarAzimuth   * Math.PI) / 180;
    const R = 11.0;
    sunLightRef.current.position.set(
      R * Math.sin(azRad) * Math.cos(elevRad),
     -R * Math.cos(azRad) * Math.cos(elevRad),
      R * Math.sin(elevRad)
    );
    sunLightRef.current.intensity = Math.max(0.3, Math.min(3.2, (solarElevation / 12) * 3.2));
  }, [solarElevation, solarAzimuth]);

  // Shadow overlay on terrain vertices
  useEffect(() => {
    if (!terrainRef.current || !grid || !shadowMask || shadowMask.length === 0) return;
    const attr = terrainRef.current.geometry.attributes.color;
    const rows = grid.length, cols = grid[0].length;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        let col = elevColor(grid[r][c], minElev, maxElev);
        if (showShadowOverlay && shadowMask[r][c] === 1) {
          col.multiplyScalar(0.18);
          col.add(new THREE.Color(0x2d0a5a).multiplyScalar(0.5));
        }
        attr.setXYZ(idx, col.r, col.g, col.b);
      }
    }
    attr.needsUpdate = true;
  }, [showShadowOverlay, shadowMask, grid, minElev, maxElev]);

  // Keep isRotating updated in animation loop
  useEffect(() => {
    // Re-trigger animation loop re-evaluation is handled by the animate closure ref
  }, [isRotating]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '360px', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.04)' }} />

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', gap: 6 }}>
        <button onClick={() => setIsRotating(p => !p)} className={isRotating ? 'btn-neon' : 'btn-neon-purple'}
          style={{ fontSize: '0.58rem', padding: '3px 9px' }}>
          🔄 {isRotating ? 'Pause' : 'Orbit'}
        </button>
        <button onClick={() => {
          if (terrainRef.current) { terrainRef.current.rotation.set(-Math.PI/7, 0, 0); rotZRef.current = 0; }
        }} className="btn-neon" style={{ fontSize: '0.58rem', padding: '3px 9px', borderColor: 'rgba(0,240,255,0.4)', color: 'rgba(0,240,255,0.8)' }}>
          Reset
        </button>
      </div>

      {/* Elevation legend */}
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexWrap: 'wrap', gap: 3, maxWidth: 200, justifyContent: 'flex-end', pointerEvents: 'none' }}>
        {[
          ['#fffbeb','Rim/Peak'], ['#f59e0b','Upper Wall'],
          ['#10b981','Mid Slope'], ['#00f0ff','Lower Wall'],
          ['#003d88','Deep Wall'], ['#05021a','Floor']
        ].map(([col, lbl]) => (
          <div key={lbl} className="elevation-legend-item">
            <span className="color-bar" style={{ background: col }} /> {lbl}
          </div>
        ))}
      </div>

      {/* Shadow overlay indicator */}
      {showShadowOverlay && (
        <div style={{ position: 'absolute', top: 10, left: 10, pointerEvents: 'none', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.55rem', color: '#a78bfa', background: 'rgba(45,10,90,0.55)', border: '1px solid rgba(139,92,246,0.35)', borderRadius: 4, padding: '2px 8px' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8b5cf6', display: 'inline-block' }} /> PSR Shadow Active
        </div>
      )}
    </div>
  );
}
