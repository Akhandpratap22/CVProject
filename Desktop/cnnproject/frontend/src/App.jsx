import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Globe, Activity, Sun, Database, Upload, RefreshCw, Compass,
  BarChart2, TrendingDown, AlertTriangle, Info, Snowflake, Crosshair
} from 'lucide-react';
import MoonGlobe3D from './components/MoonGlobe3D';
import TerrainViewer3D from './components/TerrainViewer3D';

const API = 'http://localhost:5000';

export default function App() {
  const [activeCraterId, setActiveCraterId] = useState('shackleton');
  const [cratersList, setCratersList] = useState([]);
  const [activeTab, setActiveTab] = useState('terrain');
  const [cvStage, setCvStage] = useState('hough');

  const [solarElevation, setSolarElevation] = useState(5.0);
  const [solarAzimuth, setSolarAzimuth] = useState(45.0);
  const [showShadowOverlay, setShowShadowOverlay] = useState(true);

  const [dataset, setDataset] = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [customName, setCustomName] = useState('Newton Crater');
  const [customLat, setCustomLat] = useState(-75.2);
  const [customLon, setCustomLon] = useState(25.4);
  const [customDiameter, setCustomDiameter] = useState(30.0);
  const [uploadStatus, setUploadStatus] = useState('');

  const canvasRef = useRef(null);
  const timerRef = useRef(null);

  // --- Data fetching ---
  const fetchCratersList = async () => {
    try {
      const r = await fetch(`${API}/api/craters`);
      if (r.ok) setCratersList(await r.json());
    } catch (e) { console.error('Catalog fetch error:', e); }
  };

  const fetchCraterDetails = useCallback(async (id, elev, az) => {
    const e = elev ?? solarElevation;
    const a = az ?? solarAzimuth;
    setLoading(true);
    setApiError(null);
    try {
      const r = await fetch(`${API}/api/craters/${id}?solar_elevation=${e}&solar_azimuth=${a}`);
      if (!r.ok) throw new Error(`Server ${r.status}`);
      setDataset(await r.json());
      fetchCratersList();
    } catch (err) {
      console.error('API error:', err);
      setApiError(err.message);
    } finally { setLoading(false); }
  }, [solarElevation, solarAzimuth]);

  useEffect(() => { fetchCratersList(); fetchCraterDetails('shackleton', 5.0, 45.0); }, []);

  const handleSelectCrater = (id) => {
    setActiveCraterId(id);
    const defaults = {
      shackleton: [2.0, 30], haworth: [1.5, 60], amundsen: [4.0, 120],
      tycho: [12.0, 180], copernicus: [18.0, 240]
    };
    const [de, da] = defaults[id] || [5.0, 45.0];
    setSolarElevation(de); setSolarAzimuth(da);
    fetchCraterDetails(id, de, da);
    setActiveTab('terrain');
  };

  const handleSolarChange = (elev, az) => {
    setSolarElevation(elev); setSolarAzimuth(az);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchCraterDetails(activeCraterId, elev, az), 200);
  };

  // --- CV Canvas rendering ---
  useEffect(() => {
    if (!dataset || !canvasRef.current || !dataset.cv_results) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const size = 100;
    canvas.width = size; canvas.height = size;
    const imgData = ctx.createImageData(size, size);
    const cv = dataset.cv_results;

    let matrix = [];
    if (cvStage === 'dem') matrix = dataset.grid;
    else if (cvStage === 'grayscale') matrix = cv.grayscale;
    else if (cvStage === 'edges') matrix = cv.edges;
    else matrix = cv.grayscale;

    if (!matrix || matrix.length === 0) return;

    const minH = dataset.metadata.min_elevation_m || -3000;
    const maxH = dataset.metadata.max_elevation_m || 1500;
    const range = maxH - minH;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!matrix[r]) continue;
        const val = matrix[r][c];
        const idx = (r * size + c) * 4;
        if (cvStage === 'dem') {
          const norm = range > 0 ? (val - minH) / range : 0.5;
          if (norm < 0.2) {
            imgData.data[idx] = 8 + norm * 200; imgData.data[idx+1] = 5; imgData.data[idx+2] = 60;
          } else if (norm < 0.5) {
            imgData.data[idx] = 0; imgData.data[idx+1] = Math.floor(norm*220+30); imgData.data[idx+2] = 255;
          } else if (norm < 0.8) {
            imgData.data[idx] = 16; imgData.data[idx+1] = Math.floor(140+norm*80); imgData.data[idx+2] = Math.floor(180-norm*80);
          } else {
            imgData.data[idx] = Math.floor(norm*255); imgData.data[idx+1] = 230; imgData.data[idx+2] = Math.floor(norm*100);
          }
        } else {
          imgData.data[idx] = val; imgData.data[idx+1] = val; imgData.data[idx+2] = val;
        }
        imgData.data[idx+3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    // Shadow overlay on DEM
    if (cvStage === 'dem' && showShadowOverlay && dataset.shadow_mask) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (dataset.shadow_mask[r] && dataset.shadow_mask[r][c] === 1) {
            const idx = (r * size + c) * 4;
            imgData.data[idx]   = Math.floor(imgData.data[idx] * 0.25 + 45);
            imgData.data[idx+1] = Math.floor(imgData.data[idx+1] * 0.15 + 10);
            imgData.data[idx+2] = Math.floor(imgData.data[idx+2] * 0.2 + 80);
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // Hough circle overlay
    if (cvStage === 'hough' && cv.success) {
      ctx.strokeStyle = '#00f0ff'; ctx.lineWidth = 1.2;
      ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 5;
      ctx.beginPath(); ctx.arc(cv.center_x, cv.center_y, cv.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ef4444';
      ctx.beginPath(); ctx.arc(cv.center_x, cv.center_y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(239,68,68,0.45)'; ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(cv.center_x - cv.radius, cv.center_y); ctx.lineTo(cv.center_x + cv.radius, cv.center_y);
      ctx.moveTo(cv.center_x, cv.center_y - cv.radius); ctx.lineTo(cv.center_x, cv.center_y + cv.radius);
      ctx.stroke(); ctx.setLineDash([]);
      // Confidence label
      if (cv.confidence) {
        ctx.fillStyle = '#00f0ff'; ctx.font = '5px monospace';
        ctx.fillText(`${(cv.confidence * 100).toFixed(0)}%`, cv.center_x + cv.radius + 3, cv.center_y - 2);
      }
    }
  }, [dataset, cvStage, showShadowOverlay]);

  // --- Synthesizer ---
  const handleSynthesizeCrater = async () => {
    setUploadStatus('Synthesizing elevation model...');
    const size = 100, rScale = 1.5;
    const rimH = Math.random() * 500 + 800;
    const floorH = -(Math.random() * 1000 + 2000);
    const depth = rimH - floorH;
    const grid = [];
    for (let i = 0; i < size; i++) {
      const row = [];
      const y = -rScale + (i / (size - 1)) * 2 * rScale;
      for (let j = 0; j < size; j++) {
        const x = -rScale + (j / (size - 1)) * 2 * rScale;
        const r = Math.sqrt(x * x + y * y);
        let elev;
        if (r <= 0.8) {
          const peak = Math.random() > 0.4 ? 400.0 * Math.exp(-Math.pow(r / 0.07, 2)) : 0;
          elev = floorH + depth * Math.pow(r / 0.8, 2) + peak;
        } else {
          elev = rimH - 500 * Math.pow(r - 0.8, 0.7);
        }
        elev += (Math.sin(x * 10) + Math.cos(y * 10)) * 60 + Math.random() * 30;
        row.push(elev);
      }
      grid.push(row);
    }
    try {
      const r = await fetch(`${API}/api/detect`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: customName, latitude: parseFloat(customLat), longitude: parseFloat(customLon), diameter_km: parseFloat(customDiameter), grid })
      });
      if (!r.ok) throw new Error('Server rejected request');
      const result = await r.json();
      setUploadStatus('Registered in database!');
      fetchCratersList();
      setActiveCraterId(result.metadata.crater_id);
      setDataset(result);
      setTimeout(() => { setUploadOpen(false); setUploadStatus(''); setActiveTab('terrain'); }, 800);
    } catch (e) { setUploadStatus(`Error: ${e.message}`); }
  };

  // --- Helpers for badges ---
  const psrBadgeClass = (status) =>
    status === 'Confirmed PSR' ? 'psr' : status === 'Partial PSR' ? 'partial-psr' : 'non-psr';

  const iceColor = (prob) => {
    if (prob >= 0.7) return '#a78bfa';
    if (prob >= 0.4) return '#38bdf8';
    if (prob >= 0.2) return '#10b981';
    return 'var(--text-muted)';
  };

  // --- Render ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'transparent' }}>

      {/* ── HEADER ── */}
      <header className="glass-panel" style={{ margin: '10px 10px 0', padding: '8px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Globe className="pulse-glow" style={{ color: 'var(--neon-cyan)', width: 20, height: 20, background: 'rgba(0,240,255,0.12)', padding: 3, borderRadius: '50%' }} />
          <div>
            <h1 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              LUNAR TELEMETRY COMMAND v2.0
            </h1>
            <p style={{ fontSize: '0.5rem', color: 'var(--neon-purple)', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: -1 }}>
              Crater Depth · Topography · PSR · Water-Ice Analysis
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setUploadOpen(!uploadOpen)} className="btn-neon-purple" style={{ padding: '5px 11px' }}>
            <Upload style={{ width: 11, height: 11 }} /> Synthesize
          </button>
          <button onClick={() => fetchCraterDetails(activeCraterId)} className="btn-neon" style={{ padding: '5px 11px' }}>
            <RefreshCw style={{ width: 11, height: 11 }} /> Recalculate
          </button>
        </div>
      </header>

      {/* ── SYNTHESIS MODAL ── */}
      {uploadOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(5,5,8,0.88)', backdropFilter: 'blur(8px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="glass-panel" style={{ width: 380, padding: 20, borderRadius: 12, border: '1px solid var(--neon-purple)' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: 14, color: 'var(--neon-purple)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Upload style={{ width: 16, height: 16 }} /> CRATER SYNTHESIZER
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.72rem' }}>
              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 3 }}>Crater Name</label>
                <input type="text" value={customName} onChange={e => setCustomName(e.target.value)}
                  style={{ width: '100%', padding: 6, background: '#131527', border: '1px solid var(--panel-border)', borderRadius: 4, color: '#fff' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 3 }}>Latitude (°)</label>
                  <input type="number" step="0.1" value={customLat} onChange={e => setCustomLat(e.target.value)}
                    style={{ width: '100%', padding: 6, background: '#131527', border: '1px solid var(--panel-border)', borderRadius: 4, color: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 3 }}>Longitude (°)</label>
                  <input type="number" step="0.1" value={customLon} onChange={e => setCustomLon(e.target.value)}
                    style={{ width: '100%', padding: 6, background: '#131527', border: '1px solid var(--panel-border)', borderRadius: 4, color: '#fff' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: 3 }}>Diameter (km)</label>
                <input type="number" step="0.5" value={customDiameter} onChange={e => setCustomDiameter(e.target.value)}
                  style={{ width: '100%', padding: 6, background: '#131527', border: '1px solid var(--panel-border)', borderRadius: 4, color: '#fff' }} />
              </div>
              {uploadStatus && (
                <div style={{ background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.3)', padding: 8, borderRadius: 4, fontSize: '0.65rem', color: 'var(--text-primary)', textAlign: 'center' }}>
                  {uploadStatus}
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={handleSynthesizeCrater} className="btn-neon-purple" style={{ flex: 1, padding: 8 }}>Begin Synthesis</button>
                <button onClick={() => setUploadOpen(false)} className="btn-neon" style={{ borderColor: '#ef4444', color: '#ef4444', padding: 8 }}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN GRID ── */}
      <main className="dashboard-grid" style={{ flex: 1, padding: 10 }}>

        {/* ═══ LEFT COLUMN ═══ */}
        <section className="glass-panel" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {/* Target list */}
          <div>
            <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
              <Crosshair style={{ width: 13, height: 13 }} /> Scientific Targets ({cratersList.length})
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {cratersList.slice(0, 5).map(c => {
                const isActive = c.crater_id === activeCraterId;
                return (
                  <div key={c.crater_id} onClick={() => handleSelectCrater(c.crater_id)}
                    style={{
                      background: isActive ? 'rgba(0,240,255,0.08)' : 'rgba(255,255,255,0.015)',
                      border: isActive ? '1px solid var(--neon-cyan)' : '1px solid var(--panel-border)',
                      padding: '7px 9px', borderRadius: 6, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', transition: 'all 0.2s'
                    }}>
                    <div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: isActive ? '#fff' : 'var(--text-primary)' }}>{c.name}</div>
                      <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)' }}>
                        {c.latitude.toFixed(1)}°, {c.longitude.toFixed(1)}° · {c.diameter_km.toFixed(0)} km
                      </div>
                    </div>
                    <span className={`status-badge ${psrBadgeClass(c.psr_status)}`} style={{ fontSize: '0.45rem', padding: '1px 5px' }}>
                      {c.psr_status.split(' ')[0]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Telemetry card */}
          {dataset && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ background: 'rgba(0,0,0,0.25)', border: '1px solid var(--panel-border)', borderRadius: 6, padding: 9 }}>
                <h4 style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', textTransform: 'uppercase', borderBottom: '1px solid var(--panel-border)', paddingBottom: 3, marginBottom: 7, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Activity style={{ width: 11, height: 11 }} /> Geospatial Telemetry
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: '0.6rem' }}>
                  {[
                    ['Diameter', `${dataset.metadata.diameter_km.toFixed(1)} km`, '#fff'],
                    ['CV Depth', `${(dataset.cv_results?.calculated_depth_m || dataset.metadata.depth_m).toFixed(0)} m`, 'var(--neon-cyan)'],
                    ['Wall Slope', `${(dataset.metadata.mean_slope_deg || dataset.metadata.avg_slope_deg).toFixed(1)}°`, '#fff'],
                    ['Max Slope', `${(dataset.metadata.max_slope_deg || 0).toFixed(1)}°`, 'var(--solar-amber)'],
                    ['Rim Elev', `${(dataset.metadata.max_elevation_m || 0).toFixed(0)} m`, 'var(--neon-green)'],
                    ['Floor Elev', `${(dataset.metadata.min_elevation_m || 0).toFixed(0)} m`, 'var(--neon-purple)'],
                  ].map(([label, value, color]) => (
                    <div key={label}>
                      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                      <p style={{ fontWeight: 600, color, fontSize: '0.65rem' }}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* PSR + Ice panel */}
                <div style={{ marginTop: 8, padding: 6, background: 'rgba(139,92,246,0.07)', borderRadius: 4, border: '1px solid rgba(139,92,246,0.15)', fontSize: '0.6rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>PSR Coverage</span>
                    <span style={{ color: 'var(--neon-purple)', fontWeight: 700 }}>{(dataset.metadata.shadow_fraction * 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: 'var(--text-secondary)' }}>Classification</span>
                    <span className={`status-badge ${psrBadgeClass(dataset.metadata.psr_status)}`} style={{ fontSize: '0.5rem', padding: '1px 5px' }}>{dataset.metadata.psr_status}</span>
                  </div>
                  {/* Shadow bar */}
                  <div style={{ width: '100%', height: 5, background: 'rgba(255,255,255,0.05)', borderRadius: 3, marginTop: 4 }}>
                    <div style={{ width: `${Math.min(100, dataset.metadata.shadow_fraction * 100)}%`, height: '100%', background: 'linear-gradient(90deg, var(--neon-purple), var(--neon-cyan))', borderRadius: 3, transition: 'width 0.4s' }} />
                  </div>
                </div>

                {/* Water-ice probability */}
                {dataset.metadata.ice_probability !== undefined && (
                  <div style={{ marginTop: 8, padding: 6, background: 'rgba(56,189,248,0.06)', borderRadius: 4, border: '1px solid rgba(56,189,248,0.12)', fontSize: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
                      <Snowflake style={{ width: 10, height: 10, color: '#38bdf8' }} />
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Water-Ice Probability</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, color: iceColor(dataset.metadata.ice_probability) }}>
                        {(dataset.metadata.ice_probability * 100).toFixed(1)}%
                      </span>
                      <span style={{ fontSize: '0.5rem', color: iceColor(dataset.metadata.ice_probability), fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {dataset.metadata.ice_confidence}
                      </span>
                    </div>
                    <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 3, marginTop: 3 }}>
                      <div style={{ width: `${dataset.metadata.ice_probability * 100}%`, height: '100%', background: 'linear-gradient(90deg, #38bdf8, #a78bfa)', borderRadius: 3 }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Science info box */}
              <div style={{ background: 'rgba(245,158,11,0.04)', border: '1px solid rgba(245,158,11,0.1)', borderRadius: 6, padding: 7, fontSize: '0.55rem', color: 'var(--text-secondary)', lineHeight: 1.35 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--solar-amber)', fontWeight: 600, marginBottom: 2 }}>
                  <Info style={{ width: 10, height: 10 }} /> NASA PSR Science
                </div>
                {dataset.metadata.description || 'Deep polar craters block low-angle solar rays. At temperatures below −230 °C, these permanently shadowed regions trap volatiles including water-ice, confirmed by LCROSS and Diviner instruments.'}
              </div>

              {/* CV Detection method badge */}
              {dataset.cv_results && (
                <div style={{ background: 'rgba(0,240,255,0.04)', border: '1px solid rgba(0,240,255,0.1)', borderRadius: 5, padding: '5px 7px', fontSize: '0.5rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--neon-cyan)', fontWeight: 600 }}>Detection: </span>
                  {dataset.cv_results.method}
                  {dataset.cv_results.confidence ? ` · Confidence: ${(dataset.cv_results.confidence * 100).toFixed(0)}%` : ''}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ═══ CENTER COLUMN ═══ */}
        <section className="glass-panel glow-cyan" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* View tabs */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: 6 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <button onClick={() => setActiveTab('terrain')} className={activeTab === 'terrain' ? 'btn-neon' : 'btn-neon-purple'}
                style={{ padding: '3px 10px', fontSize: '0.6rem' }}>🔬 3D Terrain</button>
              <button onClick={() => setActiveTab('globe')} className={activeTab === 'globe' ? 'btn-neon' : 'btn-neon-purple'}
                style={{ padding: '3px 10px', fontSize: '0.6rem' }}>🌍 Moon Globe</button>
            </div>
            <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Activity style={{ width: 9, height: 9, color: 'var(--neon-green)' }} /> Viewport Active
            </div>
          </div>

          {/* Viewport */}
          <div style={{ flex: 1, minHeight: 340, position: 'relative', background: '#060810', borderRadius: 8 }}>
            {loading && (
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(6,8,16,0.8)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 40, color: 'var(--neon-cyan)', fontSize: '0.75rem', gap: 8 }}>
                <RefreshCw className="pulse-glow" style={{ animation: 'spin 2s linear infinite', width: 22, height: 22 }} />
                <span>Running raycaster & RANSAC detection...</span>
              </div>
            )}
            {apiError && (
              <div style={{ position: 'absolute', inset: 0, background: '#060810', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 40, color: 'var(--neon-red)', padding: 20, textAlign: 'center', gap: 8 }}>
                <AlertTriangle style={{ width: 28, height: 28 }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 600 }}>API Connection Error</span>
                <p style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{apiError}</p>
                <button onClick={() => fetchCraterDetails(activeCraterId)} className="btn-neon" style={{ borderColor: 'var(--neon-red)', color: 'var(--neon-red)' }}>Retry</button>
              </div>
            )}
            {activeTab === 'globe' ? (
              <MoonGlobe3D activeCraterId={activeCraterId} onSelectCrater={handleSelectCrater} />
            ) : (
              dataset && (
                <TerrainViewer3D grid={dataset.grid} shadowMask={dataset.shadow_mask}
                  minElev={dataset.metadata.min_elevation_m || -3000} maxElev={dataset.metadata.max_elevation_m || 1200}
                  solarElevation={solarElevation} solarAzimuth={solarAzimuth} showShadowOverlay={showShadowOverlay} />
              )
            )}
          </div>
        </section>

        {/* ═══ RIGHT COLUMN ═══ */}
        <section className="glass-panel" style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
          {/* Solar sliders */}
          <div style={{ background: 'rgba(0,0,0,0.2)', padding: 9, borderRadius: 6, border: '1px solid var(--panel-border)' }}>
            <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--solar-amber)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
              <Sun style={{ width: 13, height: 13 }} /> Solar Raycasting
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: '0.62rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>Elevation:</span><span style={{ color: 'var(--solar-amber)', fontWeight: 600 }}>{solarElevation.toFixed(1)}°</span>
                </div>
                <input type="range" min="0.5" max="45" step="0.5" value={solarElevation}
                  onChange={e => handleSolarChange(parseFloat(e.target.value), solarAzimuth)}
                  style={{ width: '100%', cursor: 'ew-resize', accentColor: 'var(--solar-amber)' }} />
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span>Azimuth:</span><span style={{ color: 'var(--solar-amber)', fontWeight: 600 }}>{solarAzimuth.toFixed(0)}°</span>
                </div>
                <input type="range" min="0" max="360" step="5" value={solarAzimuth}
                  onChange={e => handleSolarChange(solarElevation, parseFloat(e.target.value))}
                  style={{ width: '100%', cursor: 'ew-resize', accentColor: 'var(--solar-amber)' }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                <input type="checkbox" id="shadowOverlay" checked={showShadowOverlay} onChange={e => setShowShadowOverlay(e.target.checked)}
                  style={{ cursor: 'pointer', accentColor: 'var(--neon-purple)' }} />
                <label htmlFor="shadowOverlay" style={{ cursor: 'pointer', userSelect: 'none', color: 'var(--text-secondary)', fontSize: '0.58rem' }}>
                  Show Shadow Mask Overlay
                </label>
              </div>
            </div>
          </div>

          {/* CV Pipeline */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--neon-cyan)', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Activity style={{ width: 13, height: 13 }} /> CV Detection Pipeline
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3 }}>
              {['dem', 'grayscale', 'edges', 'hough'].map((stage, i) => (
                <button key={stage} onClick={() => setCvStage(stage)}
                  style={{
                    padding: '3px 2px', fontSize: '0.52rem', borderRadius: 4, cursor: 'pointer',
                    background: cvStage === stage ? 'var(--neon-cyan)' : 'rgba(255,255,255,0.03)',
                    color: cvStage === stage ? '#000' : 'var(--text-secondary)',
                    border: `1px solid ${cvStage === stage ? 'var(--neon-cyan)' : 'var(--panel-border)'}`
                  }}>
                  {i + 1}. {stage === 'dem' ? 'DEM' : stage === 'grayscale' ? 'Gray' : stage === 'edges' ? 'Canny' : 'RANSAC'}
                </button>
              ))}
            </div>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#020204', border: '1px solid var(--panel-border)', borderRadius: 6, overflow: 'hidden', padding: 5, maxHeight: 200 }}>
              <canvas ref={canvasRef} className="cv-canvas" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            </div>
            {dataset && dataset.cv_results && (
              <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.3)', padding: 5, borderRadius: 4 }}>
                <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Solver: </span>
                {dataset.cv_results.success ? (
                  <span style={{ color: 'var(--neon-green)' }}>
                    {dataset.cv_results.method} · Center ({dataset.cv_results.center_x}, {dataset.cv_results.center_y}) · R={dataset.cv_results.radius}px
                    · Rim {(dataset.cv_results.rim_elevation_m || 0).toFixed(0)}m → Floor {(dataset.cv_results.floor_elevation_m || 0).toFixed(0)}m
                  </span>
                ) : (
                  <span style={{ color: 'var(--neon-red)' }}>Circle fit failed</span>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      {/* ── BOTTOM PANEL ── */}
      <section className="glass-panel" style={{ margin: '0 10px 10px', padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, borderRadius: 8 }}>
        {/* Cross-section chart */}
        <div>
          <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--neon-purple)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <BarChart2 style={{ width: 13, height: 13 }} /> Elevation Cross-Sections
          </h3>
          <div style={{ position: 'relative', width: '100%', height: 140, background: 'rgba(0,0,0,0.4)', border: '1px solid var(--panel-border)', borderRadius: 6, padding: 5 }}>
            {dataset && dataset.cross_section && dataset.cross_section.length > 0 ? (
              <svg viewBox="0 0 100 38" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                <defs>
                  <pattern id="gridPat" width="10" height="5" patternUnits="userSpaceOnUse">
                    <line x1="0" y1="0" x2="10" y2="0" stroke="rgba(255,255,255,0.03)" strokeWidth="0.2" />
                    <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.03)" strokeWidth="0.2" />
                  </pattern>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(0,240,255,0.2)" />
                    <stop offset="100%" stopColor="rgba(139,92,246,0.0)" />
                  </linearGradient>
                  <linearGradient id="areaGrad2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(245,158,11,0.15)" />
                    <stop offset="100%" stopColor="rgba(245,158,11,0.0)" />
                  </linearGradient>
                </defs>
                <rect width="100" height="32" fill="url(#gridPat)" />
                {(() => {
                  const minV = dataset.metadata.min_elevation_m || -3000;
                  const maxV = dataset.metadata.max_elevation_m || 1500;
                  const diff = maxV - minV;
                  const mapPts = (arr) => arr.map((val, i) => {
                    const x = (i / (arr.length - 1)) * 100;
                    const ny = diff > 0 ? (val - minV) / diff : 0.5;
                    return { x, y: 29 - ny * 26, val };
                  });

                  const hPts = mapPts(dataset.cross_section);
                  const hPath = hPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
                  const hFill = `${hPath} L 100 31 L 0 31 Z`;

                  // Vertical cross-section if available
                  const vArr = dataset.cross_section_v;
                  let vPath = '', vFill = '';
                  if (vArr && vArr.length > 0) {
                    const vPts = mapPts(vArr);
                    vPath = vPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
                    vFill = `${vPath} L 100 31 L 0 31 Z`;
                  }

                  // Shadow overlay on cross-section
                  const midRow = dataset.shadow_mask ? Math.floor(dataset.shadow_mask.length / 2) : -1;
                  const shadowSlice = midRow >= 0 ? dataset.shadow_mask[midRow] : null;

                  const floorPt = hPts.reduce((p, c) => c.val < p.val ? c : p, hPts[0]);

                  return (
                    <>
                      <line x1="0" y1="29" x2="100" y2="29" stroke="rgba(255,255,255,0.12)" strokeWidth="0.3" />
                      {/* Horizontal profile */}
                      <path d={hFill} fill="url(#areaGrad)" />
                      <path d={hPath} fill="none" stroke="var(--neon-cyan)" strokeWidth="0.7" />
                      {/* Vertical profile */}
                      {vFill && <path d={vFill} fill="url(#areaGrad2)" />}
                      {vFill && <path d={vPath} fill="none" stroke="var(--solar-amber)" strokeWidth="0.5" strokeDasharray="2 1" />}
                      {/* Shadow bands */}
                      {showShadowOverlay && shadowSlice && shadowSlice.map((sh, i) => {
                        if (sh === 1 && i < hPts.length) {
                          return <line key={i} x1={hPts[i].x} y1={hPts[i].y} x2={hPts[i].x} y2="31" stroke="rgba(139,92,246,0.25)" strokeWidth="0.9" />;
                        }
                        return null;
                      })}
                      <circle cx={hPts[0].x} cy={hPts[0].y} r="0.7" fill="var(--solar-amber)" />
                      <circle cx={hPts[hPts.length - 1].x} cy={hPts[hPts.length - 1].y} r="0.7" fill="var(--solar-amber)" />
                      <circle cx={floorPt.x} cy={floorPt.y} r="0.7" fill="var(--neon-purple)" />
                      <text x={floorPt.x} y={floorPt.y - 1.5} fontSize="1.7" fill="var(--neon-purple)" textAnchor="middle" fontWeight="bold">
                        Floor ({floorPt.val.toFixed(0)}m)
                      </text>
                    </>
                  );
                })()}
                <text x="1" y="34" fontSize="1.6" fill="var(--text-muted)" fontWeight="600">W</text>
                <text x="99" y="34" fontSize="1.6" fill="var(--text-muted)" fontWeight="600" textAnchor="end">E</text>
                {/* Legend */}
                <line x1="70" y1="35.5" x2="76" y2="35.5" stroke="var(--neon-cyan)" strokeWidth="0.5" />
                <text x="77" y="36.5" fontSize="1.4" fill="var(--text-muted)">H-cut</text>
                <line x1="85" y1="35.5" x2="91" y2="35.5" stroke="var(--solar-amber)" strokeWidth="0.5" strokeDasharray="1.5 0.8" />
                <text x="92" y="36.5" fontSize="1.4" fill="var(--text-muted)">V-cut</text>
              </svg>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                No profile data loaded.
              </div>
            )}
          </div>
        </div>

        {/* Database table */}
        <div>
          <h3 style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--neon-green)', display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
            <Database style={{ width: 13, height: 13 }} /> SQLite Geospatial Registry
          </h3>
          <div style={{ width: '100%', height: 140, overflowY: 'auto', background: 'rgba(0,0,0,0.4)', border: '1px solid var(--panel-border)', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.55rem', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0b0c15', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-secondary)' }}>
                  {['Name', 'Coords', 'Diam', 'Depth', 'Slope', 'PSR%', 'Status'].map(h => (
                    <th key={h} style={{ padding: '5px 6px' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cratersList.map(c => {
                  const isActive = c.crater_id === activeCraterId;
                  return (
                    <tr key={c.crater_id} onClick={() => handleSelectCrater(c.crater_id)}
                      style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: isActive ? 'rgba(0,240,255,0.04)' : 'transparent', cursor: 'pointer', color: isActive ? '#fff' : 'var(--text-secondary)' }}>
                      <td style={{ padding: '5px 6px', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '5px 6px' }}>{c.latitude.toFixed(1)}°, {c.longitude.toFixed(1)}°</td>
                      <td style={{ padding: '5px 6px' }}>{c.diameter_km.toFixed(0)}</td>
                      <td style={{ padding: '5px 6px' }}>{c.depth_m.toFixed(0)}</td>
                      <td style={{ padding: '5px 6px' }}>{c.avg_slope_deg.toFixed(1)}°</td>
                      <td style={{ padding: '5px 6px' }}>{(c.shadow_fraction * 100).toFixed(0)}%</td>
                      <td style={{ padding: '5px 6px' }}>
                        <span className={`status-badge ${psrBadgeClass(c.psr_status)}`} style={{ fontSize: '0.42rem', padding: '1px 4px', borderRadius: 3 }}>
                          {c.psr_status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="glass-panel" style={{ margin: '0 10px 10px', padding: '5px 18px', borderRadius: 6, fontSize: '0.5rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>System: <span style={{ color: 'var(--neon-green)' }}>ONLINE</span> · API: <span style={{ color: 'var(--neon-cyan)' }}>Flask v2.0</span> · Detection: <span style={{ color: 'var(--neon-cyan)' }}>RANSAC + Canny</span></span>
        <span>Database: SQLite · 5 Scientific Targets · NASA LOLA / LRO / LCROSS / Diviner Reference Data</span>
      </footer>
    </div>
  );
}
