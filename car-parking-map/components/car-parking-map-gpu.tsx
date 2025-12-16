"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

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
  const [elburgData, setElburgData] = useState<any>(null);
  const [zwolleData, setZwolleData] = useState<any>(null);

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
          <h3 className="text-sm font-medium mb-3">Parking Types</h3>
          <div className="space-y-2">
            {Object.entries(PARKING_LABELS).map(([type, label]) => {
              const count = stats.by_type[type] || 0;
              if (count === 0 && type !== "garage") return null;

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
                </div>
              );
            })}
          </div>

          {/* Data Sources */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium mb-3">Data Sources</h3>
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
            <h3 className="text-sm font-medium mb-3">City Detail Layers</h3>
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
              </div>
              {showZwolleLayer && !zwolleData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}
            </div>
            {(showAmsterdamLayer || showRotterdamLayer || showElburgLayer || showZwolleLayer) &&
              viewState.zoom < 14 && (
                <div className="text-xs text-yellow-600 mt-2">
                  Zoom in to level 14+ to see individual spots
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
        <Card className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 p-4 min-w-80 max-w-md shadow-lg">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-semibold">
                {selectedFacility.name || "Unnamed Parking"}
              </h3>
              <Badge
                className="mt-1"
                style={{
                  backgroundColor:
                    PARKING_COLORS[selectedFacility.type] ||
                    PARKING_COLORS.other,
                }}
              >
                {PARKING_LABELS[selectedFacility.type] || selectedFacility.type}
              </Badge>
            </div>
            <button onClick={() => setSelectedFacility(null)}>
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 text-sm space-y-1">
            {selectedFacility.municipality && (
              <div>
                <MapPin className="inline h-4 w-4 mr-1" />
                {selectedFacility.municipality}
              </div>
            )}
            {(selectedFacility.capacity?.total || (selectedFacility as any).spot_count) && (
              <div>
                <Car className="inline h-4 w-4 mr-1" />
                {selectedFacility.capacity?.total || (selectedFacility as any).spot_count} parking space(s)
              </div>
            )}
            {selectedFacility.operator && (
              <div className="text-gray-500">
                Operator: {selectedFacility.operator}
              </div>
            )}
            {(selectedFacility as any).soort && (
              <div className="text-gray-500">
                Type: {(selectedFacility as any).soort}
              </div>
            )}
            {(selectedFacility as any).fiscal_type && (
              <div className="text-gray-500">
                Fiscal: {(selectedFacility as any).fiscal_type}
              </div>
            )}
            {(selectedFacility as any).buurtcode && (
              <div className="text-gray-500">
                Buurt: {(selectedFacility as any).buurtcode}
              </div>
            )}
            {(selectedFacility as any).fee && (
              <div className="text-gray-500">
                Fee: {(selectedFacility as any).fee === 'yes' ? 'Paid' : (selectedFacility as any).fee === 'no' ? 'Free' : (selectedFacility as any).fee}
              </div>
            )}
            {/* Source info */}
            <div className="mt-3 pt-2 border-t border-gray-200 text-xs text-gray-400">
              <div>Source: {SOURCE_LABELS[selectedFacility.source || ''] || selectedFacility.source || 'Unknown'}</div>
              <div className="font-mono">ID: {selectedFacility.id}</div>
              {(selectedFacility as any).osm_id && (
                <div className="font-mono">OSM: {(selectedFacility as any).osm_id}</div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
