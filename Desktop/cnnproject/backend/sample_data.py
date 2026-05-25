import numpy as np
import math

DEM_SIZE = 100

def generate_crater_dem(crater_type, size=100):
    x = np.linspace(-1.5, 1.5, size)
    y = np.linspace(-1.5, 1.5, size)
    X, Y = np.meshgrid(x, y)
    R = np.sqrt(X**2 + Y**2)

    rng = np.random.RandomState(42)
    noise = np.zeros((size, size))

    freq1 = 3.0
    noise += 120.0 * (np.sin(freq1 * X + 0.3) * np.cos(freq1 * Y * 0.8 + 0.5) + 0.5 * np.sin(freq1 * 1.7 * X - 0.4) * np.cos(freq1 * 1.3 * Y + 0.7))
    freq2 = 7.0
    noise += 45.0 * (np.sin(freq2 * X + 0.9) * np.cos(freq2 * Y + 0.2) + 0.3 * np.cos(freq2 * 2.1 * X) * np.sin(freq2 * 1.5 * Y))
    freq3 = 15.0
    noise += 18.0 * rng.normal(0, 1, (size, size))

    for _ in range(12):
        cx, cy = rng.uniform(-1.1, 1.1, 2)
        cr = rng.uniform(0.04, 0.18)
        cdepth = rng.uniform(80, 250)
        dist = np.sqrt((X - cx)**2 + (Y - cy)**2)
        noise -= cdepth * np.exp(-(dist / cr)**4)

    if crater_type == 'shackleton':
        base_elevation = -3000.0
        rim_elevation = 1200.0
        depth = rim_elevation - base_elevation
        crater_mask = R <= 1.0
        elev = np.zeros((size, size))
        inside_norm = R[crater_mask] / 1.0
        elev[crater_mask] = base_elevation + depth * (inside_norm ** 1.85)
        outer_mask = ~crater_mask
        elev[outer_mask] = rim_elevation - 700.0 * np.log1p(R[outer_mask] - 1.0) * 1.8
        grid = elev + noise * 0.65

    elif crater_type == 'tycho':
        base_elevation = -2800.0
        rim_elevation = 1500.0
        depth = rim_elevation - base_elevation
        elev = np.zeros((size, size))
        for i in range(size):
            for j in range(size):
                r = R[i, j]
                if r <= 0.12:
                    peak_h = 1500.0 * math.exp(-(r / 0.055) ** 2)
                    elev[i, j] = base_elevation + peak_h
                elif r <= 0.35:
                    elev[i, j] = base_elevation + 30.0 * (r / 0.35)
                elif r <= 0.88:
                    t = (r - 0.35) / 0.53
                    terrace = 250.0 * math.sin(t * math.pi * 1.5)
                    elev[i, j] = base_elevation + depth * (t ** 1.6) + terrace
                else:
                    elev[i, j] = rim_elevation - 950.0 * (r - 0.88) ** 0.75
        grid = elev + noise * 0.45

    elif crater_type == 'copernicus':
        base_elevation = -2700.0
        rim_elevation = 1100.0
        depth = rim_elevation - base_elevation
        elev = np.zeros((size, size))
        for i in range(size):
            for j in range(size):
                r = R[i, j]
                xi, yi = X[i, j], Y[i, j]
                if r <= 0.38:
                    p1 = 850.0 * math.exp(-((xi - 0.06)**2 + (yi - 0.02)**2) / 0.0045)
                    p2 = 650.0 * math.exp(-((xi + 0.09)**2 + (yi - 0.06)**2) / 0.0038)
                    p3 = 550.0 * math.exp(-((xi - 0.03)**2 + (yi + 0.08)**2) / 0.0055)
                    elev[i, j] = base_elevation + max(p1, p2 * 0.8, p3 * 0.7)
                elif r <= 0.95:
                    t = (r - 0.38) / 0.57
                    steps = 220.0 * abs(math.sin(t * math.pi * 3.0))
                    elev[i, j] = base_elevation + depth * (t ** 1.45) + steps
                else:
                    elev[i, j] = rim_elevation - 850.0 * (r - 0.95) ** 0.68
        grid = elev + noise * 0.55

    elif crater_type == 'haworth':
        base_elevation = -800.0
        rim_elevation = 300.0
        depth = rim_elevation - base_elevation
        crater_mask = R <= 1.0
        elev = np.zeros((size, size))
        elev[crater_mask] = base_elevation + depth * (R[crater_mask] ** 2.2)
        outer_mask = ~crater_mask
        elev[outer_mask] = rim_elevation - 400.0 * np.log1p(R[outer_mask] - 1.0)
        grid = elev + noise * 0.5

    elif crater_type == 'amundsen':
        base_elevation = -1500.0
        rim_elevation = 600.0
        depth = rim_elevation - base_elevation
        elev = np.zeros((size, size))
        for i in range(size):
            for j in range(size):
                r = R[i, j]
                if r <= 0.55:
                    elev[i, j] = base_elevation + 200.0 * (r / 0.55)**3
                elif r <= 0.92:
                    t = (r - 0.55) / 0.37
                    elev[i, j] = base_elevation + depth * (t ** 1.7)
                else:
                    elev[i, j] = rim_elevation - 600.0 * (r - 0.92) ** 0.72
        grid = elev + noise * 0.6
        
    elif crater_type == 'jezero':
        # Mars - Jezero Crater: Delta, flat floor, ancient lakebed
        base_elevation = -2500.0
        rim_elevation = 500.0
        depth = rim_elevation - base_elevation
        elev = np.zeros((size, size))
        for i in range(size):
            for j in range(size):
                r = R[i, j]
                xi, yi = X[i, j], Y[i, j]
                if r <= 0.6:
                    # Flat lakebed
                    elev[i, j] = base_elevation + 10.0 * r
                elif r <= 0.9:
                    # Inner wall
                    t = (r - 0.6) / 0.3
                    elev[i, j] = base_elevation + depth * (t ** 1.5)
                else:
                    elev[i, j] = rim_elevation - 300.0 * (r - 0.9)
                    
                # Add river delta fan (western edge)
                if -0.8 < xi < -0.3 and -0.2 < yi < 0.4:
                    delta_r = np.sqrt((xi + 0.8)**2 + yi**2)
                    if delta_r < 0.5:
                        elev[i, j] += 400.0 * (1.0 - delta_r/0.5)**1.5
        grid = elev + noise * 0.4 # Mars is dusty, less micro-roughness

    elif crater_type == 'chao_meng_fu':
        # Mercury - Chao Meng-Fu: Deep polar PSR, steep
        base_elevation = -3500.0
        rim_elevation = 800.0
        depth = rim_elevation - base_elevation
        crater_mask = R <= 1.0
        elev = np.zeros((size, size))
        inside_norm = R[crater_mask] / 1.0
        elev[crater_mask] = base_elevation + depth * (inside_norm ** 1.95)
        outer_mask = ~crater_mask
        elev[outer_mask] = rim_elevation - 800.0 * np.log1p(R[outer_mask] - 1.0)
        grid = elev + noise * 0.8 # Mercury has intense ruggedness

    else:
        grid = 500.0 + noise * 2.0

    return grid.tolist()

def get_sample_craters_metadata():
    return [
        {
            "crater_id": "shackleton",
            "name": "Shackleton Crater",
            "latitude": -89.9,
            "longitude": 0.0,
            "diameter_km": 21.0,
            "depth_m": 4200.0,
            "avg_slope_deg": 31.5,
            "shadow_fraction": 0.88,
            "psr_status": "Confirmed PSR",
            "celestial_body": "Moon",
            "description": "South Pole ultra-deep bowl, confirmed permanently shadowed. LCROSS detected water ice.",
            "nasa_mission": "LCROSS / LOLA"
        },
        {
            "crater_id": "tycho",
            "name": "Tycho Crater",
            "latitude": -43.3,
            "longitude": -11.2,
            "diameter_km": 85.0,
            "depth_m": 4800.0,
            "avg_slope_deg": 24.2,
            "shadow_fraction": 0.15,
            "psr_status": "Partial PSR",
            "celestial_body": "Moon",
            "description": "Geologically young complex crater with prominent central peak and bright ray system.",
            "nasa_mission": "LRO / Surveyor 7"
        },
        {
            "crater_id": "copernicus",
            "name": "Copernicus Crater",
            "latitude": 9.7,
            "longitude": -20.0,
            "diameter_km": 93.0,
            "depth_m": 3800.0,
            "avg_slope_deg": 19.8,
            "shadow_fraction": 0.08,
            "psr_status": "Non-PSR",
            "celestial_body": "Moon",
            "description": "Classic complex crater with terraced walls and multi-peak central complex. Lunar 'Grand Canyon'.",
            "nasa_mission": "Apollo 12 / LRO"
        },
        {
            "crater_id": "haworth",
            "name": "Haworth Crater",
            "latitude": -87.5,
            "longitude": -5.1,
            "diameter_km": 51.0,
            "depth_m": 600.0,
            "avg_slope_deg": 8.2,
            "shadow_fraction": 0.72,
            "psr_status": "Confirmed PSR",
            "celestial_body": "Moon",
            "description": "South Pole shallow PSR crater. LCROSS impact site neighbor. Cold trap for volatiles.",
            "nasa_mission": "LCROSS / Diviner"
        },
        {
            "crater_id": "amundsen",
            "name": "Amundsen Crater",
            "latitude": -84.5,
            "longitude": 83.0,
            "diameter_km": 103.0,
            "depth_m": 2600.0,
            "avg_slope_deg": 14.5,
            "shadow_fraction": 0.42,
            "psr_status": "Partial PSR",
            "celestial_body": "Moon",
            "description": "Large South Polar basin with multiple PSR pockets. Candidate Artemis landing zone.",
            "nasa_mission": "LRO / Artemis"
        },
        {
            "crater_id": "jezero",
            "name": "Jezero Crater",
            "latitude": 18.38,
            "longitude": 77.58,
            "diameter_km": 45.0,
            "depth_m": 1200.0,
            "avg_slope_deg": 12.0,
            "shadow_fraction": 0.05,
            "psr_status": "Non-PSR",
            "celestial_body": "Mars",
            "description": "Ancient Martian lakebed containing a prominent clay-rich river delta fan. Landing site of Perseverance Rover.",
            "nasa_mission": "Mars 2020 / MRO"
        },
        {
            "crater_id": "chao_meng_fu",
            "name": "Chao Meng-Fu",
            "latitude": -87.3,
            "longitude": 134.2,
            "diameter_km": 167.0,
            "depth_m": 3500.0,
            "avg_slope_deg": 22.0,
            "shadow_fraction": 0.85,
            "psr_status": "Confirmed PSR",
            "celestial_body": "Mercury",
            "description": "Deep Mercurian polar crater. Despite proximity to the sun, the floor is permanently shadowed and contains confirmed water ice radar signatures.",
            "nasa_mission": "MESSENGER"
        }
    ]

def get_crater_dataset(crater_id):
    metadata = next((c for c in get_sample_craters_metadata() if c["crater_id"] == crater_id), None)
    if not metadata:
        return None

    grid = generate_crater_dem(crater_id)
    np_grid = np.array(grid)

    min_elev = float(np.min(np_grid))
    max_elev = float(np.max(np_grid))
    mean_elev = float(np.mean(np_grid))
    std_elev = float(np.std(np_grid))

    center_row = len(grid) // 2
    center_col = len(grid[0]) // 2
    cross_section_h = np_grid[center_row, :].tolist()
    cross_section_v = np_grid[:, center_col].tolist()

    size = len(grid)
    diag_elev = [float(np_grid[int(i * (size-1) / (size-1)), i]) for i in range(size)]

    pixel_scale_m = (metadata["diameter_km"] * 1000) / len(grid)
    dy, dx = np.gradient(np_grid, pixel_scale_m)
    slope_grid = np.arctan(np.sqrt(dx**2 + dy**2)) * (180.0 / np.pi)
    avg_slope = float(np.mean(slope_grid))
    max_slope = float(np.max(slope_grid))

    aspect_grid = (np.degrees(np.arctan2(-dx, dy)) % 360)
    roughness = float(np.std(np_grid - np.mean(np_grid)))

    return {
        "metadata": {
            **metadata,
            "min_elevation_m": min_elev,
            "max_elevation_m": max_elev,
            "mean_elevation_m": mean_elev,
            "std_elevation_m": std_elev,
            "calculated_avg_slope": avg_slope,
            "max_slope_deg": max_slope,
            "terrain_roughness": roughness,
            "pixel_scale_m": pixel_scale_m
        },
        "grid": grid,
        "cross_section": cross_section_h,
        "cross_section_v": cross_section_v,
        "cross_section_diag": diag_elev,
        "slope_grid": slope_grid.tolist(),
        "aspect_grid": aspect_grid.tolist()
    }
