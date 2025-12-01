# Truck Parking Map Netherlands

**This is an experimental proof-of-concept, built in a few hours. It is not production-ready and should be treated as a prototype/demonstration only.**

An interactive web application for visualizing truck parking facilities (verzorgingsplaatsen) across the Netherlands and Europe. The application combines OpenStreetMap data, real-time NDW occupancy information, and European-wide parking data to provide comprehensive information about rest areas, service areas, and dedicated truck parking locations.

## Features

- Interactive map with multiple base layers (OSM, Satellite, PDOK Aerial, Topographic)
- Real-time parking occupancy data from NDW
- ~1,425 facilities from OpenStreetMap Netherlands
- 19,713 European truck parking facilities from Zenodo/Fraunhofer
- Satellite-based parking space orientation detection
- Search and filter by province, municipality, or highway
- Facility type filtering (truck parking, service areas, rest areas)

## Tech Stack

- Next.js 16 with App Router
- React 19.2.0
- Leaflet + react-leaflet for mapping
- Tailwind CSS + shadcn/ui components
- Turf.js for geospatial calculations

## Getting Started

```bash
cd truck-parking-map
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Data Sources

- **OpenStreetMap**: Community-maintained geographic database
- **NDW**: Nationale Databank Wegverkeersgegevens (Dutch National Traffic Data Bank)
- **Zenodo**: Fraunhofer Institute truck parking dataset (DOI: 10.5281/zenodo.10231359)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

*This project is an experiment/proof-of-concept and is not affiliated with or endorsed by any government agency or organization.*
