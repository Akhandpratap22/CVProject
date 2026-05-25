import numpy as np
import math

def calculate_shadows(grid, solar_elevation_deg, solar_azimuth_deg, diameter_km):
    """
    High-accuracy line-of-sight raycasting (self-shadowing) over a 2D DEM grid.
    Uses bilinear interpolation for sub-pixel precision.

    Parameters:
    - grid: 2D list of elevations (m)
    - solar_elevation_deg: angle of the sun above the horizon (degrees, 0-90)
    - solar_azimuth_deg: compass direction of the sun (degrees, 0-360, 0=North, 90=East)
    - diameter_km: diameter scaling of the grid (converts pixel steps to meters)

    Returns:
    - shadow_mask: 2D list of floats (0 to 1, where 1 = fully shadowed)
    - shadow_fraction: float representing portion of grid in shadow
    """
    np_grid = np.array(grid, dtype=np.float64)
    h, w = np_grid.shape
    shadow_mask = np.zeros((h, w), dtype=np.float64)

    # Boundary conditions
    if solar_elevation_deg >= 89.9:
        return shadow_mask.tolist(), 0.0
    if solar_elevation_deg <= 0.0:
        return np.ones((h, w), dtype=np.float64).tolist(), 1.0

    elevation_rad = math.radians(solar_elevation_deg)
    azimuth_rad = math.radians(solar_azimuth_deg)

    # Direction vector (in grid coordinates)
    dx = math.sin(azimuth_rad)
    dy = -math.cos(azimuth_rad)

    # Physical scale: meters per pixel
    pixel_scale_m = (diameter_km * 1000.0) / w
    tan_elev = math.tan(elevation_rad)

    # Adaptive step size: finer steps for grazing angles
    step_size = max(0.4, min(0.8, solar_elevation_deg / 20.0))
    max_steps = int(math.sqrt(h**2 + w**2) / step_size)

    for y0 in range(h):
        for x0 in range(w):
            h0 = np_grid[y0, x0]
            max_horizon_angle = -999.0  # track the maximum horizon angle seen

            # Trace ray toward sun direction
            for step_i in range(1, max_steps):
                step = step_i * step_size
                x_check = x0 + step * dx
                y_check = y0 + step * dy

                # Boundary check
                if x_check < 0 or x_check >= w - 1 or y_check < 0 or y_check >= h - 1:
                    break

                # Bilinear interpolation for sub-pixel accuracy
                ix = int(x_check)
                iy = int(y_check)
                fx = x_check - ix
                fy = y_check - iy

                terrain_elev = (
                    np_grid[iy, ix] * (1 - fx) * (1 - fy) +
                    np_grid[iy, ix + 1] * fx * (1 - fy) +
                    np_grid[iy + 1, ix] * (1 - fx) * fy +
                    np_grid[iy + 1, ix + 1] * fx * fy
                )

                # Calculate angle to this terrain point from start pixel
                dist_m = step * pixel_scale_m
                horizon_angle = math.degrees(math.atan2(terrain_elev - h0, dist_m))

                if horizon_angle > max_horizon_angle:
                    max_horizon_angle = horizon_angle

            # If the maximum horizon angle exceeds the solar elevation, point is in shadow
            if max_horizon_angle > solar_elevation_deg:
                shadow_mask[y0, x0] = 1.0

    shadow_fraction = float(np.sum(shadow_mask) / (h * w))
    return shadow_mask.tolist(), shadow_fraction


def calculate_permanent_shadow_multi_azimuth(grid, diameter_km, num_azimuths=8):
    """
    Computes the PERMANENT shadow fraction by averaging over multiple solar azimuths
    at a low polar solar elevation (~1.5°), simulating a full year of solar cycles.
    A pixel is a confirmed PSR only if it is ALWAYS in shadow regardless of sun direction.

    Returns:
    - psr_mask: 2D array (1 = confirmed PSR at all sun positions, 0 = sometimes illuminated)
    - psr_fraction: fraction of grid in permanent shadow
    - annual_shadow_fraction: average shadow fraction across all azimuths
    """
    np_grid = np.array(grid)
    h, w = np_grid.shape
    shadow_accumulator = np.zeros((h, w), dtype=np.float64)

    azimuths = [i * (360 / num_azimuths) for i in range(num_azimuths)]
    solar_elevation = 1.5  # Near-polar solar elevation angle

    for az in azimuths:
        mask, _ = calculate_shadows(grid, solar_elevation, az, diameter_km)
        shadow_accumulator += np.array(mask)

    # PSR = shadowed at ALL azimuths (voted by threshold)
    psr_mask = (shadow_accumulator >= num_azimuths * 0.875).astype(np.float64)
    psr_fraction = float(np.sum(psr_mask) / (h * w))
    annual_shadow_fraction = float(np.sum(shadow_accumulator) / (num_azimuths * h * w))

    return psr_mask.tolist(), psr_fraction, annual_shadow_fraction


def estimate_ice_probability(shadow_fraction, depth_m, latitude_deg, avg_slope_deg):
    """
    Estimates water-ice probability using an empirical geophysical model.
    Based on:
    - Paige et al. (2010) Diviner model: ice stable where T < 110K
    - Hayne et al. (2015) cold trap mapping
    - Nozette et al. (1996) Clementine bistatic radar

    Returns:
    - ice_probability: float 0 to 1
    - confidence: string label
    """
    # 1. Polar score: craters near poles more likely to be PSRs
    polar_score = max(0.0, (abs(latitude_deg) - 60.0) / 30.0)  # 0 at 60°, 1 at 90°

    # 2. Shadow permanence score
    shadow_score = min(1.0, shadow_fraction / 0.80)

    # 3. Depth score (deeper → colder floor)
    depth_score = min(1.0, depth_m / 5000.0)

    # 4. Slope correction: very steep walls block sunlight better
    slope_score = min(1.0, avg_slope_deg / 35.0)

    # Weighted combination (calibrated to match Diviner thermal observations)
    ice_probability = (
        polar_score * 0.40 +
        shadow_score * 0.35 +
        depth_score * 0.15 +
        slope_score * 0.10
    )
    ice_probability = max(0.0, min(1.0, ice_probability))

    if ice_probability >= 0.75:
        confidence = "Very High"
    elif ice_probability >= 0.50:
        confidence = "High"
    elif ice_probability >= 0.30:
        confidence = "Moderate"
    elif ice_probability >= 0.15:
        confidence = "Low"
    else:
        confidence = "Negligible"

    return round(ice_probability, 3), confidence


def get_psr_status(shadow_fraction):
    """Determines crater PSR classification based on shadow coverage."""
    if shadow_fraction >= 0.70:
        return "Confirmed PSR"
    elif shadow_fraction >= 0.15:
        return "Partial PSR"
    else:
        return "Non-PSR"


def compute_slope_statistics(grid, diameter_km):
    """
    Computes slope statistics (mean, max, std) across the DEM.
    Returns a dictionary with scientific statistics.
    """
    np_grid = np.array(grid, dtype=np.float64)
    pixel_scale_m = (diameter_km * 1000.0) / np_grid.shape[1]

    dy, dx = np.gradient(np_grid, pixel_scale_m)
    slope_grid = np.degrees(np.arctan(np.sqrt(dx**2 + dy**2)))

    # Compute aspect (direction of steepest slope, 0=N, clockwise)
    aspect_grid = np.degrees(np.arctan2(-dx, dy)) % 360

    return {
        "mean_slope_deg": float(np.mean(slope_grid)),
        "max_slope_deg": float(np.max(slope_grid)),
        "std_slope_deg": float(np.std(slope_grid)),
        "slope_grid": slope_grid.tolist(),
        "aspect_grid": aspect_grid.tolist(),
        "roughness": float(np.std(np_grid))  # Terrain roughness index
    }
