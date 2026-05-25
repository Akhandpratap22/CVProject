import unittest
import numpy as np
import os
import sys

# Append current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import database
import sample_data
import detection
import psr_analyzer

class TestLunarAnalysisBackend(unittest.TestCase):
    
    @classmethod
    def setUpClass(cls):
        # Set up a test database
        database.DATABASE_PATH = 'test_lunar_craters.db'
        database.init_db()
        
    @classmethod
    def tearDownClass(cls):
        # Remove the test database file
        if os.path.exists('test_lunar_craters.db'):
            try:
                os.remove('test_lunar_craters.db')
            except OSError:
                pass

    def test_database_operations(self):
        """Tests that craters can be successfully stored, retrieved, and queried."""
        test_crater = {
            "crater_id": "test_crater_99",
            "name": "Apollo Test Crater",
            "latitude": -78.4,
            "longitude": 12.5,
            "diameter_km": 12.0,
            "depth_m": 2200.0,
            "avg_slope_deg": 18.5,
            "shadow_fraction": 0.45,
            "psr_status": "Partial PSR"
        }
        database.insert_or_replace_crater(test_crater)
        
        # Test get by ID
        fetched = database.get_crater_by_id("test_crater_99")
        self.assertIsNotNone(fetched)
        self.assertEqual(fetched["name"], "Apollo Test Crater")
        self.assertEqual(fetched["latitude"], -78.4)
        
        # Test get all
        all_craters = database.get_all_craters()
        self.assertTrue(len(all_craters) >= 1)

    def test_dem_generation(self):
        """Tests that mathematical models produce expected dimensions and elevations."""
        grid = sample_data.generate_crater_dem('shackleton')
        np_grid = np.array(grid)
        
        self.assertEqual(np_grid.shape, (100, 100))
        # Shackleton is deep, so min elevation should be negative (floor)
        self.assertTrue(np_grid.min() < 0)
        # Rim should be positive
        self.assertTrue(np_grid.max() > 0)

    def test_crater_detection_fallback(self):
        """Tests that the numpy circle voter successfully detects circles in synthetic grids."""
        grid = sample_data.generate_crater_dem('shackleton')
        result = detection.run_crater_detection(grid)
        
        self.assertTrue(result["success"])
        self.assertIn("center_x", result)
        self.assertIn("center_y", result)
        self.assertIn("radius", result)
        
        # The center should be roughly in the middle of our 100x100 grid (45 to 55)
        self.assertTrue(40 <= result["center_x"] <= 60)
        self.assertTrue(40 <= result["center_y"] <= 60)
        # Radius should be reasonable (between 25 and 40 pixels)
        self.assertTrue(25 <= result["radius"] <= 40)
        self.assertTrue(result["calculated_depth_m"] > 3000)

    def test_raytracing_shadows(self):
        """Tests that shadow raycasting detects dynamic shadow changes."""
        grid = sample_data.generate_crater_dem('shackleton')
        
        # 1. High sun angle (80 deg) -> little to no shadow
        shadow_mask_high, shadow_frac_high = psr_analyzer.calculate_shadows(grid, 80.0, 45.0, 21.0)
        
        # 2. Low sun angle (2 deg) -> extreme shadowing
        shadow_mask_low, shadow_frac_low = psr_analyzer.calculate_shadows(grid, 2.0, 45.0, 21.0)
        
        self.assertTrue(shadow_frac_low > shadow_frac_high)
        # Low sun angle should shadow a massive portion of the bowl
        self.assertTrue(shadow_frac_low > 0.5)

if __name__ == '__main__':
    unittest.main()
