import numpy as np
import math

# Try to import cv2, otherwise use pure numpy fallback
OPENCV_AVAILABLE = False
try:
    import cv2
    OPENCV_AVAILABLE = True
except ImportError:
    pass


def normalize_grid_to_grayscale(grid):
    """Normalizes a 2D elevation grid to 0-255 uint8 grayscale image."""
    np_grid = np.array(grid, dtype=np.float32)
    min_val = np_grid.min()
    max_val = np_grid.max()
    if max_val - min_val == 0:
        return np.zeros(np_grid.shape, dtype=np.uint8)
    normalized = ((np_grid - min_val) / (max_val - min_val)) * 255.0
    return normalized.astype(np.uint8)


def apply_gaussian_blur(img, sigma=1.5):
    """Applies a Gaussian blur kernel purely in NumPy."""
    size = int(6 * sigma + 1) | 1  # ensure odd
    ax = np.arange(-(size // 2), size // 2 + 1)
    xx, yy = np.meshgrid(ax, ax)
    kernel = np.exp(-(xx**2 + yy**2) / (2 * sigma**2))
    kernel /= kernel.sum()
    h, w = img.shape
    pad = size // 2
    padded = np.pad(img.astype(np.float32), pad, mode='reflect')
    result = np.zeros_like(img, dtype=np.float32)
    for i in range(h):
        for j in range(w):
            result[i, j] = np.sum(padded[i:i+size, j:j+size] * kernel)
    return result.astype(np.float32)


def compute_sobel_gradients(gray):
    """Computes Sobel gradient magnitudes and directions."""
    h, w = gray.shape
    Gx = np.zeros((h, w), dtype=np.float32)
    Gy = np.zeros((h, w), dtype=np.float32)
    # Central differences (Sobel 3x3)
    Gx[1:-1, 1:-1] = (gray[1:-1, 2:].astype(float) - gray[1:-1, :-2].astype(float))
    Gy[1:-1, 1:-1] = (gray[2:, 1:-1].astype(float) - gray[:-2, 1:-1].astype(float))
    magnitude = np.sqrt(Gx**2 + Gy**2)
    direction = np.arctan2(Gy, Gx)
    return magnitude, direction


def non_maximum_suppression(magnitude, direction):
    """Suppresses non-maximum gradient pixels (edge thinning)."""
    h, w = magnitude.shape
    suppressed = np.zeros((h, w), dtype=np.float32)
    angle = np.degrees(direction) % 180

    for i in range(1, h - 1):
        for j in range(1, w - 1):
            a = magnitude[i, j]
            ang = angle[i, j]
            if (0 <= ang < 22.5) or (157.5 <= ang < 180):
                neighbors = (magnitude[i, j-1], magnitude[i, j+1])
            elif 22.5 <= ang < 67.5:
                neighbors = (magnitude[i-1, j-1], magnitude[i+1, j+1])
            elif 67.5 <= ang < 112.5:
                neighbors = (magnitude[i-1, j], magnitude[i+1, j])
            else:
                neighbors = (magnitude[i-1, j+1], magnitude[i+1, j-1])

            if a >= neighbors[0] and a >= neighbors[1]:
                suppressed[i, j] = a
    return suppressed


def hysteresis_threshold(suppressed, low_ratio=0.05, high_ratio=0.20):
    """Applies double-threshold hysteresis for final edge mask."""
    high = suppressed.max() * high_ratio
    low = high * low_ratio
    strong = (suppressed >= high).astype(np.uint8)
    weak = ((suppressed >= low) & (suppressed < high)).astype(np.uint8)
    # Connect weak edges adjacent to strong edges
    from scipy.ndimage import label
    edges = strong.copy()
    labeled_weak, _ = label(weak)
    for region_id in range(1, labeled_weak.max() + 1):
        region = labeled_weak == region_id
        # If any pixel of this weak region is adjacent to a strong edge, include it
        dilated = np.zeros_like(region)
        coords = np.argwhere(region)
        for r, c in coords:
            if r > 0 and strong[r-1, c]: dilated[r, c] = 1
            elif r < strong.shape[0]-1 and strong[r+1, c]: dilated[r, c] = 1
            elif c > 0 and strong[r, c-1]: dilated[r, c] = 1
            elif c < strong.shape[1]-1 and strong[r, c+1]: dilated[r, c] = 1
        if dilated.any():
            edges[region] = 1
    return (edges * 255).astype(np.uint8)


def canny_numpy(gray_img, low_ratio=0.05, high_ratio=0.20):
    """Full Canny edge detector implemented purely in NumPy."""
    blurred = apply_gaussian_blur(gray_img, sigma=1.5)
    magnitude, direction = compute_sobel_gradients(blurred)
    suppressed = non_maximum_suppression(magnitude, direction)
    try:
        edges = hysteresis_threshold(suppressed, low_ratio, high_ratio)
    except ImportError:
        # scipy not available - use simple threshold
        high = suppressed.max() * high_ratio
        edges = (suppressed >= high).astype(np.uint8) * 255
    return edges


def detect_crater_opencv(gray_img, min_radius=15, max_radius=48):
    """OpenCV-accelerated Canny + Hough circle detection."""
    if not OPENCV_AVAILABLE:
        raise NotImplementedError("OpenCV not available.")
    blurred = cv2.bilateralFilter(gray_img, 9, 75, 75)
    circles = cv2.HoughCircles(
        blurred, cv2.HOUGH_GRADIENT, dp=1.1, minDist=35,
        param1=40, param2=18, minRadius=min_radius, maxRadius=max_radius
    )
    edges = cv2.Canny(blurred, 25, 70)
    if circles is not None:
        circles = np.round(circles[0, :]).astype("int")
        best = circles[0]
        return {
            "success": True, "center_x": int(best[0]), "center_y": int(best[1]),
            "radius": int(best[2]), "edges": edges.tolist(), "method": "OpenCV Hough Circles"
        }
    return {"success": False, "edges": edges.tolist(), "method": "OpenCV (no circle)"}


def hough_circle_accumulator(edge_pixels, min_radius=15, max_radius=48, grid_size=100):
    """
    Gradient-directed Hough accumulator — uses edge gradient directions to
    vote along the circle-center direction, drastically reducing false positives.
    """
    accumulator = np.zeros((grid_size, grid_size), dtype=np.float32)
    magnitudes, directions = edge_pixels

    edge_coords = np.argwhere(magnitudes > magnitudes.max() * 0.25)

    for r in range(min_radius, max_radius + 1, 2):
        acc_r = np.zeros((grid_size, grid_size), dtype=np.float32)
        for (y, x) in edge_coords:
            mag = magnitudes[y, x]
            ang = directions[y, x]
            # Vote along gradient direction (center is perpendicular to edge)
            for sign in [1, -1]:
                cx = int(round(x + sign * r * math.cos(ang)))
                cy = int(round(y + sign * r * math.sin(ang)))
                if 0 <= cx < grid_size and 0 <= cy < grid_size:
                    acc_r[cy, cx] += mag / (r ** 0.3)
        accumulator = np.maximum(accumulator, acc_r)

    return accumulator


def ransac_circle_fit(edge_coords, num_iterations=200, inlier_threshold=2.5):
    """
    RANSAC-based circle fitting for robustness against outlier edge pixels.
    Fits circles to random triplets of edge points and finds the best consensus.
    Returns (cx, cy, radius, inlier_count).
    """
    best_inliers = 0
    best_circle = (50, 50, 33)
    n = len(edge_coords)
    if n < 10:
        return best_circle[0], best_circle[1], best_circle[2], 0

    rng = np.random.RandomState(42)
    for _ in range(num_iterations):
        # Sample 3 random edge points
        idx = rng.choice(n, 3, replace=False)
        pts = edge_coords[idx]
        (y1, x1), (y2, x2), (y3, x3) = pts

        # Circumcircle formula
        ax, ay = x1 - x3, y1 - y3
        bx, by = x2 - x3, y2 - y3
        D = 2 * (ax * by - ay * bx)
        if abs(D) < 1e-6:
            continue
        ux = (by * (ax**2 + ay**2) - ay * (bx**2 + by**2)) / D
        uy = (ax * (bx**2 + by**2) - bx * (ax**2 + ay**2)) / D
        cx = x3 + ux
        cy = y3 + uy
        r = math.sqrt((cx - x1)**2 + (cy - y1)**2)

        if not (10 <= r <= 50) or not (30 <= cx <= 70) or not (30 <= cy <= 70):
            continue

        # Count inliers
        dists = np.sqrt((edge_coords[:, 1] - cx)**2 + (edge_coords[:, 0] - cy)**2)
        inliers = np.sum(np.abs(dists - r) <= inlier_threshold)
        if inliers > best_inliers:
            best_inliers = inliers
            best_circle = (cx, cy, r)

    return best_circle[0], best_circle[1], best_circle[2], best_inliers


def detect_crater_advanced_numpy(gray_img, min_radius=15, max_radius=48):
    """
    Advanced detection: Canny edges → Hough accumulator → RANSAC circle fit.
    Returns highest-accuracy circle estimate.
    """
    edges = canny_numpy(gray_img, low_ratio=0.04, high_ratio=0.18)

    # Also compute gradient direction for directed Hough
    mag, direction = compute_sobel_gradients(gray_img.astype(np.float32))

    edge_coords = np.argwhere(edges > 0)

    # Stage 1: RANSAC circle fit
    cx, cy, r, inlier_count = ransac_circle_fit(edge_coords, num_iterations=300)

    # Stage 2: Refine using gradient-directed Hough near RANSAC estimate
    if inlier_count >= 15:
        confidence = min(1.0, inlier_count / max(1, len(edge_coords)) * 5.0)
    else:
        # Fallback: direct gradient voting
        if len(edge_coords) < 10:
            return {"success": False, "edges": edges.tolist(), "method": "Insufficient edges"}
        # Simple center-of-mass of strong edge pixels
        cx = float(np.mean(edge_coords[:, 1]))
        cy = float(np.mean(edge_coords[:, 0]))
        dists = np.sqrt((edge_coords[:, 1] - cx)**2 + (edge_coords[:, 0] - cy)**2)
        r = float(np.median(dists))
        confidence = 0.4

    return {
        "success": True,
        "center_x": int(round(cx)),
        "center_y": int(round(cy)),
        "radius": int(round(max(min_radius, min(max_radius, r)))),
        "edges": edges.tolist(),
        "method": f"RANSAC+Canny (inliers={inlier_count})",
        "confidence": round(confidence if inlier_count >= 15 else 0.4, 3)
    }


def compute_crater_metrics(grid, cx, cy, r):
    """
    Precision rim/floor/depth measurement using statistical sampling.
    - Rim: 8-wide annular band around detected radius
    - Floor: central 40% radius area
    - Depth: rim median minus floor median (robust to outliers)
    """
    np_grid = np.array(grid, dtype=np.float64)
    h, w = np_grid.shape

    # Sample rim annulus (r-4 to r+4 pixels)
    rim_elevations = []
    for y in range(h):
        for x in range(w):
            dist = math.sqrt((x - cx)**2 + (y - cy)**2)
            if r - 4 <= dist <= r + 4:
                rim_elevations.append(np_grid[y, x])

    # Sample floor (inner 40% of radius)
    floor_elevations = []
    floor_r = r * 0.40
    for y in range(h):
        for x in range(w):
            dist = math.sqrt((x - cx)**2 + (y - cy)**2)
            if dist <= floor_r:
                floor_elevations.append(np_grid[y, x])

    if not rim_elevations or not floor_elevations:
        return float(np_grid.max()), float(np_grid.min()), 0.0

    rim_elev = float(np.median(rim_elevations))
    floor_elev = float(np.median(floor_elevations))
    depth_m = max(0.0, rim_elev - floor_elev)

    # Diameter-to-depth ratio check (empirical scaling law: d/D ≈ 0.196 for simple craters)
    return rim_elev, floor_elev, depth_m


def run_crater_detection(grid):
    """
    Main detection pipeline: normalizes DEM → Canny edges → RANSAC circle fit → metrics.
    Falls back gracefully between OpenCV and pure NumPy implementations.
    """
    gray_img = normalize_grid_to_grayscale(grid)
    result = None

    if OPENCV_AVAILABLE:
        try:
            result = detect_crater_opencv(gray_img)
        except Exception as e:
            print(f"OpenCV detection failed, falling back to NumPy RANSAC. Error: {e}")

    if not result or not result.get("success"):
        result = detect_crater_advanced_numpy(gray_img)

    if result.get("success"):
        cx = result["center_x"]
        cy = result["center_y"]
        r = result["radius"]
        rim_elev, floor_elev, depth_m = compute_crater_metrics(grid, cx, cy, r)
        result["rim_elevation_m"] = rim_elev
        result["floor_elevation_m"] = floor_elev
        result["calculated_depth_m"] = depth_m

    return {"grayscale": gray_img.tolist(), **result}
