import numpy as np
import heapq

def heuristic(a, b):
    # Euclidean distance
    return np.sqrt((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)

def calculate_rover_path(elevation_grid, start_pos, target_pos, resolution_m=30.0):
    """
    Kinematic A* Pathfinding over a DEM grid.
    Finds the safest route avoiding steep slopes.
    """
    grid = np.array(elevation_grid)
    rows, cols = grid.shape
    
    # Calculate slope grid
    dy, dx = np.gradient(grid, resolution_m)
    slope_grid = np.arctan(np.sqrt(dx**2 + dy**2)) * (180.0 / np.pi)
    
    # Pathfinding structures
    open_set = []
    heapq.heappush(open_set, (0, start_pos))
    came_from = {}
    
    g_score = {start_pos: 0}
    f_score = {start_pos: heuristic(start_pos, target_pos)}
    
    while open_set:
        current = heapq.heappop(open_set)[1]
        
        if current == target_pos:
            # Reconstruct path
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start_pos)
            path.reverse()
            return path
            
        for dx, dy in [(0, 1), (1, 0), (0, -1), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)]:
            neighbor = (current[0] + dx, current[1] + dy)
            
            if 0 <= neighbor[0] < cols and 0 <= neighbor[1] < rows:
                # Get slope at neighbor
                slope = slope_grid[neighbor[1], neighbor[0]]
                
                # Kinematic constraint: Rover cannot climb > 15 deg
                if slope > 15.0:
                    continue
                    
                # Cost function: Distance + heavy penalty for steep slopes
                dist = np.sqrt(dx**2 + dy**2)
                slope_penalty = (slope / 15.0) ** 2 * 10.0
                tentative_g_score = g_score[current] + dist + slope_penalty
                
                if neighbor not in g_score or tentative_g_score < g_score[neighbor]:
                    came_from[neighbor] = current
                    g_score[neighbor] = tentative_g_score
                    f_score[neighbor] = tentative_g_score + heuristic(neighbor, target_pos)
                    heapq.heappush(open_set, (f_score[neighbor], neighbor))
                    
    return [] # No path found
