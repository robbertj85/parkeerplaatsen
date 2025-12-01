# Dutch Truck Parking Facilities Map

A modern Next.js application displaying an interactive map of truck parking facilities across the Netherlands. Built with TypeScript, Tailwind CSS, shadcn/ui components, and React Leaflet.

## Features

- **Interactive Map**: Explore 1,425+ truck parking facilities across the Netherlands
- **Facility Types**:
  - Truck Parking (558 locations)
  - Service Areas (495 locations)
  - Rest Areas (372 locations)
- **Filtering**: Toggle facility types on/off to customize the map view
- **Detailed Information**: Click on any facility to view:
  - Name and location
  - Capacity (where available)
  - Highway information
  - Province and municipality
  - Available amenities
- **Responsive Design**: Modern UI built with Tailwind CSS and shadcn/ui
- **Beautiful Icons**: Lucide React icons throughout

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3
- **Components**: shadcn/ui
- **Icons**: Lucide React
- **Maps**: React Leaflet + OpenStreetMap
- **Data Source**: OpenStreetMap (GeoJSON format)

## Getting Started

### Prerequisites

- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Install dependencies:
```bash
npm install
```

2. Run the development server:
```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000) in your browser

### Build for Production

```bash
npm run build
npm start
```

## Project Structure

```
truck-parking-map/
├── app/
│   ├── globals.css          # Global styles with Tailwind CSS
│   ├── layout.tsx            # Root layout
│   └── page.tsx              # Home page (client component)
├── components/
│   ├── truck-parking-map.tsx # Main map component
│   └── ui/                   # shadcn/ui components
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       └── label.tsx
├── lib/
│   └── utils.ts              # Utility functions
├── public/
│   └── truck_parking_facilities.geojson  # Map data (1,425 facilities)
├── tailwind.config.ts        # Tailwind configuration
└── tsconfig.json             # TypeScript configuration
```

## Data

The map displays data from the comprehensive OpenStreetMap-based truck parking database. The dataset includes:

- **Total Facilities**: 1,425
- **Coverage**: Nationwide (Netherlands)
- **Data Quality**:
  - 88% with polygon boundaries
  - 44% high-confidence facilities
  - Geographic distribution across all provinces

### Top Provinces by Facilities

1. Zuid-Holland: 35 facilities
2. Overijssel: 21 facilities
3. Gelderland: 16 facilities
4. Limburg: 15 facilities
5. Noord-Holland: 13 facilities

## Features in Detail

### Map Component

The map uses React Leaflet for rendering and includes:
- Dynamic loading to avoid SSR issues with Leaflet
- GeoJSON layer rendering with color-coded markers
- Popup information panels for each facility
- Auto-fit bounds to show all facilities

### Filtering System

Built with shadcn/ui components:
- Checkbox filters for each facility type
- Real-time map updates
- Counter badges showing filtered results
- Color-coded legend

### Responsive Design

Tailwind CSS provides:
- Mobile-first responsive layout
- Dark mode support (theme variables configured)
- Consistent spacing and typography
- Professional color palette

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## Browser Support

Modern browsers with ES2017+ support:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)

## License

ISC

## Acknowledgments

- Data sourced from OpenStreetMap contributors
- Map tiles from OpenStreetMap
- UI components from shadcn/ui
- Icons from Lucide

## Contributing

Contributions are welcome! Please ensure:
- TypeScript strict mode compliance
- ESLint passing
- Responsive design maintained

## Support

For issues or questions, please open an issue in the repository.
