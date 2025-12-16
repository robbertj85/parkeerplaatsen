#!/usr/bin/env python3
"""
Master script to fetch all parking data sources and merge them.
Run this to update all parking data.
"""

import subprocess
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent


def run_script(script_name: str) -> bool:
    """Run a Python script and return success status."""
    script_path = SCRIPT_DIR / script_name
    print(f"\n{'='*60}")
    print(f"Running: {script_name}")
    print('='*60)

    result = subprocess.run(
        [sys.executable, str(script_path)],
        cwd=SCRIPT_DIR.parent
    )

    return result.returncode == 0


def main():
    scripts = [
        ("fetch_osm_parking.py", "OpenStreetMap parking data"),
        ("fetch_rdw_parking.py", "RDW/NPR parking garages"),
        ("fetch_amsterdam_parking.py", "Amsterdam parkeervakken"),
        ("fetch_utrecht_parking.py", "Utrecht P-route parking"),
        ("fetch_eindhoven_parking.py", "Eindhoven parkeerplaatsen"),
        ("merge_parking_data.py", "Merge all data sources"),
    ]

    results = []

    for script, description in scripts:
        print(f"\n>>> {description}")
        success = run_script(script)
        results.append((script, success))

        if not success:
            print(f"Warning: {script} failed, continuing with other scripts...")

    print("\n" + "="*60)
    print("SUMMARY")
    print("="*60)

    for script, success in results:
        status = "OK" if success else "FAILED"
        print(f"  {script}: {status}")

    all_success = all(s for _, s in results)

    if all_success:
        print("\nAll scripts completed successfully!")
        print("\nData files created in:")
        print("  - data/osm_parking_nl.json")
        print("  - data/rdw_parking_nl.json")
        print("  - data/amsterdam_parkeervakken.json")
        print("  - car-parking-map/public/parking_data.json")
        print("  - car-parking-map/public/parking_data.geojson")
        print("  - car-parking-map/public/city_statistics.json")
    else:
        print("\nSome scripts failed. Check output above for details.")

    return 0 if all_success else 1


if __name__ == "__main__":
    sys.exit(main())
