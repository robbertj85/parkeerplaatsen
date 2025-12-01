# Car Parking Map Netherlands

**This is an experimental proof-of-concept. It is not production-ready and should be treated as a prototype/demonstration only.**

An interactive web application for visualizing car parking across the Netherlands. The application combines multiple open data sources to provide comprehensive information about parking garages, on-street parking (paid and free), P+R facilities, and individual parking spots, including real-time occupancy where available.

## Features

- Interactive map with multiple base layers (OSM, Satellite, PDOK Aerial, Topographic)
- Real-time parking garage occupancy data from RDW/NPR
- Parking garages and surface lots
- On-street parking: paid zones and free parking
- P+R (Park & Ride) facilities
- Individual parking spots (where data available, e.g., Amsterdam)
- Search and filter by province, municipality
- Parking type filtering
- City-level parking statistics

## Data Sources

See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for comprehensive documentation.

### National Sources
- **RDW Open Data**: Parking garages, real-time occupancy (~2,500+ facilities)
- **NPR**: Nationaal Parkeerregister - tariffs, zones, regulations
- **OpenStreetMap**: ~50,000+ parking locations via Overpass API
- **NDW**: Real-time traffic and parking data

### Municipal Sources
- **Amsterdam**: Individual parking spots (parkeervakken) - most detailed
- **Eindhoven**: Parkeerplaatsen dataset
- **Rotterdam, Den Haag, Utrecht**: Via RDW/NPR

### Specialized
- **P+R Facilities**: 50+ locations via RDW
- **CBS Statistics**: Municipality-level data

## Tech Stack

- Next.js 16 with App Router
- React 19.2.0
- Leaflet + react-leaflet for mapping
- Tailwind CSS + shadcn/ui components
- Turf.js for geospatial calculations

## Getting Started

```bash
cd car-parking-map
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
parkeerplaatsen/
├── car-parking-map/     # Next.js web application
├── scripts/             # Python data extraction scripts
├── data/                # Raw and processed parking data
├── docs/                # Documentation
│   └── DATA_SOURCES.md  # Comprehensive data sources guide
└── CLAUDE.md            # Development guidance
```

## Parking Types

| Type | Description | Color |
|------|-------------|-------|
| Parking Garage | Multi-storey/underground | Blue |
| Surface Lot | Surface parking lots | Green |
| Street Paid | On-street paid parking | Orange |
| Street Free | On-street free parking | Gray |
| P+R | Park & Ride | Purple |
| Disabled | Accessible spots | Yellow |

## License

MIT License - see [LICENSE](LICENSE) for details.

---

*This project is an experiment/proof-of-concept and is not affiliated with or endorsed by any government agency or organization.*
