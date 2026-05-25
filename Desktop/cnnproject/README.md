# Lunar Crater Depth & Topography Analysis in PSRs

Welcome to the **Lunar Crater Depth and Topography Analysis Platform in Permanently Shadowed Regions (PSRs)**. This is a full-stack, university-grade scientific simulation and analysis workspace that helps researchers explore lunar topography, execute computer vision crater detections, compute wall slope gradients, and raytrace solar shadow maps in real-time.

---

## 🚀 Quick Start Guide

Ensure you have **Node.js (npm)** and **Python 3** installed.

### 1. Start the Flask Backend Server
Navigate to the root directory and start the Python Flask server:
```bash
# Starts the database and bootstrapping sample craters
python backend/app.py
```
- Exposes scientific REST endpoints on `http://localhost:5000`.
- Automatically initializes and populates the SQLite database `lunar_craters.db`.

### 2. Start the React Frontend Dashboard
In a separate terminal, navigate to the `frontend` folder and launch the Vite development server:
```bash
cd frontend
npm run dev
```
- Starts the beautiful interactive user interface on `http://localhost:5173`.
- Allows exploring 3D Moon Globes, 3D crater meshes, and adjusting dynamic solar sliders!

---

## 🛠️ Project Structure

The project is structured as a zero-config, highly decoupled monorepo:

```
cnnproject/
├── backend/
│   ├── app.py                # Main Flask controller & REST router
│   ├── database.py           # SQLite registry schemas & connector
│   ├── detection.py          # Grayscale normalizer & Canny/Hough circle solvers
│   ├── psr_analyzer.py       # Math-based solar raycasting shadow mapper
│   ├── sample_data.py        # Shackleton, Tycho, Copernicus topographic DEM models
│   ├── requirements.txt      # Python dependencies
│   └── test_backend.py       # Integration tests script
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── MoonGlobe3D.jsx   # 3D spinning Moon globe hotspot raycaster
│   │   │   └── TerrainViewer3D.jsx # 3D elevated crater topography mesh
│   │   ├── App.jsx           # Command telemetry dashboard orchestrator
│   │   ├── index.css         # Dark space glassmorphism CSS design system
│   │   └── main.jsx          # React app mounting point
│   ├── package.json          # Node dependencies (Three.js, Lucide-React, etc.)
│   └── vite.config.js        # Vite bundler options
│
├── README.md                 # Project workspace overview (This file)
├── implementation_plan.md    # Approved implementation plan (Artifact)
├── task.md                   # Complete checklist tracking (Artifact)
└── walkthrough.md            # Detailed scientific report (Artifact)
```

---

## 🔬 Core Scientific Features

1. **3D Interactive Moon Globe**: Renders a spinning lunar sphere using Three.js with an offline canvas-painted procedural texture showing impact basins, basaltic maria, and highlands. Interactive raycast hotspots let users target South Pole craters (Shackleton) and highland basins (Tycho, Copernicus).
2. **3D Real-time Elevation Mesh**: Translates 100x100 DEM heightmap coordinates into a 3D vertex plane. Colorizes coordinates using elevation-banded HSL gradients (dark purples on basin floor $\rightarrow$ cyan walls $\rightarrow$ green highlands $\rightarrow$ white rim crests).
3. **Dynamic Solar Raycasting (PSRs)**: Interactive Azimuth and Elevation sliders linked to a Three.js directional light recreate solar positioning. Moving sliders triggers **real-time WebGL shadow-mapping** alongside a backend line-of-sight raytracer that recalculates shadow coverage and registers PSR status in SQLite.
4. **CV Edge & Hough Solvers**: Converts heightmap metrics to normalized grayscale, executes bilateral edge filtering, and fits circles using an OpenCV Hough Circle solver (with a custom NumPy voting Hough fitting engine fallback).
5. **Dynamic 2D SVG Profile**: Generates custom cross-sectional profiles through the center coordinates, highlighting central peaks, terraced wall step modulations, and shadows.
6. **Crater Synthesis Engine**: Lets users synthesize custom impact structures, coordinates, and diameters, executing the full analysis pipeline instantly and persisting records in the registry.

---

## 🧪 Verification & Unit Tests
To verify all calculations are mathematically sound and databases operate correctly, run our comprehensive backend unit tests:
```bash
python backend/test_backend.py
```
**Test Report Highlights:**
- Parabolic bowl grid boundaries: **Succeeded (OK)**
- Database schema inserts & retrievals: **Succeeded (OK)**
- NumPy Hough fitting circles: **Succeeded (OK)**
- Low-angle solar raycasting shadow matrices: **Succeeded (OK)**
- Frontend Vite production bundling compilation: **Succeeded (OK)**
