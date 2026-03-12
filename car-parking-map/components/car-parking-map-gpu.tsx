"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import Map, { NavigationControl, ScaleControl } from "react-map-gl/maplibre";
import { DeckGL } from "@deck.gl/react";
import { ScatterplotLayer, GeoJsonLayer } from "@deck.gl/layers";
import "maplibre-gl/dist/maplibre-gl.css";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Car,
  ParkingSquare,
  MapPin,
  Search,
  X,
  Layers,
  ChevronLeft,
  ChevronRight,
  Building2,
  TreePine,
  CreditCard,
  CircleParking,
  Zap,
  Info,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Parking facility type
interface ParkingFacility {
  id: string;
  name: string;
  type: string;
  geometry: {
    type: string;
    coordinates: number[];
  };
  latitude: number;
  longitude: number;
  municipality?: string;
  province?: string;
  capacity?: { total?: number; disabled?: number; ev_charging?: number };
  is_paid?: boolean;
  operator?: string;
  source?: string;
  available?: number;
  has_realtime?: boolean;
  realtime_url?: string;
  rdw_id?: string;
  osm_id?: string;
  uuid?: string;
  address?: string;
  last_updated?: string;
  fee?: string;
  access?: string;
  surface_type?: string;
  parking?: string;
  opening_hours?: string;
  website?: string;
  max_height?: number;
  max_duration_minutes?: number;
  time_regulations?: Array<{ day: string; hours: string[] }>;
  payment_methods?: string[];
  usage_type?: string;
  // Amsterdam-specific fields
  spot_count?: number;
  soort?: string;
  fiscal_type?: string;
  buurtcode?: string;
  straatnaam?: string;
  // Apeldoorn / extended fields
  source_detail?: string;
  bgt_id?: string;
  bgt_status?: string;
  osm_type?: string;
  rdw_area_id?: string;
  rdw_area_manager_id?: number;
  valid_from?: string;
  valid_until?: string;
  description?: string;
  limited_access?: boolean;
  supervised?: boolean;
  wheelchair?: string;
  [key: string]: any; // Allow additional dynamic properties
}

// Parking type colors (as RGB arrays for deck.gl)
const PARKING_COLORS_RGB: Record<string, [number, number, number, number]> = {
  garage: [59, 130, 246, 200], // Blue
  surface: [16, 185, 129, 200], // Green
  street_paid: [249, 115, 22, 200], // Orange
  street_free: [107, 114, 128, 200], // Gray
  p_and_r: [139, 92, 246, 200], // Purple
  disabled: [234, 179, 8, 200], // Yellow
  ev_charging: [6, 182, 212, 200], // Cyan
  parking_space: [236, 72, 153, 200], // Pink
  other: [156, 163, 175, 200], // Light gray
};

// Hex colors for UI
const PARKING_COLORS: Record<string, string> = {
  garage: "#3b82f6",
  surface: "#10b981",
  street_paid: "#f97316",
  street_free: "#6b7280",
  p_and_r: "#8b5cf6",
  disabled: "#eab308",
  ev_charging: "#06b6d4",
  parking_space: "#ec4899",
  other: "#9ca3af",
};

const PARKING_LABELS: Record<string, string> = {
  garage: "Parking Garage",
  surface: "Surface Lot",
  street_paid: "Street (Paid)",
  street_free: "Street (Free)",
  p_and_r: "P+R",
  disabled: "Disabled",
  ev_charging: "EV Charging",
  parking_space: "Parking Space",
  other: "Other",
};

// Data source labels and colors
const SOURCE_LABELS: Record<string, string> = {
  osm: "OpenStreetMap",
  rdw: "RDW/NPR",
  amsterdam: "Amsterdam Open Data",
  utrecht: "Utrecht",
  eindhoven: "Eindhoven",
  groningen: "Groningen",
  arnhem: "Arnhem",
};

const SOURCE_COLORS: Record<string, string> = {
  osm: "#10b981", // Green
  rdw: "#3b82f6", // Blue
  amsterdam: "#f97316", // Orange
  utrecht: "#14b8a6", // Teal
  eindhoven: "#f43f5e", // Rose
  groningen: "#8b5cf6", // Purple
  arnhem: "#eab308", // Yellow
};

// InfoTooltip component
function InfoTooltip({ children, side = "right" }: { children: React.ReactNode; side?: "top" | "right" | "bottom" | "left" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="inline-flex items-center text-gray-400 hover:text-gray-600 transition-colors">
          <Info className="h-3.5 w-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="max-w-72 text-left bg-gray-900 text-gray-100 p-3 text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </Tooltip>
  );
}

// Tooltip descriptions for parking types
const PARKING_TYPE_TOOLTIPS: Record<string, { description: string; sources: string }> = {
  garage: {
    description: "Multi-storey or underground parking garages, including commercial garages operated by Q-Park, P1, APCOA, etc.",
    sources: "RDW/NPR (opendata.rdw.nl) for registered garages with capacity data. OpenStreetMap for community-mapped garages.",
  },
  surface: {
    description: "Open-air surface parking lots, typically unpaved or paved areas dedicated to parking.",
    sources: "OpenStreetMap community contributors. RDW for registered surface lots.",
  },
  street_paid: {
    description: "On-street paid parking zones (betaald parkeren). Requires payment via meter or parking app.",
    sources: "OpenStreetMap community contributors tagging fee=yes.",
  },
  street_free: {
    description: "On-street parking where no payment is required. May have time restrictions or permit requirements.",
    sources: "OpenStreetMap community contributors.",
  },
  p_and_r: {
    description: "Park & Ride facilities at transit hubs. Park your car and continue by public transport.",
    sources: "RDW/NPR national register of P+R facilities.",
  },
  ev_charging: {
    description: "Parking spots with electric vehicle charging stations.",
    sources: "OpenStreetMap community contributors tagging amenity=charging_station.",
  },
  parking_space: {
    description: "Individual mapped parking spaces, often from municipal datasets with exact spot locations.",
    sources: "Municipal open data portals and OpenStreetMap.",
  },
  disabled: {
    description: "Dedicated parking spots for disabled persons (gehandicaptenparkeerplaats).",
    sources: "OpenStreetMap and municipal datasets.",
  },
  other: {
    description: "Parking facilities that don't fit standard categories, including motorcycle parking, bicycle parking, etc.",
    sources: "OpenStreetMap community contributors.",
  },
};

// Tooltip descriptions for data sources
const SOURCE_TOOLTIPS: Record<string, string> = {
  osm: "OpenStreetMap (OSM) - Community-maintained open geographic database. Data contributed by volunteer mappers worldwide. Updated continuously. Quality varies by area.",
  rdw: "RDW (Rijksdienst voor het Wegverkeer) / NPR (Nationaal Parkeerregister) - Official Dutch vehicle authority. Provides registered parking facilities, real-time occupancy via SPDP 2.0 standard. Data from opendata.rdw.nl.",
  amsterdam: "Amsterdam Open Data (data.amsterdam.nl) - Official municipal dataset of all individual parking spots (parkeervakken) in Amsterdam. Contains 261k+ spots with fiscal type and zone info.",
  rotterdam: "Rotterdam Open Data - Official municipal dataset of parking facilities and spots in Rotterdam. Contains ~20k spots.",
  utrecht: "Utrecht municipal parking data. Primarily through RDW/NPR integration.",
  eindhoven: "Eindhoven Open Data (data.eindhoven.nl) - Official municipal parking dataset.",
  groningen: "Groningen Open Data - Municipal parking data for the city of Groningen.",
  arnhem: "Arnhem Open Data - Municipal parking data for Arnhem.",
  elburg: "Elburg Open Data - Municipal parking data for the town of Elburg. Contains 298 individual parking spots.",
  zwolle: "Zwolle Open Data - Municipal parking data for Zwolle. Contains ~3,500 parking spots.",
  apeldoorn: "Apeldoorn parking data - Combined from RDW SPDP (real-time garage data) and OpenStreetMap. Contains 57 garages with real-time occupancy where available.",
};

// Helper to create raster style
const createRasterStyle = (id: string, tiles: string[], attribution: string) => ({
  version: 8 as const,
  sources: {
    [id]: {
      type: "raster" as const,
      tiles,
      tileSize: 256,
      attribution,
    },
  },
  layers: [
    {
      id,
      type: "raster" as const,
      source: id,
    },
  ],
});

// Base map styles
const BASE_LAYERS = {
  // Standard maps
  osm: {
    name: "OpenStreetMap",
    category: "standard",
    style: createRasterStyle("osm", ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], "© OpenStreetMap contributors"),
  },
  light: {
    name: "Light (Carto)",
    category: "standard",
    style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
  dark: {
    name: "Dark (Carto)",
    category: "standard",
    style: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  },
  pdok_brt: {
    name: "PDOK Standaard",
    category: "standard",
    style: createRasterStyle("pdok_brt", ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png"], "© PDOK / Kadaster"),
  },
  pdok_brt_grijs: {
    name: "PDOK Grijs",
    category: "standard",
    style: createRasterStyle("pdok_grijs", ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png"], "© PDOK / Kadaster"),
  },
  pdok_brt_pastel: {
    name: "PDOK Pastel",
    category: "standard",
    style: createRasterStyle("pdok_pastel", ["https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/pastel/EPSG:3857/{z}/{x}/{y}.png"], "© PDOK / Kadaster"),
  },
  // Satellite / Aerial imagery
  pdok_luchtfoto: {
    name: "Luchtfoto (Actueel)",
    category: "satellite",
    style: createRasterStyle("pdok_luchtfoto", ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg"], "© PDOK / Beeldmateriaal.nl"),
  },
  pdok_luchtfoto_2024: {
    name: "Luchtfoto 2024",
    category: "satellite",
    style: createRasterStyle("pdok_2024", ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2024_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg"], "© PDOK / Beeldmateriaal.nl"),
  },
  pdok_luchtfoto_2023: {
    name: "Luchtfoto 2023",
    category: "satellite",
    style: createRasterStyle("pdok_2023", ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2023_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg"], "© PDOK / Beeldmateriaal.nl"),
  },
  pdok_luchtfoto_2022: {
    name: "Luchtfoto 2022",
    category: "satellite",
    style: createRasterStyle("pdok_2022", ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2022_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg"], "© PDOK / Beeldmateriaal.nl"),
  },
  pdok_luchtfoto_2021: {
    name: "Luchtfoto 2021",
    category: "satellite",
    style: createRasterStyle("pdok_2021", ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2021_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg"], "© PDOK / Beeldmateriaal.nl"),
  },
  pdok_luchtfoto_2020: {
    name: "Luchtfoto 2020",
    category: "satellite",
    style: createRasterStyle("pdok_2020", ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2020_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg"], "© PDOK / Beeldmateriaal.nl"),
  },
  pdok_luchtfoto_2019: {
    name: "Luchtfoto 2019",
    category: "satellite",
    style: createRasterStyle("pdok_2019", ["https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2019_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg"], "© PDOK / Beeldmateriaal.nl"),
  },
  pdok_luchtfoto_infrared: {
    name: "Luchtfoto Infrarood",
    category: "satellite",
    style: createRasterStyle("pdok_ir", ["https://service.pdok.nl/hwh/luchtfotocir/wmts/v1_0/Actueel_ortho25ir/EPSG:3857/{z}/{x}/{y}.jpeg"], "© PDOK / Beeldmateriaal.nl"),
  },
  esri_satellite: {
    name: "Esri World Imagery",
    category: "satellite",
    style: createRasterStyle("esri", ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], "© Esri"),
  },
};

// Initial view state centered on Netherlands
const INITIAL_VIEW_STATE = {
  longitude: 5.2913,
  latitude: 52.1326,
  zoom: 7,
  pitch: 0,
  bearing: 0,
};

export default function CarParkingMapGPU() {
  // Data state
  const [parkingData, setParkingData] = useState<ParkingFacility[]>([]);
  const [amsterdamData, setAmsterdamData] = useState<any>(null);
  const [rotterdamData, setRotterdamData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // View state
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE);

  // Filter state
  const [filters, setFilters] = useState({
    garage: true,
    surface: true,
    street_paid: true,
    street_free: true,
    p_and_r: true,
    ev_charging: true,
    other: true,
  });

  // UI state
  const [baseLayer, setBaseLayer] = useState("osm");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFacility, setSelectedFacility] =
    useState<ParkingFacility | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    object: Partial<ParkingFacility> & { name?: string; type?: string };
  } | null>(null);
  const [showAmsterdamLayer, setShowAmsterdamLayer] = useState(false);
  const [showRotterdamLayer, setShowRotterdamLayer] = useState(false);
  const [showElburgLayer, setShowElburgLayer] = useState(false);
  const [showZwolleLayer, setShowZwolleLayer] = useState(false);
  const [showApeldoornBgt, setShowApeldoornBgt] = useState(false);
  const [showApeldoornOsm, setShowApeldoornOsm] = useState(false);
  const [showApeldoornRdw, setShowApeldoornRdw] = useState(false);
  const [showApeldoornSpdp, setShowApeldoornSpdp] = useState(false);
  const showApeldoornLayer = showApeldoornBgt || showApeldoornOsm || showApeldoornRdw || showApeldoornSpdp;
  const [elburgData, setElburgData] = useState<any>(null);
  const [zwolleData, setZwolleData] = useState<any>(null);
  const [apeldoornData, setApeldoornData] = useState<any>(null);
  const [apeldoornOccupancy, setApeldoornOccupancy] = useState<Record<string, {
    available: number;
    capacity: number;
    occupancyPercent: number;
    isOpen: boolean;
    isFull: boolean;
    lastUpdated: string;
  }>>({});
  const [occupancyLastFetched, setOccupancyLastFetched] = useState<string | null>(null);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    by_type: {} as Record<string, number>,
    by_source: {} as Record<string, number>,
  });

  // Load parking data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/parking_data.json");
        if (response.ok) {
          const data = await response.json();
          setParkingData(data.features || []);
          setStats({
            total: data.metadata?.stats?.total || data.features?.length || 0,
            by_type: data.metadata?.stats?.by_type || {},
            by_source: data.metadata?.stats?.by_source || {},
          });
        }
      } catch (error) {
        console.error("Error loading parking data:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, []);

  // Load Amsterdam data when layer is enabled
  useEffect(() => {
    if (showAmsterdamLayer && !amsterdamData) {
      fetch("/amsterdam_parking.geojson")
        .then((r) => r.json())
        .then((data) => setAmsterdamData(data))
        .catch((e) => console.error("Error loading Amsterdam data:", e));
    }
  }, [showAmsterdamLayer, amsterdamData]);

  // Load Rotterdam data when layer is enabled
  useEffect(() => {
    if (showRotterdamLayer && !rotterdamData) {
      fetch("/rotterdam_parking.geojson")
        .then((r) => r.json())
        .then((data) => setRotterdamData(data))
        .catch((e) => console.error("Error loading Rotterdam data:", e));
    }
  }, [showRotterdamLayer, rotterdamData]);

  // Load Elburg data when layer is enabled
  useEffect(() => {
    if (showElburgLayer && !elburgData) {
      fetch("/elburg_parking.geojson")
        .then((r) => r.json())
        .then((data) => setElburgData(data))
        .catch((e) => console.error("Error loading Elburg data:", e));
    }
  }, [showElburgLayer, elburgData]);

  // Load Zwolle data when layer is enabled
  useEffect(() => {
    if (showZwolleLayer && !zwolleData) {
      fetch("/zwolle_parking.geojson")
        .then((r) => r.json())
        .then((data) => setZwolleData(data))
        .catch((e) => console.error("Error loading Zwolle data:", e));
    }
  }, [showZwolleLayer, zwolleData]);

  // Load Apeldoorn data when layer is enabled
  useEffect(() => {
    if (showApeldoornLayer && !apeldoornData) {
      fetch("/apeldoorn_parking.geojson")
        .then((r) => r.json())
        .then((data) => setApeldoornData(data))
        .catch((e) => console.error("Error loading Apeldoorn data:", e));
    }
  }, [showApeldoornLayer, apeldoornData]);

  // Fetch real-time occupancy data for Apeldoorn
  useEffect(() => {
    if (!showApeldoornLayer) return;

    const fetchOccupancy = async () => {
      try {
        const response = await fetch("/api/spdp");
        if (!response.ok) return;
        const data = await response.json();

        // Convert array to map keyed by UUID
        const occupancyMap: Record<string, any> = {};
        data.occupancy?.forEach((item: any) => {
          occupancyMap[item.uuid] = {
            available: item.available,
            capacity: item.capacity,
            occupancyPercent: item.occupancyPercent,
            isOpen: item.isOpen,
            isFull: item.isFull,
            lastUpdated: item.lastUpdated,
          };
        });
        setApeldoornOccupancy(occupancyMap);
        setOccupancyLastFetched(data.fetchedAt);
      } catch (error) {
        console.error("Error fetching occupancy:", error);
      }
    };

    // Fetch immediately
    fetchOccupancy();

    // Set up periodic refresh every 30 seconds
    const interval = setInterval(fetchOccupancy, 30000);

    return () => clearInterval(interval);
  }, [showApeldoornLayer]);

  // Filter facilities
  const filteredData = useMemo(() => {
    return parkingData.filter((f) => {
      const type = f.type || "other";
      if (!filters[type as keyof typeof filters]) return false;

      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const name = (f.name || "").toLowerCase();
        const municipality = (f.municipality || "").toLowerCase();
        return name.includes(search) || municipality.includes(search);
      }

      return true;
    });
  }, [parkingData, filters, searchTerm]);

  // Create deck.gl layers
  const layers = useMemo(() => {
    const result: any[] = [];

    // Main parking layer - GPU accelerated scatterplot
    result.push(
      new ScatterplotLayer({
        id: "parking-spots",
        data: filteredData,
        pickable: true,
        opacity: 0.8,
        stroked: true,
        filled: true,
        radiusScale: 1,
        radiusMinPixels: 3,
        radiusMaxPixels: 15,
        lineWidthMinPixels: 1,
        getPosition: (d: ParkingFacility) => [d.longitude, d.latitude],
        getRadius: (d: ParkingFacility) => {
          // Larger radius for garages and P+R
          if (d.type === "garage" || d.type === "p_and_r") return 100;
          return 50;
        },
        getFillColor: (d: ParkingFacility) =>
          PARKING_COLORS_RGB[d.type] || PARKING_COLORS_RGB.other,
        getLineColor: [255, 255, 255, 150],
        onHover: (info: any) => {
          if (info.object) {
            setHoverInfo({
              x: info.x,
              y: info.y,
              object: info.object,
            });
          } else {
            setHoverInfo(null);
          }
        },
        onClick: (info: any) => {
          if (info.object) {
            setSelectedFacility(info.object);
            setViewState({
              ...viewState,
              longitude: info.object.longitude,
              latitude: info.object.latitude,
              zoom: 16,
            });
          }
        },
        updateTriggers: {
          getFillColor: [filters],
        },
      })
    );

    // Amsterdam GeoJSON layer (only at high zoom)
    if (showAmsterdamLayer && amsterdamData && viewState.zoom >= 14) {
      result.push(
        new GeoJsonLayer({
          id: "amsterdam-parking",
          data: amsterdamData,
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1,
          getFillColor: [249, 115, 22, 150],
          getLineColor: [249, 115, 22, 255],
          getLineWidth: 2,
          onHover: (info: any) => {
            if (info.object) {
              const props = info.object.properties;
              setHoverInfo({
                x: info.x,
                y: info.y,
                object: {
                  name: props.straatnaam || props.name || "Street Parking",
                  type: props.type || "street_paid",
                  municipality: "Amsterdam",
                  source: "amsterdam",
                  id: props.id,
                  capacity: props.capacity,
                  spot_count: props.spot_count,
                  soort: props.soort,
                  fiscal_type: props.fiscal_type,
                  buurtcode: props.buurtcode,
                },
              });
            } else {
              setHoverInfo(null);
            }
          },
          onClick: (info: any) => {
            if (info.object) {
              const props = info.object.properties;
              setSelectedFacility({
                id: props.id,
                name: props.straatnaam || props.name || "Street Parking",
                type: props.type || "street_paid",
                municipality: "Amsterdam",
                source: "amsterdam",
                latitude: props.latitude,
                longitude: props.longitude,
                capacity: props.capacity,
                spot_count: props.spot_count,
                soort: props.soort,
                fiscal_type: props.fiscal_type,
                buurtcode: props.buurtcode,
              } as any);
            }
          },
        })
      );
    }

    // Rotterdam GeoJSON layer (only at high zoom)
    if (showRotterdamLayer && rotterdamData && viewState.zoom >= 14) {
      result.push(
        new GeoJsonLayer({
          id: "rotterdam-parking",
          data: rotterdamData,
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1,
          pointRadiusMinPixels: 4,
          getFillColor: [6, 182, 212, 150],
          getLineColor: [6, 182, 212, 255],
          getLineWidth: 2,
          getPointRadius: 6,
          onHover: (info: any) => {
            if (info.object) {
              const props = info.object.properties;
              setHoverInfo({
                x: info.x,
                y: info.y,
                object: {
                  name: props.name || "Parking Spot",
                  type: props.type || "surface",
                  municipality: "Rotterdam",
                  source: "rotterdam",
                  id: props.id,
                  osm_id: props.osm_id,
                  capacity: props.capacity,
                  operator: props.operator,
                  fee: props.fee,
                },
              });
            } else {
              setHoverInfo(null);
            }
          },
          onClick: (info: any) => {
            if (info.object) {
              const props = info.object.properties;
              setSelectedFacility({
                id: props.id,
                name: props.name || "Parking Spot",
                type: props.type || "surface",
                municipality: "Rotterdam",
                source: "rotterdam",
                latitude: props.latitude,
                longitude: props.longitude,
                capacity: props.capacity,
                operator: props.operator,
                osm_id: props.osm_id,
                fee: props.fee,
              } as any);
            }
          },
        })
      );
    }

    // Elburg GeoJSON layer (only at high zoom)
    if (showElburgLayer && elburgData && viewState.zoom >= 14) {
      result.push(
        new GeoJsonLayer({
          id: "elburg-parking",
          data: elburgData,
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1,
          pointRadiusMinPixels: 4,
          getFillColor: [139, 92, 246, 150], // Purple
          getLineColor: [139, 92, 246, 255],
          getLineWidth: 2,
          getPointRadius: 6,
          onHover: (info: any) => {
            if (info.object) {
              const props = info.object.properties;
              setHoverInfo({
                x: info.x,
                y: info.y,
                object: {
                  name: props.name || "Parking Spot",
                  type: props.type || "surface",
                  municipality: "Elburg",
                  source: "elburg",
                  id: props.id,
                  capacity: props.capacity,
                },
              });
            } else {
              setHoverInfo(null);
            }
          },
          onClick: (info: any) => {
            if (info.object) {
              const props = info.object.properties;
              setSelectedFacility({
                id: props.id,
                name: props.name || "Parking Spot",
                type: props.type || "surface",
                municipality: "Elburg",
                source: "elburg",
                latitude: props.latitude,
                longitude: props.longitude,
                capacity: props.capacity,
              } as any);
            }
          },
        })
      );
    }

    // Zwolle GeoJSON layer (only at high zoom)
    if (showZwolleLayer && zwolleData && viewState.zoom >= 14) {
      result.push(
        new GeoJsonLayer({
          id: "zwolle-parking",
          data: zwolleData,
          pickable: true,
          stroked: true,
          filled: true,
          lineWidthMinPixels: 1,
          pointRadiusMinPixels: 4,
          getFillColor: [236, 72, 153, 150], // Pink
          getLineColor: [236, 72, 153, 255],
          getLineWidth: 2,
          getPointRadius: 6,
          onHover: (info: any) => {
            if (info.object) {
              const props = info.object.properties;
              setHoverInfo({
                x: info.x,
                y: info.y,
                object: {
                  name: props.name || "Parking Spot",
                  type: props.type || "surface",
                  municipality: "Zwolle",
                  source: "zwolle",
                  id: props.id,
                  capacity: props.capacity,
                },
              });
            } else {
              setHoverInfo(null);
            }
          },
          onClick: (info: any) => {
            if (info.object) {
              const props = info.object.properties;
              setSelectedFacility({
                id: props.id,
                name: props.name || "Parking Spot",
                type: props.type || "surface",
                municipality: "Zwolle",
                source: "zwolle",
                latitude: props.latitude,
                longitude: props.longitude,
                capacity: props.capacity,
              } as any);
            }
          },
        })
      );
    }

    // Apeldoorn layers - split by source for proper styling
    if (showApeldoornLayer && apeldoornData) {
      const apeldoornFeatures = apeldoornData.features || [];

      // Apeldoorn hover/click handlers (shared)
      const apeldoornHover = (info: any) => {
        if (info.object) {
          const props = info.object.properties;
          const uuid = props.uuid;
          const occupancy = uuid ? apeldoornOccupancy[uuid] : null;
          setHoverInfo({
            x: info.x,
            y: info.y,
            object: {
              ...props,
              municipality: "Apeldoorn",
              source: props.source || "apeldoorn",
              capacity: occupancy ? { total: occupancy.capacity } : props.capacity,
              available: occupancy?.available,
            } as any,
          });
        } else {
          setHoverInfo(null);
        }
      };
      const apeldoornClick = (info: any) => {
        if (info.object) {
          const props = info.object.properties;
          const uuid = props.uuid;
          const occupancy = uuid ? apeldoornOccupancy[uuid] : null;
          setSelectedFacility({
            ...props,
            municipality: "Apeldoorn",
            source: props.source || "apeldoorn",
            capacity: occupancy ? { total: occupancy.capacity } : props.capacity,
            available: occupancy?.available,
          } as any);
        }
      };

      // Layer 1: RDW zone polygons (outlines only, no fill)
      if (showApeldoornRdw) {
        const rdwZones = apeldoornFeatures.filter(
          (f: any) => f.properties?.source === "rdw"
        );
        if (rdwZones.length > 0) {
          result.push(
            new GeoJsonLayer({
              id: "apeldoorn-rdw-zones",
              data: { type: "FeatureCollection", features: rdwZones },
              pickable: true,
              stroked: true,
              filled: true,
              lineWidthMinPixels: 2,
              getFillColor: [59, 130, 246, 20], // Very light blue fill
              getLineColor: [59, 130, 246, 180], // Blue outline
              getLineWidth: 3,
              onHover: apeldoornHover,
              onClick: apeldoornClick,
            })
          );
        }
      }

      // Layer 2: BGT parkeervlakken (individual spots)
      if (showApeldoornBgt && viewState.zoom >= 15) {
        const bgtSpots = apeldoornFeatures.filter(
          (f: any) => f.properties?.source === "bgt"
        );
        if (bgtSpots.length > 0) {
          result.push(
            new GeoJsonLayer({
              id: "apeldoorn-bgt-spots",
              data: { type: "FeatureCollection", features: bgtSpots },
              pickable: true,
              stroked: true,
              filled: true,
              lineWidthMinPixels: 1,
              getFillColor: [132, 204, 22, 140], // Lime green
              getLineColor: [101, 163, 13, 200], // Darker lime
              getLineWidth: 1,
              onHover: apeldoornHover,
              onClick: apeldoornClick,
            })
          );
        }
      }

      // Layer 3: OSM parking (polygons + points)
      if (showApeldoornOsm) {
        const osmFeatures = apeldoornFeatures.filter(
          (f: any) => f.properties?.source === "osm"
        );
        if (osmFeatures.length > 0) {
          result.push(
            new GeoJsonLayer({
              id: "apeldoorn-osm",
              data: { type: "FeatureCollection", features: osmFeatures },
              pickable: true,
              stroked: true,
              filled: true,
              lineWidthMinPixels: 1,
              pointRadiusMinPixels: 3,
              getFillColor: (f: any) => {
                const type = f.properties?.type;
                if (type === "garage") return [59, 130, 246, 180];
                if (type === "street_paid") return [249, 115, 22, 150];
                if (type === "street_free") return [107, 114, 128, 120];
                if (type === "p_and_r") return [139, 92, 246, 150];
                return [16, 185, 129, 140]; // Green for surface/other
              },
              getLineColor: (f: any) => {
                const type = f.properties?.type;
                if (type === "garage") return [37, 99, 235, 255];
                if (type === "street_paid") return [234, 88, 12, 255];
                return [5, 150, 105, 200];
              },
              getLineWidth: 1,
              getPointRadius: 4,
              onHover: apeldoornHover,
              onClick: apeldoornClick,
            })
          );
        }
      }

      // Layer 4: SPDP real-time facilities (points)
      if (showApeldoornSpdp) {
        const spdpFeatures = apeldoornFeatures.filter(
          (f: any) => f.properties?.source === "rdw_spdp"
        );
        if (spdpFeatures.length > 0) {
          result.push(
            new GeoJsonLayer({
              id: "apeldoorn-spdp",
              data: { type: "FeatureCollection", features: spdpFeatures },
              pickable: true,
              stroked: true,
              filled: true,
              pointRadiusMinPixels: 8,
              getFillColor: [34, 197, 94, 200], // Green for real-time
              getLineColor: [21, 128, 61, 255],
              getLineWidth: 3,
              getPointRadius: 60,
              onHover: apeldoornHover,
              onClick: apeldoornClick,
            })
          );
        }
      }
    }

    return result;
  }, [
    filteredData,
    showAmsterdamLayer,
    amsterdamData,
    showRotterdamLayer,
    rotterdamData,
    showElburgLayer,
    elburgData,
    showZwolleLayer,
    zwolleData,
    showApeldoornBgt,
    showApeldoornOsm,
    showApeldoornRdw,
    showApeldoornSpdp,
    apeldoornData,
    apeldoornOccupancy,
    viewState.zoom,
    filters,
  ]);

  // Toggle filter
  const toggleFilter = (type: string) => {
    setFilters((prev) => ({
      ...prev,
      [type]: !prev[type as keyof typeof prev],
    }));
  };

  // Get map style
  const mapStyle = useMemo(() => {
    return BASE_LAYERS[baseLayer as keyof typeof BASE_LAYERS].style;
  }, [baseLayer]);

  return (
    <TooltipProvider delayDuration={200}>
    <div className="h-screen w-screen relative flex">
      {/* Left Panel */}
      <div
        className={`${
          leftPanelOpen ? "w-80" : "w-0"
        } transition-all duration-300 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col z-20`}
      >
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-4">
            <ParkingSquare className="h-6 w-6 text-blue-500" />
            <h1 className="text-lg font-semibold">Car Parking NL</h1>
            <InfoTooltip side="bottom">
              <p className="font-semibold mb-1">Car Parking NL</p>
              <p>Interactive map of car parking across the Netherlands. Shows parking garages, surface lots, street parking, P+R facilities, and EV charging spots.</p>
              <p className="mt-1.5">Data is aggregated from multiple official and community sources: RDW/NPR (national register), OpenStreetMap, and municipal open data portals.</p>
              <p className="mt-1.5 text-gray-400">Click any marker on the map for details. Use filters below to show/hide parking types.</p>
            </InfoTooltip>
            <Badge variant="outline" className="text-xs ml-auto">
              GPU
            </Badge>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name or city..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-gray-400" />
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="text-sm text-gray-500 mb-2">
            Rendering {filteredData.length.toLocaleString()} of{" "}
            {stats.total.toLocaleString()} facilities
          </div>

          {isLoading && (
            <div className="text-sm text-blue-500">Loading data...</div>
          )}
        </div>

        {/* Filters */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-1 mb-3">
            <h3 className="text-sm font-medium">Parking Types</h3>
            <InfoTooltip>
              <p className="font-semibold mb-1">Parking type filters</p>
              <p>Toggle visibility of different parking categories on the map. Each type is color-coded and sourced from different data providers.</p>
              <p className="mt-1.5">Click the info icon next to each type for details about what it includes and its data source.</p>
            </InfoTooltip>
          </div>
          <div className="space-y-2">
            {Object.entries(PARKING_LABELS).map(([type, label]) => {
              const count = stats.by_type[type] || 0;
              if (count === 0 && type !== "garage") return null;
              const tooltipInfo = PARKING_TYPE_TOOLTIPS[type];

              return (
                <div key={type} className="flex items-center gap-2">
                  <Checkbox
                    id={type}
                    checked={filters[type as keyof typeof filters] ?? true}
                    onCheckedChange={() => toggleFilter(type)}
                  />
                  <Label
                    htmlFor={type}
                    className="flex items-center gap-2 cursor-pointer flex-1"
                  >
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: PARKING_COLORS[type] }}
                    />
                    <span className="flex-1">{label}</span>
                    <Badge variant="secondary" className="text-xs">
                      {count}
                    </Badge>
                  </Label>
                  {tooltipInfo && (
                    <InfoTooltip>
                      <p className="font-semibold mb-1">{label}</p>
                      <p>{tooltipInfo.description}</p>
                      <p className="mt-1.5 text-gray-400">Sources: {tooltipInfo.sources}</p>
                    </InfoTooltip>
                  )}
                </div>
              );
            })}
          </div>

          {/* Data Sources */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1 mb-3">
              <h3 className="text-sm font-medium">Data Sources</h3>
              <InfoTooltip>
                <p className="font-semibold mb-1">Data origins</p>
                <p>Each parking facility is tagged with its data source. National sources (RDW, OSM) cover the whole country. Municipal sources provide more detailed local data.</p>
                <p className="mt-1.5">Click the info icon next to each source for details about the data provider.</p>
              </InfoTooltip>
            </div>
            <div className="space-y-2">
              {Object.entries(SOURCE_LABELS).map(([source, label]) => {
                const count = stats.by_source?.[source] || 0;
                return (
                  <div
                    key={source}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: SOURCE_COLORS[source] }}
                      />
                      <span>{label}</span>
                      {SOURCE_TOOLTIPS[source] && (
                        <InfoTooltip>
                          <p className="font-semibold mb-1">{label}</p>
                          <p>{SOURCE_TOOLTIPS[source]}</p>
                        </InfoTooltip>
                      )}
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      {count.toLocaleString()}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </div>

          {/* City detail layers */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-1 mb-3">
              <h3 className="text-sm font-medium">City Detail Layers</h3>
              <InfoTooltip>
                <p className="font-semibold mb-1">Municipal detail layers</p>
                <p>These layers show individual parking spots from municipal open data portals. They provide much more detail than the national datasets, often including every single parking space.</p>
                <p className="mt-1.5">Enable a layer to load its data. Zoom to level 14+ to see individual spots (12+ for Apeldoorn).</p>
                <p className="mt-1.5 text-gray-400">Each city's data comes from their official open data portal or a combination of RDW + OSM data.</p>
              </InfoTooltip>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="amsterdam"
                  checked={showAmsterdamLayer}
                  onCheckedChange={() =>
                    setShowAmsterdamLayer(!showAmsterdamLayer)
                  }
                />
                <Label htmlFor="amsterdam" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: "#f97316" }}
                    />
                    Amsterdam (261k spots)
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Amsterdam Parking Spots</p>
                  <p>261,000+ individual parking spaces (parkeervakken) from Amsterdam's official open data portal.</p>
                  <p className="mt-1">Includes fiscal type (paid/free/permit), street name, neighborhood code, and zone information.</p>
                  <p className="mt-1.5 text-gray-400">Source: data.amsterdam.nl - Parkeervakken API</p>
                </InfoTooltip>
              </div>
              {showAmsterdamLayer && !amsterdamData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="rotterdam"
                  checked={showRotterdamLayer}
                  onCheckedChange={() =>
                    setShowRotterdamLayer(!showRotterdamLayer)
                  }
                />
                <Label htmlFor="rotterdam" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: "#06b6d4" }}
                    />
                    Rotterdam (20k spots)
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Rotterdam Parking</p>
                  <p>~20,000 parking facilities and spots from Rotterdam's open data portal.</p>
                  <p className="mt-1">Includes facility type, capacity, operator, and fee information.</p>
                  <p className="mt-1.5 text-gray-400">Source: Rotterdam Open Data / OpenStreetMap</p>
                </InfoTooltip>
              </div>
              {showRotterdamLayer && !rotterdamData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="elburg"
                  checked={showElburgLayer}
                  onCheckedChange={() =>
                    setShowElburgLayer(!showElburgLayer)
                  }
                />
                <Label htmlFor="elburg" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: "#8b5cf6" }}
                    />
                    Elburg
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Elburg Parking</p>
                  <p>298 individual parking spots from Elburg's municipal open data.</p>
                  <p className="mt-1">Covers the historic town center and surrounding areas.</p>
                  <p className="mt-1.5 text-gray-400">Source: Elburg Open Data</p>
                </InfoTooltip>
              </div>
              {showElburgLayer && !elburgData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="zwolle"
                  checked={showZwolleLayer}
                  onCheckedChange={() =>
                    setShowZwolleLayer(!showZwolleLayer)
                  }
                />
                <Label htmlFor="zwolle" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: "#ec4899" }}
                    />
                    Zwolle
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Zwolle Parking</p>
                  <p>~3,500 parking spots from Zwolle's municipal open data.</p>
                  <p className="mt-1">Includes facility type, capacity, and operator information.</p>
                  <p className="mt-1.5 text-gray-400">Source: Zwolle Open Data</p>
                </InfoTooltip>
              </div>
              {showZwolleLayer && !zwolleData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}

              {/* Apeldoorn sub-header */}
              <div className="mt-2 mb-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Apeldoorn</span>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Apeldoorn Parking</p>
                  <p>~18,000 features from 4 sources: 14k BGT parking surfaces (cm-accuracy polygons), 3.5k OSM features, 77 RDW zones with tariffs, and 3 SPDP real-time facilities.</p>
                  <p className="mt-1.5 text-gray-400">Sources: BGT/PDOK, OpenStreetMap, RDW Socrata, RDW SPDP v2</p>
                </InfoTooltip>
              </div>
              {/* BGT */}
              <div className="flex items-center gap-2 ml-2">
                <Checkbox
                  id="apeldoorn-bgt"
                  checked={showApeldoornBgt}
                  onCheckedChange={() => {
                    if (!showApeldoornBgt && !showApeldoornLayer) {
                      setViewState({ ...viewState, longitude: 5.9699, latitude: 52.2112, zoom: 15 });
                    }
                    setShowApeldoornBgt(!showApeldoornBgt);
                  }}
                />
                <Label htmlFor="apeldoorn-bgt" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#84cc16" }} />
                    BGT Spots (14k)
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">BGT Parkeervlakken</p>
                  <p>14,334 individual parking spot polygons from the BGT (Basisregistratie Grootschalige Topografie) via PDOK.</p>
                  <p className="mt-1">Cm-accurate polygon outlines of every parking surface. Visible at zoom 15+.</p>
                  <p className="mt-1.5 text-gray-400">Source: PDOK OGC API - BGT Wegdeel (functie=parkeervlak)</p>
                </InfoTooltip>
              </div>
              {/* OSM */}
              <div className="flex items-center gap-2 ml-2">
                <Checkbox
                  id="apeldoorn-osm"
                  checked={showApeldoornOsm}
                  onCheckedChange={() => {
                    if (!showApeldoornOsm && !showApeldoornLayer) {
                      setViewState({ ...viewState, longitude: 5.9699, latitude: 52.2112, zoom: 14 });
                    }
                    setShowApeldoornOsm(!showApeldoornOsm);
                  }}
                />
                <Label htmlFor="apeldoorn-osm" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#10b981" }} />
                    OSM (3.5k)
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">OpenStreetMap Parking</p>
                  <p>3,533 parking features from OpenStreetMap: garages, surface lots, street parking with full polygon geometry.</p>
                  <p className="mt-1">Color-coded by type: blue=garage, orange=paid, gray=free, green=surface.</p>
                  <p className="mt-1.5 text-gray-400">Source: Overpass API (amenity=parking, highway=service+parking)</p>
                </InfoTooltip>
              </div>
              {/* RDW Zones */}
              <div className="flex items-center gap-2 ml-2">
                <Checkbox
                  id="apeldoorn-rdw"
                  checked={showApeldoornRdw}
                  onCheckedChange={() => {
                    if (!showApeldoornRdw && !showApeldoornLayer) {
                      setViewState({ ...viewState, longitude: 5.9699, latitude: 52.2112, zoom: 14 });
                    }
                    setShowApeldoornRdw(!showApeldoornRdw);
                  }}
                />
                <Label htmlFor="apeldoorn-rdw" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2 border-blue-500 bg-blue-500/10" />
                    RDW Zones (77)
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">RDW Parking Zones</p>
                  <p>77 official parking zones from the RDW/NPR national register. Includes tariffs, capacity, and descriptions.</p>
                  <p className="mt-1">Shown as blue outlines. These are zone boundaries, not individual spots.</p>
                  <p className="mt-1.5 text-gray-400">Source: RDW Socrata (opendata.rdw.nl) - 5 linked datasets</p>
                </InfoTooltip>
              </div>
              {/* SPDP Real-time */}
              <div className="flex items-center gap-2 ml-2">
                <Checkbox
                  id="apeldoorn-spdp"
                  checked={showApeldoornSpdp}
                  onCheckedChange={() => {
                    if (!showApeldoornSpdp && !showApeldoornLayer) {
                      setViewState({ ...viewState, longitude: 5.9699, latitude: 52.2112, zoom: 14 });
                    }
                    setShowApeldoornSpdp(!showApeldoornSpdp);
                  }}
                />
                <Label htmlFor="apeldoorn-spdp" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#22c55e" }} />
                    SPDP Real-time (3)
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">SPDP Real-time Occupancy</p>
                  <p>3 parking facilities with live occupancy data via the RDW SPDP v2 standard.</p>
                  <p className="mt-1">Shows real-time available/total spots. Data refreshes every 60 seconds.</p>
                  <p className="mt-1.5 text-gray-400">Source: npropendata.rdw.nl/parkingdata/v2</p>
                </InfoTooltip>
              </div>
              {showApeldoornLayer && !apeldoornData && (
                <div className="text-xs text-gray-500 ml-3">Loading Apeldoorn data...</div>
              )}
            </div>
            {(showAmsterdamLayer || showRotterdamLayer || showElburgLayer || showZwolleLayer) &&
              viewState.zoom < 14 && (
                <div className="text-xs text-yellow-600 mt-2">
                  Zoom in to level 14+ to see individual spots
                </div>
              )}
            {showApeldoornBgt && viewState.zoom < 15 && (
              <div className="text-xs text-yellow-600 mt-2">
                Zoom in to level 15+ to see BGT spots
              </div>
            )}
          </div>

        </div>

        {/* Performance indicator */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span>GPU-accelerated rendering (deck.gl)</span>
          </div>
        </div>
      </div>

      {/* Panel toggle button */}
      <button
        onClick={() => setLeftPanelOpen(!leftPanelOpen)}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-r-lg p-1 shadow-md"
        style={{ left: leftPanelOpen ? "320px" : "0" }}
      >
        {leftPanelOpen ? (
          <ChevronLeft className="h-5 w-5" />
        ) : (
          <ChevronRight className="h-5 w-5" />
        )}
      </button>

      {/* Map with deck.gl */}
      <div className="flex-1 relative">
        <DeckGL
          viewState={viewState}
          onViewStateChange={({ viewState: vs }) => setViewState(vs as any)}
          controller={true}
          layers={layers}
          getCursor={({ isHovering }) => (isHovering ? "pointer" : "grab")}
          useDevicePixels={true}
          onError={(error) => {
            // Suppress WebGPU initialization errors - deck.gl falls back to WebGL
            if (error?.message?.includes('maxTextureDimension2D')) {
              return;
            }
            console.error('DeckGL error:', error);
          }}
        >
          <Map mapStyle={mapStyle} reuseMaps>
            <NavigationControl position="top-right" />
            <ScaleControl position="bottom-right" />
          </Map>
        </DeckGL>

        {/* Hover tooltip */}
        {hoverInfo && (
          <div
            className="absolute z-20 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 pointer-events-none"
            style={{
              left: hoverInfo.x + 10,
              top: hoverInfo.y + 10,
            }}
          >
            <div className="font-semibold text-sm">
              {hoverInfo.object.name || "Unnamed Parking"}
            </div>
            <div className="text-xs text-gray-500">
              {hoverInfo.object.type ? (PARKING_LABELS[hoverInfo.object.type] || hoverInfo.object.type) : "Parking"}
            </div>
            {hoverInfo.object.municipality && (
              <div className="text-xs text-gray-400">
                {hoverInfo.object.municipality}
              </div>
            )}
            {(hoverInfo.object as any).operator && (
              <div className="text-xs text-gray-400">{(hoverInfo.object as any).operator}</div>
            )}
            {(hoverInfo.object as any).surface_type && (
              <div className="text-xs text-gray-400 capitalize">{(hoverInfo.object as any).surface_type}</div>
            )}
            {(hoverInfo.object as any).fee && (
              <div className="text-xs text-gray-400">
                {(hoverInfo.object as any).fee === 'yes' ? 'Betaald' : (hoverInfo.object as any).fee === 'no' ? 'Gratis' : (hoverInfo.object as any).fee}
              </div>
            )}
            {hoverInfo.object.source && (
              <div className="text-xs text-gray-400 mt-1 pt-1 border-t border-gray-200 dark:border-gray-600">
                Source: {SOURCE_LABELS[hoverInfo.object.source] || hoverInfo.object.source}
              </div>
            )}
            {/* Real-time availability */}
            {(hoverInfo.object as any).available !== undefined && (
              <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="text-sm font-medium text-blue-600">
                  {(hoverInfo.object as any).isOpen === false ? (
                    'Closed'
                  ) : (
                    <>
                      {(hoverInfo.object as any).available} / {typeof (hoverInfo.object as any).capacity === 'object' ? (hoverInfo.object as any).capacity?.total : (hoverInfo.object as any).capacity} vrij
                    </>
                  )}
                </div>
              </div>
            )}
            {/* Static capacity for non-realtime */}
            {(hoverInfo.object as any).available === undefined && (hoverInfo.object as any).capacity && (
              <div className="mt-1 text-xs text-gray-500">
                Capaciteit: {typeof (hoverInfo.object as any).capacity === 'object' ? (hoverInfo.object as any).capacity?.total || 'N/A' : (hoverInfo.object as any).capacity}
              </div>
            )}
          </div>
        )}

        {/* Zoom indicator */}
        <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 rounded-lg px-3 py-1 shadow-md text-sm z-20">
          Zoom: {Math.round(viewState.zoom * 10) / 10}
        </div>

        {/* Layer selector dropdown */}
        <div className="absolute top-4 left-4 z-[1000]">
          <div className="flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg shadow-md px-3 py-2">
            <Layers className="h-4 w-4 text-gray-500 flex-shrink-0" />
            <select
              value={baseLayer}
              onChange={(e) => setBaseLayer(e.target.value)}
              className="bg-transparent text-sm font-medium cursor-pointer outline-none min-w-[180px] dark:text-white"
            >
              <optgroup label="Standard Maps">
                {Object.entries(BASE_LAYERS)
                  .filter(([, layer]) => layer.category === "standard")
                  .map(([key, layer]) => (
                    <option key={key} value={key}>
                      {layer.name}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="Satellite / Aerial">
                {Object.entries(BASE_LAYERS)
                  .filter(([, layer]) => layer.category === "satellite")
                  .map(([key, layer]) => (
                    <option key={key} value={key}>
                      {layer.name}
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
        </div>
      </div>

      {/* Selected facility panel */}
      {selectedFacility && (
        <Card className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 p-4 min-w-80 max-w-lg shadow-lg max-h-[60vh] overflow-y-auto">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold">
                {selectedFacility.name || "Unnamed Parking"}
              </h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  style={{
                    backgroundColor:
                      PARKING_COLORS[selectedFacility.type] ||
                      PARKING_COLORS.other,
                  }}
                >
                  {PARKING_LABELS[selectedFacility.type] || selectedFacility.type}
                </Badge>
                {selectedFacility.source && (
                  <Badge variant="outline" className="text-xs">
                    {SOURCE_LABELS[selectedFacility.source] || selectedFacility.source}
                  </Badge>
                )}
              </div>
            </div>
            <button onClick={() => setSelectedFacility(null)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mt-3 text-sm space-y-1.5">
            {/* Real-time availability */}
            {selectedFacility.uuid && apeldoornOccupancy[selectedFacility.uuid] && (
              <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                {(() => {
                  const occ = apeldoornOccupancy[selectedFacility.uuid!];
                  return (
                    <>
                      <div className="flex items-center gap-2">
                        <Car className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-blue-600">
                          {!occ.isOpen ? 'Gesloten' : `${occ.available} / ${occ.capacity} vrij`}
                        </span>
                        {occ.isFull && <Badge variant="destructive" className="text-xs">Vol</Badge>}
                      </div>
                      <div className="text-xs text-gray-400 ml-6">
                        {Math.round(occ.occupancyPercent)}% bezet — bijgewerkt {new Date(occ.lastUpdated).toLocaleTimeString()}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* Location */}
            {(selectedFacility.municipality || selectedFacility.address) && (
              <div className="flex items-start gap-1.5">
                <MapPin className="h-4 w-4 mt-0.5 text-gray-400 flex-shrink-0" />
                <div>
                  {selectedFacility.address && <div>{selectedFacility.address}</div>}
                  <div className="text-gray-500">
                    {selectedFacility.municipality}
                    {selectedFacility.province && `, ${selectedFacility.province}`}
                  </div>
                </div>
              </div>
            )}

            {/* Capacity */}
            {(selectedFacility.capacity?.total || selectedFacility.spot_count) && !selectedFacility.uuid && (
              <div className="flex items-center gap-1.5">
                <Car className="h-4 w-4 text-gray-400 flex-shrink-0" />
                <span>{selectedFacility.capacity?.total || selectedFacility.spot_count} parking space(s)</span>
                {selectedFacility.capacity?.disabled ? <span className="text-xs text-gray-400">({selectedFacility.capacity.disabled} disabled)</span> : null}
                {selectedFacility.capacity?.ev_charging ? <span className="text-xs text-gray-400">({selectedFacility.capacity.ev_charging} EV)</span> : null}
              </div>
            )}

            {/* Key properties grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-2">
              {selectedFacility.operator && (
                <>
                  <span className="text-gray-400">Operator</span>
                  <span>{selectedFacility.operator}</span>
                </>
              )}
              {selectedFacility.fee && (
                <>
                  <span className="text-gray-400">Fee</span>
                  <span>{selectedFacility.fee === 'yes' ? 'Paid (betaald)' : selectedFacility.fee === 'no' ? 'Free (gratis)' : selectedFacility.fee}</span>
                </>
              )}
              {selectedFacility.access && (
                <>
                  <span className="text-gray-400">Access</span>
                  <span className="capitalize">{selectedFacility.access}</span>
                </>
              )}
              {selectedFacility.max_height && (
                <>
                  <span className="text-gray-400">Max height</span>
                  <span>{selectedFacility.max_height >= 100 ? (selectedFacility.max_height / 100).toFixed(1) + 'm' : selectedFacility.max_height + 'cm'}</span>
                </>
              )}
              {selectedFacility.surface_type && (
                <>
                  <span className="text-gray-400">Surface</span>
                  <span className="capitalize">{selectedFacility.surface_type}</span>
                </>
              )}
              {selectedFacility.opening_hours && (
                <>
                  <span className="text-gray-400">Opening hours</span>
                  <span>{selectedFacility.opening_hours}</span>
                </>
              )}
              {selectedFacility.supervised && (
                <>
                  <span className="text-gray-400">Supervised</span>
                  <span>Yes</span>
                </>
              )}
              {selectedFacility.wheelchair && (
                <>
                  <span className="text-gray-400">Wheelchair</span>
                  <span className="capitalize">{selectedFacility.wheelchair}</span>
                </>
              )}
              {selectedFacility.limited_access && (
                <>
                  <span className="text-gray-400">Limited access</span>
                  <span>Yes</span>
                </>
              )}
              {selectedFacility.is_paid && !selectedFacility.fee && (
                <>
                  <span className="text-gray-400">Paid parking</span>
                  <span>Yes</span>
                </>
              )}
              {selectedFacility.description && selectedFacility.description !== selectedFacility.name && (
                <>
                  <span className="text-gray-400">Description</span>
                  <span>{selectedFacility.description}</span>
                </>
              )}
            </div>

            {/* Amsterdam-specific */}
            {(selectedFacility.soort || selectedFacility.fiscal_type || selectedFacility.buurtcode || selectedFacility.straatnaam) && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1 pt-1 border-t border-gray-100 dark:border-gray-700">
                {selectedFacility.straatnaam && (
                  <>
                    <span className="text-gray-400">Straat</span>
                    <span>{selectedFacility.straatnaam}</span>
                  </>
                )}
                {selectedFacility.soort && (
                  <>
                    <span className="text-gray-400">Soort</span>
                    <span>{selectedFacility.soort}</span>
                  </>
                )}
                {selectedFacility.fiscal_type && (
                  <>
                    <span className="text-gray-400">Fiscaal</span>
                    <span>{selectedFacility.fiscal_type}</span>
                  </>
                )}
                {selectedFacility.buurtcode && (
                  <>
                    <span className="text-gray-400">Buurtcode</span>
                    <span>{selectedFacility.buurtcode}</span>
                  </>
                )}
              </div>
            )}

            {/* RDW zone details */}
            {selectedFacility.rdw_area_id && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1 pt-1 border-t border-gray-100 dark:border-gray-700">
                <span className="text-gray-400">RDW Area ID</span>
                <span className="font-mono">{selectedFacility.rdw_area_id}</span>
                {selectedFacility.rdw_area_manager_id && (
                  <>
                    <span className="text-gray-400">Manager ID</span>
                    <span className="font-mono">{selectedFacility.rdw_area_manager_id}</span>
                  </>
                )}
                {selectedFacility.valid_from && (
                  <>
                    <span className="text-gray-400">Valid from</span>
                    <span>{new Date(selectedFacility.valid_from).toLocaleDateString()}</span>
                  </>
                )}
              </div>
            )}

            {/* BGT details */}
            {selectedFacility.bgt_id && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs mt-1 pt-1 border-t border-gray-100 dark:border-gray-700">
                <span className="text-gray-400">BGT ID</span>
                <span className="font-mono text-[10px] break-all">{selectedFacility.bgt_id}</span>
                {selectedFacility.bgt_status && (
                  <>
                    <span className="text-gray-400">Status</span>
                    <span className="capitalize">{selectedFacility.bgt_status}</span>
                  </>
                )}
              </div>
            )}

            {/* Source footer */}
            <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-400">
              <div className="flex items-center gap-1">
                <span>Source: {SOURCE_LABELS[selectedFacility.source || ''] || selectedFacility.source || 'Unknown'}</span>
                {selectedFacility.source && SOURCE_TOOLTIPS[selectedFacility.source] && (
                  <InfoTooltip side="top">
                    <p className="font-semibold mb-1">{SOURCE_LABELS[selectedFacility.source]}</p>
                    <p>{SOURCE_TOOLTIPS[selectedFacility.source]}</p>
                  </InfoTooltip>
                )}
              </div>
              {selectedFacility.source_detail && (
                <div className="text-[10px] text-gray-300 dark:text-gray-500">{selectedFacility.source_detail}</div>
              )}
              <div className="font-mono mt-0.5">ID: {selectedFacility.id}</div>
              {selectedFacility.osm_id && (
                <div className="font-mono">OSM: {selectedFacility.osm_id}</div>
              )}
              {selectedFacility.uuid && (
                <div className="font-mono text-[10px] break-all">UUID: {selectedFacility.uuid}</div>
              )}
              {selectedFacility.last_updated && (
                <div className="mt-0.5">Updated: {new Date(selectedFacility.last_updated).toLocaleDateString()}</div>
              )}
              {selectedFacility.latitude && selectedFacility.longitude && (
                <div className="font-mono text-[10px]">{Number(selectedFacility.latitude).toFixed(6)}, {Number(selectedFacility.longitude).toFixed(6)}</div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
    </TooltipProvider>
  );
}
