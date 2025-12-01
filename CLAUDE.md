# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an interactive web application for visualizing **car parking** in the Netherlands. The application aims to provide comprehensive data about all types of car parking: parking garages, on-street parking (paid and free), P+R facilities, and individual parking spots. It includes real-time occupancy data where available and city-level statistics.

## Project Structure

```
parkeerplaatsen/
├── car-parking-map/            # Next.js web application (renamed from truck-parking-map)
│   ├── app/                    # Next.js app directory
│   │   ├── page.tsx           # Main map page (uses dynamic import)
│   │   └── layout.tsx         # Root layout
│   ├── components/            # React components
│   │   ├── car-parking-map.tsx  # Main map component
│   │   └── ui/                # shadcn/ui components
│   ├── lib/                   # Utilities (cn helper)
│   └── public/                # Static files and data
├── scripts/                   # Python scripts for data extraction/processing
├── data/                      # Raw and processed parking data
├── docs/                      # Documentation
│   └── DATA_SOURCES.md        # Comprehensive data sources documentation
├── .git/                      # Version control
├── .gitignore                 # Git configuration
└── CLAUDE.md                  # This file
```

## Development Commands

All commands should be run from the `car-parking-map/` directory:

```bash
cd car-parking-map

# Development server (localhost:3000, or 3001 if 3000 is in use)
npm run dev

# Production build
npm run build

# Start production server
npm start

# Lint code
npm run lint
```

## Technical Architecture

### Stack

- **Framework**: Next.js 16 with App Router
- **React**: Version 19.2.0 (Client components only - uses `"use client"`)
- **Styling**: Tailwind CSS 3.4 with PostCSS 4.1
- **UI Components**: shadcn/ui with Radix UI primitives
- **Mapping**: Leaflet 1.9.4 + react-leaflet 5.0
- **Geospatial**: Turf.js for area calculations and bounding boxes

### Critical Patterns

#### Leaflet SSR Handling (IMPORTANT!)
The map component uses dynamic imports with `ssr: false` to avoid Leaflet's window/document dependencies during server-side rendering:

```typescript
// app/page.tsx
const CarParkingMap = dynamic(
  () => import("@/components/car-parking-map"),
  { ssr: false, loading: () => <div>Loading map...</div> }
);
```

**Note**: This causes an expected "BAILOUT_TO_CLIENT_SIDE_RENDERING" message in development - this is normal and not an error!

#### Leaflet Icon Fix for Next.js
Leaflet default icons don't work out of the box with Next.js. The map component includes this fix:

```typescript
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png"
});
```

#### Client-Only Components
All interactive map components must use `"use client"` directive since Leaflet requires browser APIs.

## Data Sources Overview

See `docs/DATA_SOURCES.md` for comprehensive documentation. Key sources:

### National Level
- **RDW Open Data** (opendata.rdw.nl) - Parking garages, real-time occupancy
- **NPR** (Nationaal Parkeerregister) - Tariffs, zones, regulations
- **NDW** (Nationaal Dataportaal Wegverkeer) - Real-time parking data
- **OpenStreetMap** - All parking types via Overpass API

### Municipal Level
- **Amsterdam**: data.amsterdam.nl - Parkeervakken API (individual spots)
- **Rotterdam**: Open data portal
- **Den Haag**: Via RDW/NPR
- **Utrecht**: Via RDW/NPR
- **Eindhoven**: data.eindhoven.nl - Parkeerplaatsen dataset

### Specialized
- **P+R Facilities**: Via RDW open data platform
- **CBS Statistics**: Municipality-level statistics

## Parking Types & Colors

- **parking_garage**: Multi-storey/underground parking (blue #3b82f6)
- **surface_lot**: Surface parking lots (green #10b981)
- **street_parking_paid**: On-street paid parking (orange #f97316)
- **street_parking_free**: On-street free parking (gray #6b7280)
- **p_and_r**: Park & Ride facilities (purple #8b5cf6)
- **disabled**: Disabled parking spots (yellow #eab308)

## Data Schema

### ParkingFacility (main data type)

```typescript
interface ParkingFacility {
  id: string;
  name: string;
  type: 'garage' | 'surface' | 'street_paid' | 'street_free' | 'p_and_r';
  geometry: GeoJSON.Geometry;
  latitude: number;
  longitude: number;

  // Location
  municipality: string;
  province: string;
  neighborhood?: string;

  // Capacity
  capacity?: number;
  available?: number;  // Real-time if available

  // Pricing
  tariff_per_hour?: number;
  tariff_per_day?: number;
  free_parking_hours?: number;

  // Metadata
  source: 'osm' | 'rdw' | 'municipal' | 'npr';
  last_updated: string;

  // Features
  features?: {
    ev_charging?: boolean;
    disabled_spots?: number;
    covered?: boolean;
    guarded?: boolean;
    reservation_possible?: boolean;
  };
}
```

### CityStatistics

```typescript
interface CityStatistics {
  municipality: string;
  province: string;

  // Counts
  total_parking_spots: number;
  garage_spots: number;
  street_spots_paid: number;
  street_spots_free: number;
  p_and_r_spots: number;

  // Occupancy (if available)
  average_occupancy?: number;
  peak_occupancy?: number;

  // Pricing
  average_hourly_rate?: number;

  // Meta
  data_completeness: number; // 0-1
}
```

## Domain Context

### Dutch Parking System

**Key Stakeholders**:
- **Municipalities**: Set parking policy, zones, tariffs
- **RDW**: National vehicle authority, manages NPR
- **NPR** (Nationaal Parkeerregister): National parking register
- **Private operators**: Q-Park, P1, APCOA, etc.

**Key Terms**:
- **Parkeergebied**: Parking area/zone
- **Parkeervak**: Individual parking spot
- **Betaald parkeren**: Paid parking
- **Vergunninghouders**: Permit holders
- **Tariefgebied**: Tariff zone
- **P+R**: Park & Ride

**Data Standards**:
- **SPDP 2.0**: Standard for Publication of Dynamic Parking Data
- **DATEX II**: European standard for road traffic data

## File Naming Conventions

- React components: `kebab-case.tsx` for file names
- Component names: `PascalCase`
- UI components from shadcn: lowercase with hyphens (e.g., `button.tsx`)
- Data files: `snake_case.json` or `snake_case.geojson`
- Python scripts: `snake_case.py`
