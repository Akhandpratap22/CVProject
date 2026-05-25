from flask import Flask, jsonify, request
from flask_cors import CORS
import database
import sample_data
import detection
import psr_analyzer
import numpy as np
import os
import uuid
import pathfinding

app = Flask(__name__)
CORS(app)

def bootstrap_app():
    database.init_db()
    existing = database.get_all_craters()
    if not existing:
        print("Pre-populating database with NASA-inspired crater catalog...")
        for s in sample_data.get_sample_craters_metadata():
            database.insert_or_replace_crater(s)
        print("Pre-population complete.")

@app.route('/')
def index():
    return jsonify({
        "status": "online",
        "message": "Lunar Crater & PSR Topography Analysis API v2.0",
        "version": "2.0.0",
        "endpoints": ["/api/craters", "/api/craters/<id>", "/api/detect", "/api/psr_analysis/<id>"]
    })

@app.route('/api/craters', methods=['GET'])
def get_craters():
    try:
        craters = database.get_all_craters()
        return jsonify(craters)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/craters/<crater_id>', methods=['GET'])
def get_crater_details(crater_id):
    try:
        solar_elevation = float(request.args.get('solar_elevation', 5.0))
        solar_azimuth = float(request.args.get('solar_azimuth', 45.0))

        dataset = sample_data.get_crater_dataset(crater_id)
        if not dataset:
            db_crater = database.get_crater_by_id(crater_id)
            if db_crater:
                grid = sample_data.generate_crater_dem('shackleton')
                np_grid = np.array(grid)
                pixel_scale_m = (db_crater["diameter_km"] * 1000) / len(grid)
                dy, dx = np.gradient(np_grid, pixel_scale_m)
                slope = np.arctan(np.sqrt(dx**2 + dy**2)) * (180.0 / np.pi)
                dataset = {
                    "metadata": {
                        **db_crater,
                        "min_elevation_m": float(np_grid.min()),
                        "max_elevation_m": float(np_grid.max()),
                        "mean_elevation_m": float(np_grid.mean()),
                        "calculated_avg_slope": float(slope.mean()),
                        "pixel_scale_m": pixel_scale_m
                    },
                    "grid": grid,
                    "cross_section": np_grid[50, :].tolist(),
                    "cross_section_v": np_grid[:, 50].tolist(),
                    "slope_grid": slope.tolist(),
                    "aspect_grid": []
                }
            else:
                return jsonify({"error": f"Crater '{crater_id}' not found."}), 404

        # Computer vision detection pipeline
        cv_results = detection.run_crater_detection(dataset["grid"])

        # Shadow raycasting (fast single-azimuth for real-time response)
        shadow_mask, shadow_fraction = psr_analyzer.calculate_shadows(
            dataset["grid"], solar_elevation, solar_azimuth,
            dataset["metadata"]["diameter_km"]
        )

        psr_status = psr_analyzer.get_psr_status(shadow_fraction)

        # Slope statistics
        slope_stats = psr_analyzer.compute_slope_statistics(
            dataset["grid"], dataset["metadata"]["diameter_km"]
        )

        # Ice probability estimate
        ice_prob, ice_confidence = psr_analyzer.estimate_ice_probability(
            shadow_fraction=shadow_fraction,
            depth_m=cv_results.get("calculated_depth_m", dataset["metadata"]["depth_m"]),
            latitude_deg=dataset["metadata"]["latitude"],
            avg_slope_deg=slope_stats["mean_slope_deg"]
        )

        # Pathfinding to Crater Floor
        center_x = int(cv_results.get("center_x", len(dataset["grid"][0]) // 2))
        center_y = int(cv_results.get("center_y", len(dataset["grid"]) // 2))
        rover_path = pathfinding.calculate_rover_path(
            dataset["grid"], 
            (5, 5), # Start near rim
            (center_x, center_y), # Target center
            dataset["metadata"]["pixel_scale_m"]
        )

        # Persist updated values to DB
        database.insert_or_replace_crater({
            "crater_id": dataset["metadata"]["crater_id"],
            "name": dataset["metadata"]["name"],
            "latitude": dataset["metadata"]["latitude"],
            "longitude": dataset["metadata"]["longitude"],
            "diameter_km": dataset["metadata"]["diameter_km"],
            "depth_m": cv_results.get("calculated_depth_m", dataset["metadata"]["depth_m"]),
            "avg_slope_deg": slope_stats["mean_slope_deg"],
            "shadow_fraction": shadow_fraction,
            "psr_status": psr_status
        })

        return jsonify({
            "metadata": {
                **dataset["metadata"],
                "shadow_fraction": shadow_fraction,
                "psr_status": psr_status,
                "ice_probability": ice_prob,
                "ice_confidence": ice_confidence,
                "mean_slope_deg": slope_stats["mean_slope_deg"],
                "max_slope_deg": slope_stats["max_slope_deg"],
                "terrain_roughness": slope_stats["roughness"]
            },
            "grid": dataset["grid"],
            "cross_section": dataset["cross_section"],
            "cross_section_v": dataset.get("cross_section_v", []),
            "slope_grid": slope_stats["slope_grid"],
            "aspect_grid": slope_stats.get("aspect_grid", []),
            "shadow_mask": shadow_mask,
            "rover_path": rover_path,
            "cv_results": {
                "success": cv_results.get("success", False),
                "center_x": cv_results.get("center_x", 0),
                "center_y": cv_results.get("center_y", 0),
                "radius": cv_results.get("radius", 0),
                "method": cv_results.get("method", "Unknown"),
                "confidence": cv_results.get("confidence", 0.0),
                "rim_elevation_m": cv_results.get("rim_elevation_m", 0.0),
                "floor_elevation_m": cv_results.get("floor_elevation_m", 0.0),
                "calculated_depth_m": cv_results.get("calculated_depth_m", 0.0),
                "edges": cv_results.get("edges", []),
                "grayscale": cv_results.get("grayscale", [])
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/psr_analysis/<crater_id>', methods=['GET'])
def get_psr_analysis(crater_id):
    """
    Deep PSR analysis endpoint: multi-azimuth shadow casting for annual cycle simulation.
    Returns confirmed PSR mask, annual shadow fraction, and ice probability.
    """
    try:
        dataset = sample_data.get_crater_dataset(crater_id)
        if not dataset:
            return jsonify({"error": f"Crater '{crater_id}' not found."}), 404

        num_azimuths = int(request.args.get('num_azimuths', 12))
        psr_mask, psr_fraction, annual_shadow = psr_analyzer.calculate_permanent_shadow_multi_azimuth(
            dataset["grid"], dataset["metadata"]["diameter_km"], num_azimuths=num_azimuths
        )

        slope_stats = psr_analyzer.compute_slope_statistics(
            dataset["grid"], dataset["metadata"]["diameter_km"]
        )

        ice_prob, ice_conf = psr_analyzer.estimate_ice_probability(
            shadow_fraction=psr_fraction,
            depth_m=dataset["metadata"]["depth_m"],
            latitude_deg=dataset["metadata"]["latitude"],
            avg_slope_deg=slope_stats["mean_slope_deg"]
        )

        return jsonify({
            "crater_id": crater_id,
            "psr_mask": psr_mask,
            "psr_fraction": psr_fraction,
            "annual_shadow_fraction": annual_shadow,
            "num_azimuths_simulated": num_azimuths,
            "ice_probability": ice_prob,
            "ice_confidence": ice_conf,
            "latitude": dataset["metadata"]["latitude"],
            "diameter_km": dataset["metadata"]["diameter_km"]
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route('/api/detect', methods=['POST'])
def process_custom_dem():
    """
    Accepts custom DEM grids and runs the full analysis pipeline.
    Body: { "name", "latitude", "longitude", "diameter_km", "grid" (2D array) }
    """
    try:
        data = request.get_json()
        if not data or 'grid' not in data:
            return jsonify({"error": "Missing 'grid' in request."}), 400

        name = data.get('name', 'Custom Crater')
        latitude = float(data.get('latitude', 0.0))
        longitude = float(data.get('longitude', 0.0))
        diameter_km = float(data.get('diameter_km', 10.0))
        grid = data['grid']

        np_grid = np.array(grid, dtype=np.float32)
        if len(np_grid.shape) != 2:
            return jsonify({"error": "Grid must be a 2D matrix."}), 400

        # Detection pipeline
        cv_results = detection.run_crater_detection(grid)

        # Slope analysis
        slope_stats = psr_analyzer.compute_slope_statistics(grid, diameter_km)

        # Shadow analysis
        shadow_mask, shadow_fraction = psr_analyzer.calculate_shadows(
            grid, 5.0, 45.0, diameter_km
        )
        psr_status = psr_analyzer.get_psr_status(shadow_fraction)

        # Ice probability
        depth_m = cv_results.get("calculated_depth_m", float(np_grid.max() - np_grid.min()))
        ice_prob, ice_conf = psr_analyzer.estimate_ice_probability(
            shadow_fraction=shadow_fraction,
            depth_m=depth_m,
            latitude_deg=latitude,
            avg_slope_deg=slope_stats["mean_slope_deg"]
        )

        crater_id = "custom_" + uuid.uuid4().hex[:8]
        new_crater = {
            "crater_id": crater_id, "name": name, "latitude": latitude,
            "longitude": longitude, "diameter_km": diameter_km, "depth_m": depth_m,
            "avg_slope_deg": slope_stats["mean_slope_deg"],
            "shadow_fraction": shadow_fraction, "psr_status": psr_status
        }
        database.insert_or_replace_crater(new_crater)

        center_row = len(grid) // 2
        center_col = len(grid[0]) // 2

        return jsonify({
            "metadata": {
                **new_crater,
                "min_elevation_m": float(np_grid.min()),
                "max_elevation_m": float(np_grid.max()),
                "mean_elevation_m": float(np_grid.mean()),
                "ice_probability": ice_prob,
                "ice_confidence": ice_conf
            },
            "grid": grid,
            "cross_section": np_grid[center_row, :].tolist(),
            "cross_section_v": np_grid[:, center_col].tolist(),
            "slope_grid": slope_stats["slope_grid"],
            "shadow_mask": shadow_mask,
            "cv_results": {
                "success": cv_results.get("success", False),
                "center_x": cv_results.get("center_x", 0),
                "center_y": cv_results.get("center_y", 0),
                "radius": cv_results.get("radius", 0),
                "method": cv_results.get("method", "Unknown"),
                "confidence": cv_results.get("confidence", 0.0),
                "rim_elevation_m": cv_results.get("rim_elevation_m", 0.0),
                "floor_elevation_m": cv_results.get("floor_elevation_m", 0.0),
                "calculated_depth_m": depth_m,
                "edges": cv_results.get("edges", []),
                "grayscale": cv_results.get("grayscale", [])
            }
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


bootstrap_app()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
