import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

export default function MoonGlobe3D({ activeCraterId, onSelectCrater }) {
  const containerRef = useRef(null);
  const [hoveredCrater, setHoveredCrater] = useState(null);

  const craters = [
    { id: 'shackleton', name: 'Shackleton', lat: -89.9, lon: 0.0, color: 0x8b5cf6, type: 'PSR' },
    { id: 'haworth',    name: 'Haworth',    lat: -87.5, lon: -5.1, color: 0xc084fc, type: 'PSR' },
    { id: 'amundsen',  name: 'Amundsen',   lat: -84.5, lon: 83.0,  color: 0x00f0ff, type: 'Partial' },
    { id: 'tycho',     name: 'Tycho',      lat: -43.3, lon: -11.2, color: 0x38bdf8, type: 'Partial' },
    { id: 'copernicus',name: 'Copernicus', lat: 9.7,   lon: -20.0, color: 0x10b981, type: 'Non-PSR' },
  ];

  useEffect(() => {
    if (!containerRef.current) return;

    const width  = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 300;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);

    // Procedural Moon texture
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width  = 1024;
    moonCanvas.height = 512;
    const ctx = moonCanvas.getContext('2d');

    ctx.fillStyle = '#1a1c2e';
    ctx.fillRect(0, 0, 1024, 512);

    // Highlands
    for (let i = 0; i < 500; i++) {
      const px = Math.random() * 1024, py = Math.random() * 512;
      const pr = Math.random() * 70 + 8;
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, 'rgba(200,208,230,0.12)');
      g.addColorStop(1, 'rgba(26,28,46,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
    }
    // Maria (dark basalt plains)
    [
      {x:300,y:190,rx:130,ry:95},{x:470,y:145,rx:160,ry:105},
      {x:620,y:225,rx:120,ry:85},{x:250,y:330,rx:90,ry:65}
    ].forEach(m => {
      const g = ctx.createRadialGradient(m.x,m.y,0,m.x,m.y,Math.max(m.rx,m.ry));
      g.addColorStop(0,'rgba(8,9,18,0.7)');
      g.addColorStop(0.65,'rgba(14,15,24,0.4)');
      g.addColorStop(1,'rgba(26,28,46,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(m.x,m.y,m.rx,m.ry,0,0,Math.PI*2); ctx.fill();
    });
    // Impact craters
    for (let i = 0; i < 200; i++) {
      const px = Math.random()*1024, py = Math.random()*512, pr = Math.random()*10+1;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(px,py,pr,0,Math.PI*2); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath(); ctx.arc(px+pr*0.15,py+pr*0.15,pr*0.85,0,Math.PI*2); ctx.fill();
    }
    // South pole dark region
    const spg = ctx.createRadialGradient(512,512,0,512,512,90);
    spg.addColorStop(0,'rgba(4,5,14,0.9)');
    spg.addColorStop(1,'rgba(26,28,46,0)');
    ctx.fillStyle = spg;
    ctx.beginPath(); ctx.ellipse(512,512,120,60,0,0,Math.PI*2); ctx.fill();

    const texture = new THREE.CanvasTexture(moonCanvas);

    const sphereR = 3.5;
    const sphere  = new THREE.SphereGeometry(sphereR, 72, 72);
    const mat = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.88, metalness: 0.08, bumpMap: texture, bumpScale: 0.14
    });
    const moon = new THREE.Mesh(sphere, mat);
    scene.add(moon);

    // Lat/lon → 3D position
    const latLonToVec3 = (lat, lon, r) => {
      const phi   = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);
      return new THREE.Vector3(
        -r * Math.sin(phi) * Math.cos(theta),
         r * Math.cos(phi),
         r * Math.sin(phi) * Math.sin(theta)
      );
    };

    // Crater markers
    const markerGroup = new THREE.Group();
    moon.add(markerGroup);
    const markerMeshes = [];

    craters.forEach(c => {
      const pos = latLonToVec3(c.lat, c.lon, sphereR);

      const pinGeom = new THREE.SphereGeometry(0.13, 16, 16);
      const pinMat  = new THREE.MeshBasicMaterial({ color: c.color, toneMapped: false });
      const pin = new THREE.Mesh(pinGeom, pinMat);
      pin.position.copy(pos);
      pin.userData = { craterId: c.id, name: c.name, type: c.type };

      const ringGeom = new THREE.RingGeometry(0.17, 0.25, 32);
      const ringMat  = new THREE.MeshBasicMaterial({
        color: c.color, side: THREE.DoubleSide, transparent: true, opacity: 0.55
      });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.copy(pos);
      ring.lookAt(new THREE.Vector3(0, 0, 0));
      ring.position.addScaledVector(pos.clone().normalize(), 0.06);

      markerGroup.add(pin); markerGroup.add(ring);
      markerMeshes.push({ pin, ring, data: c });
    });

    // Atmosphere glow
    const atmoGeom = new THREE.SphereGeometry(sphereR * 1.035, 32, 32);
    const atmoMat  = new THREE.MeshBasicMaterial({
      color: 0x00f0ff, transparent: true, opacity: 0.055, side: THREE.BackSide
    });
    scene.add(new THREE.Mesh(atmoGeom, atmoMat));

    // Lights
    scene.add(new THREE.AmbientLight(0xffffff, 0.28));
    const sun = new THREE.DirectionalLight(0xfff8e7, 1.9);
    sun.position.set(5, 3, 5);
    scene.add(sun);
    // Subtle Earth-light blue fill
    const fill = new THREE.DirectionalLight(0x4488ff, 0.25);
    fill.position.set(-5, -2, -5);
    scene.add(fill);

    // Interaction
    let isDragging = false;
    let prevMouse  = { x: 0, y: 0 };
    let velX = 0.002, velY = 0;
    const raycaster = new THREE.Raycaster();

    const onDown = e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; };
    const onUp   = () => isDragging = false;

    const onMove = e => {
      const rect   = renderer.domElement.getBoundingClientRect();
      const mouse  = new THREE.Vector2(
        ((e.clientX - rect.left) / width)  * 2 - 1,
        -((e.clientY - rect.top) / height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(markerGroup.children);
      if (hits.length > 0) {
        document.body.style.cursor = 'pointer';
        setHoveredCrater(hits[0].object.userData.name || null);
      } else {
        document.body.style.cursor = 'default';
        setHoveredCrater(null);
      }
      if (!isDragging) return;
      const dx = e.clientX - prevMouse.x;
      const dy = e.clientY - prevMouse.y;
      moon.rotation.y += dx * 0.005;
      moon.rotation.x += dy * 0.005;
      velX = dx * 0.003; velY = dy * 0.002;
      prevMouse = { x: e.clientX, y: e.clientY };
    };

    const onClick = e => {
      const rect  = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / width)  * 2 - 1,
        -((e.clientY - rect.top) / height) * 2 + 1
      );
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(markerGroup.children);
      if (hits.length > 0 && hits[0].object.userData.craterId) {
        onSelectCrater(hits[0].object.userData.craterId);
      }
    };

    renderer.domElement.addEventListener('mousedown', onClick);
    renderer.domElement.addEventListener('mousedown', onDown);
    renderer.domElement.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    // Animation — use THREE.Timer instead of deprecated THREE.Clock
    let animId;
    let elapsed = 0;
    let lastTs  = performance.now();

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now   = performance.now();
      const delta = (now - lastTs) / 1000;
      lastTs  = now;
      elapsed += delta;

      if (!isDragging) {
        moon.rotation.y += velX;
        moon.rotation.x += velY;
        velX += (0.001 - velX) * 0.04;
        velY += (0.0   - velY) * 0.04;
      }

      markerMeshes.forEach(m => {
        const s = 1.0 + Math.sin(elapsed * 4.5 + m.data.lat * 0.05) * 0.2;
        m.ring.scale.set(s, s, s);
        m.ring.material.opacity = 0.55 - Math.sin(elapsed * 4.5 + m.data.lat * 0.05) * 0.18;

        if (m.data.id === activeCraterId) {
          m.pin.scale.set(1.6, 1.6, 1.6);
          m.pin.material.color.setHex(0xffffff);
        } else {
          m.pin.scale.set(1.0, 1.0, 1.0);
          m.pin.material.color.setHex(m.data.color);
        }
      });

      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 300;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      renderer.domElement.removeEventListener('mousedown', onClick);
      renderer.domElement.removeEventListener('mousedown', onDown);
      renderer.domElement.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('resize', onResize);
      if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      sphere.dispose(); mat.dispose(); texture.dispose(); renderer.dispose();
    };
  }, [activeCraterId, onSelectCrater]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '300px', outline: 'none' }} />

      {/* Header */}
      <div style={{ position: 'absolute', top: 10, left: 12, pointerEvents: 'none' }}>
        <div style={{ fontSize: '0.6rem', color: 'var(--neon-cyan)', textTransform: 'uppercase', letterSpacing: '0.16em', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
          Global Targeting System
        </div>
        <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginTop: 2 }}>
          5 Scientific Targets · Click to Select
        </div>
      </div>

      {/* Hover tooltip */}
      {hoveredCrater && (
        <div style={{
          position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(11,12,21,0.92)', border: '1px solid var(--neon-cyan)',
          padding: '4px 12px', borderRadius: 4, fontSize: '0.65rem', color: '#fff',
          fontFamily: 'Outfit, sans-serif', fontWeight: 600,
          boxShadow: 'var(--cyan-glow)', pointerEvents: 'none'
        }}>
          🎯 {hoveredCrater}
        </div>
      )}

      {/* Legend */}
      <div style={{ position: 'absolute', bottom: 8, right: 10, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 3 }}>
        {[['#8b5cf6','Confirmed PSR'],['#00f0ff','Partial PSR'],['#10b981','Non-PSR']].map(([col,lbl]) => (
          <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.5rem', color: 'var(--text-secondary)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, display: 'inline-block', flexShrink: 0 }} />
            {lbl}
          </div>
        ))}
      </div>
    </div>
  );
}
