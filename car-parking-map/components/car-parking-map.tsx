"use client";

import React, { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  MapContainer,
  TileLayer,
  GeoJSON,
  useMap,
  useMapEvents,
  CircleMarker,
  Popup,
  Circle,
} from "react-leaflet";
import L, { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";

// CSS for pulsing animation (injected via style tag)
const pulseStyles = `
@keyframes pulse-ring {
  0% {
    transform: scale(0.8);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.5);
    opacity: 0.3;
  }
  100% {
    transform: scale(2);
    opacity: 0;
  }
}

@keyframes pulse-glow {
  0%, 100% {
    box-shadow: 0 0 8px 2px rgba(34, 197, 94, 0.6);
  }
  50% {
    box-shadow: 0 0 16px 4px rgba(34, 197, 94, 0.9);
  }
}

.realtime-pulse-ring {
  animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
`;
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
  Navigation,
  Radio,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

// Fix Leaflet default icon issue with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

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
  capacity?: { total?: number; disabled?: number; ev_charging?: number } | null;
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
  max_height?: number; // in cm
  max_duration_minutes?: number;
  time_regulations?: Array<{ day: string; hours: string[] }>;
  payment_methods?: string[];
  usage_type?: string;
}

// Parking type colors
const PARKING_COLORS: Record<string, string> = {
  garage: "#3b82f6", // Blue
  surface: "#10b981", // Green
  street_paid: "#f97316", // Orange
  street_free: "#6b7280", // Gray
  p_and_r: "#8b5cf6", // Purple
  disabled: "#eab308", // Yellow
  ev_charging: "#06b6d4", // Cyan
  parking_space: "#ec4899", // Pink
  other: "#9ca3af", // Light gray
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

const PARKING_ICONS: Record<string, React.ReactNode> = {
  garage: <Building2 className="h-4 w-4" />,
  surface: <TreePine className="h-4 w-4" />,
  street_paid: <CreditCard className="h-4 w-4" />,
  street_free: <CircleParking className="h-4 w-4" />,
  p_and_r: <Car className="h-4 w-4" />,
  ev_charging: <Zap className="h-4 w-4" />,
};

// Data source labels and colors
const SOURCE_LABELS: Record<string, string> = {
  osm: "OpenStreetMap",
  rdw: "RDW/NPR",
  amsterdam: "Amsterdam",
  rotterdam: "Rotterdam",
  utrecht: "Utrecht",
  eindhoven: "Eindhoven",
  elburg: "Elburg",
  zwolle: "Zwolle",
};

const SOURCE_COLORS: Record<string, string> = {
  osm: "#10b981", // Green
  rdw: "#3b82f6", // Blue
  amsterdam: "#f97316", // Orange
  rotterdam: "#06b6d4", // Cyan
  utrecht: "#14b8a6", // Teal
  eindhoven: "#f43f5e", // Rose
  elburg: "#8b5cf6", // Purple
  zwolle: "#ec4899", // Pink
};

// City center coordinates
const CITY_LOCATIONS: Record<string, { lat: number; lng: number; zoom: number }> = {
  amsterdam: { lat: 52.3676, lng: 4.9041, zoom: 14 },
  rotterdam: { lat: 51.9244, lng: 4.4777, zoom: 14 },
  elburg: { lat: 52.4493, lng: 5.8372, zoom: 15 },
  zwolle: { lat: 52.5168, lng: 6.0830, zoom: 14 },
};

// Base map layers
const BASE_LAYERS = {
  osm: {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    category: "standard",
  },
  light: {
    name: "Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    category: "standard",
  },
  dark: {
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    category: "standard",
  },
  pdok_brt: {
    name: "PDOK Standaard",
    url: "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/standaard/EPSG:3857/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Kadaster',
    category: "standard",
  },
  pdok_brt_grijs: {
    name: "PDOK Grijs",
    url: "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/grijs/EPSG:3857/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Kadaster',
    category: "standard",
  },
  pdok_brt_pastel: {
    name: "PDOK Pastel",
    url: "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/pastel/EPSG:3857/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Kadaster',
    category: "standard",
  },
  pdok_brt_water: {
    name: "PDOK Water",
    url: "https://service.pdok.nl/brt/achtergrondkaart/wmts/v2_0/water/EPSG:3857/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Kadaster',
    category: "standard",
  },
  // Satellite / Aerial imagery
  pdok_luchtfoto: {
    name: "Luchtfoto (Actueel)",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal.nl',
    category: "satellite",
  },
  pdok_luchtfoto_2024: {
    name: "Luchtfoto 2024",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2024_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal.nl',
    category: "satellite",
  },
  pdok_luchtfoto_2023: {
    name: "Luchtfoto 2023",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2023_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal.nl',
    category: "satellite",
  },
  pdok_luchtfoto_2022: {
    name: "Luchtfoto 2022",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2022_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal.nl',
    category: "satellite",
  },
  pdok_luchtfoto_2021: {
    name: "Luchtfoto 2021",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2021_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal.nl',
    category: "satellite",
  },
  pdok_luchtfoto_2020: {
    name: "Luchtfoto 2020",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2020_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal.nl',
    category: "satellite",
  },
  pdok_luchtfoto_2019: {
    name: "Luchtfoto 2019",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2019_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal.nl',
    category: "satellite",
  },
  pdok_luchtfoto_2018: {
    name: "Luchtfoto 2018",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/2018_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal.nl',
    category: "satellite",
  },
  pdok_luchtfoto_infrared: {
    name: "Luchtfoto Infrarood",
    url: "https://service.pdok.nl/hwh/luchtfotocir/wmts/v1_0/Actueel_ortho25ir/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> / Beeldmateriaal.nl',
    category: "satellite",
  },
  esri_satellite: {
    name: "Esri World Imagery",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    category: "satellite",
  },
};

// Map event handler
function MapEventHandler({
  onZoomChange,
  onViewportChange,
}: {
  onZoomChange: (zoom: number) => void;
  onViewportChange: (bounds: LatLngBounds) => void;
}) {
  const map = useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
      onViewportChange(map.getBounds());
    },
    moveend: () => {
      onViewportChange(map.getBounds());
    },
  });

  useEffect(() => {
    onZoomChange(map.getZoom());
    onViewportChange(map.getBounds());
  }, []);

  return null;
}

// Fly to location component
function FlyToLocation({
  target,
}: {
  target: { lat: number; lng: number; zoom?: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], target.zoom || 14, {
        duration: 1.5,
      });
    }
  }, [target, map]);

  return null;
}

// Real-time glow color (green to indicate live data)
const REALTIME_GLOW_COLOR = "#22c55e"; // Green-500

export default function CarParkingMap() {
  // Inject pulse animation styles
  useEffect(() => {
    const styleId = "realtime-pulse-styles";
    if (!document.getElementById(styleId)) {
      const style = document.createElement("style");
      style.id = styleId;
      style.textContent = pulseStyles;
      document.head.appendChild(style);
    }
    return () => {
      const style = document.getElementById(styleId);
      if (style) style.remove();
    };
  }, []);

  // Data state
  const [parkingData, setParkingData] = useState<ParkingFacility[]>([]);
  const [amsterdamData, setAmsterdamData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

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
  const [zoom, setZoom] = useState(8);
  const [viewport, setViewport] = useState<LatLngBounds | null>(null);
  const [baseLayer, setBaseLayer] = useState("osm");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedFacility, setSelectedFacility] =
    useState<ParkingFacility | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{
    lat: number;
    lng: number;
    zoom?: number;
  } | null>(null);
  const [showAmsterdamLayer, setShowAmsterdamLayer] = useState(false);
  const [showRotterdamLayer, setShowRotterdamLayer] = useState(false);
  const [showElburgLayer, setShowElburgLayer] = useState(false);
  const [showZwolleLayer, setShowZwolleLayer] = useState(false);
  const [rotterdamData, setRotterdamData] = useState<any>(null);
  const [elburgData, setElburgData] = useState<any>(null);
  const [zwolleData, setZwolleData] = useState<any>(null);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    by_type: {} as Record<string, number>,
    by_source: {} as Record<string, number>,
    with_realtime: 0,
  });

  // Load parking data
  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);

        // Load main parking data
        const response = await fetch("/parking_data.json");
        if (response.ok) {
          const data = await response.json();
          const features = data.features || [];
          setParkingData(features);

          // Count facilities with real-time data
          const realtimeCount = features.filter((f: ParkingFacility) => f.has_realtime).length;

          setStats({
            total: data.metadata?.stats?.total || features.length || 0,
            by_type: data.metadata?.stats?.by_type || {},
            by_source: data.metadata?.stats?.by_source || {},
            with_realtime: data.metadata?.stats?.with_realtime || realtimeCount,
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

  // Get visible facilities based on viewport
  const visibleFacilities = useMemo(() => {
    if (!viewport) return filteredData;

    return filteredData.filter((f) => {
      if (!f.latitude || !f.longitude) return false;
      return viewport.contains([f.latitude, f.longitude]);
    });
  }, [filteredData, viewport]);

  // Get marker size based on zoom
  const getMarkerSize = useCallback(
    (type: string) => {
      const baseSize = zoom < 10 ? 6 : zoom < 12 ? 8 : zoom < 14 ? 10 : 12;
      // Make garages and P+R slightly larger
      if (type === "garage" || type === "p_and_r") {
        return baseSize + 2;
      }
      return baseSize;
    },
    [zoom]
  );

  // Handle facility click
  const handleFacilityClick = (facility: ParkingFacility) => {
    setSelectedFacility(facility);
    setFlyToTarget({
      lat: facility.latitude,
      lng: facility.longitude,
      zoom: 16,
    });
  };

  // Toggle filter
  const toggleFilter = (type: string) => {
    setFilters((prev) => ({
      ...prev,
      [type]: !prev[type as keyof typeof prev],
    }));
  };

  // GeoJSON style for Amsterdam layer
  const amsterdamStyle = useCallback(() => {
    return {
      color: "#f97316",
      weight: 2,
      opacity: 1,
      fillColor: "#f97316",
      fillOpacity: 0.6,
    };
  }, []);

  // GeoJSON style for Rotterdam layer
  const rotterdamStyle = useCallback(() => {
    return {
      color: "#06b6d4",
      weight: 1,
      opacity: 0.8,
      fillColor: "#06b6d4",
      fillOpacity: 0.3,
    };
  }, []);

  // GeoJSON style for Elburg layer
  const elburgStyle = useCallback(() => {
    return {
      color: "#8b5cf6",
      weight: 1,
      opacity: 0.8,
      fillColor: "#8b5cf6",
      fillOpacity: 0.3,
    };
  }, []);

  // GeoJSON style for Zwolle layer
  const zwolleStyle = useCallback(() => {
    return {
      color: "#ec4899",
      weight: 1,
      opacity: 0.8,
      fillColor: "#ec4899",
      fillOpacity: 0.3,
    };
  }, []);

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
            Showing {visibleFacilities.length.toLocaleString()} of{" "}
            {stats.total.toLocaleString()} facilities
          </div>

          {stats.with_realtime > 0 && (
            <div className="flex items-center gap-2 text-sm text-green-600 mb-2">
              <Radio className="h-4 w-4 animate-pulse" />
              <span>{stats.with_realtime} with live data</span>
            </div>
          )}

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

              // Determine primary sources for each type with display names
              const typeSources: Record<string, string> = {
                garage: "RDW, OSM",
                surface: "OSM, RDW",
                street_paid: "OSM",
                street_free: "OSM",
                p_and_r: "RDW",
                ev_charging: "OSM",
                other: "OSM",
              };
              const sourceText = typeSources[type] || "OSM";

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
                    <span className="flex-1">
                      {label} <span className="text-gray-400 text-xs">({sourceText})</span>
                    </span>
                    <Badge variant="secondary" className="text-xs ml-1">
                      {count.toLocaleString()}
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
                  <div key={source} className="flex items-center justify-between text-sm">
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
                  onCheckedChange={() => {
                    if (!showAmsterdamLayer) {
                      setFlyToTarget(CITY_LOCATIONS.amsterdam);
                    }
                    setShowAmsterdamLayer(!showAmsterdamLayer);
                  }}
                />
                <Label htmlFor="amsterdam" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#f97316" }} />
                    Amsterdam <span className="text-gray-400 text-xs">(Amsterdam Open Data, 261k spots)</span>
                  </span>
                </Label>
                <button
                  onClick={() => setFlyToTarget(CITY_LOCATIONS.amsterdam)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Go to Amsterdam"
                >
                  <Navigation className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              {showAmsterdamLayer && !amsterdamData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="rotterdam"
                  checked={showRotterdamLayer}
                  onCheckedChange={() => {
                    if (!showRotterdamLayer) {
                      setFlyToTarget(CITY_LOCATIONS.rotterdam);
                    }
                    setShowRotterdamLayer(!showRotterdamLayer);
                  }}
                />
                <Label htmlFor="rotterdam" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#06b6d4" }} />
                    Rotterdam <span className="text-gray-400 text-xs">(Rotterdam Open Data, 20k spots)</span>
                  </span>
                </Label>
                <button
                  onClick={() => setFlyToTarget(CITY_LOCATIONS.rotterdam)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Go to Rotterdam"
                >
                  <Navigation className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              {showRotterdamLayer && !rotterdamData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="elburg"
                  checked={showElburgLayer}
                  onCheckedChange={() => {
                    if (!showElburgLayer) {
                      setFlyToTarget(CITY_LOCATIONS.elburg);
                    }
                    setShowElburgLayer(!showElburgLayer);
                  }}
                />
                <Label htmlFor="elburg" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#8b5cf6" }} />
                    Elburg <span className="text-gray-400 text-xs">(Elburg Open Data, 298 spots)</span>
                  </span>
                </Label>
                <button
                  onClick={() => setFlyToTarget(CITY_LOCATIONS.elburg)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Go to Elburg"
                >
                  <Navigation className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              {showElburgLayer && !elburgData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="zwolle"
                  checked={showZwolleLayer}
                  onCheckedChange={() => {
                    if (!showZwolleLayer) {
                      setFlyToTarget(CITY_LOCATIONS.zwolle);
                    }
                    setShowZwolleLayer(!showZwolleLayer);
                  }}
                />
                <Label htmlFor="zwolle" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#ec4899" }} />
                    Zwolle <span className="text-gray-400 text-xs">(Zwolle Open Data, 3.5k spots)</span>
                  </span>
                </Label>
                <button
                  onClick={() => setFlyToTarget(CITY_LOCATIONS.zwolle)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Go to Zwolle"
                >
                  <Navigation className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              {showZwolleLayer && !zwolleData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}
            </div>
            {(showAmsterdamLayer || showRotterdamLayer || showElburgLayer || showZwolleLayer) && zoom < 14 && (
              <div className="text-xs text-yellow-600 mt-2">
                Zoom in to level 14+ to see individual spots
              </div>
            )}
          </div>

        </div>

        {/* Data sources footer */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500">
          <div className="flex items-center gap-1 flex-wrap">
            <span>Sources:</span>
            <Badge variant="outline" className="text-xs" style={{ borderColor: SOURCE_COLORS.rdw, color: SOURCE_COLORS.rdw }}>RDW</Badge>
            <Badge variant="outline" className="text-xs" style={{ borderColor: SOURCE_COLORS.osm, color: SOURCE_COLORS.osm }}>OSM</Badge>
            <Badge variant="outline" className="text-xs" style={{ borderColor: SOURCE_COLORS.amsterdam, color: SOURCE_COLORS.amsterdam }}>AMS</Badge>
            <Badge variant="outline" className="text-xs" style={{ borderColor: SOURCE_COLORS.rotterdam, color: SOURCE_COLORS.rotterdam }}>RTD</Badge>
            <Badge variant="outline" className="text-xs" style={{ borderColor: SOURCE_COLORS.elburg, color: SOURCE_COLORS.elburg }}>ELB</Badge>
            <Badge variant="outline" className="text-xs" style={{ borderColor: SOURCE_COLORS.zwolle, color: SOURCE_COLORS.zwolle }}>ZWO</Badge>
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

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={[52.1326, 5.2913]}
          zoom={8}
          className="h-full w-full"
          zoomControl={false}
        >
          <TileLayer
            url={BASE_LAYERS[baseLayer as keyof typeof BASE_LAYERS].url}
            attribution={
              BASE_LAYERS[baseLayer as keyof typeof BASE_LAYERS].attribution
            }
          />

          <MapEventHandler
            onZoomChange={setZoom}
            onViewportChange={setViewport}
          />

          <FlyToLocation target={flyToTarget} />

          {/* Parking markers */}
          {visibleFacilities.map((facility) => {
            const markerColor = PARKING_COLORS[facility.type] || PARKING_COLORS.other;
            const markerSize = getMarkerSize(facility.type);
            const hasRealtime = facility.has_realtime;

            return (
              <React.Fragment key={facility.id}>
                {/* Pulsing outer ring for real-time facilities */}
                {hasRealtime && (
                  <>
                    {/* Outer pulsing ring */}
                    <CircleMarker
                      center={[facility.latitude, facility.longitude]}
                      radius={markerSize + 8}
                      pathOptions={{
                        color: REALTIME_GLOW_COLOR,
                        fillColor: REALTIME_GLOW_COLOR,
                        fillOpacity: 0.15,
                        weight: 2,
                        opacity: 0.4,
                        className: "realtime-pulse-ring",
                      }}
                    />
                    {/* Static glow ring */}
                    <CircleMarker
                      center={[facility.latitude, facility.longitude]}
                      radius={markerSize + 4}
                      pathOptions={{
                        color: REALTIME_GLOW_COLOR,
                        fillColor: REALTIME_GLOW_COLOR,
                        fillOpacity: 0.25,
                        weight: 1,
                        opacity: 0.6,
                      }}
                    />
                  </>
                )}
                {/* Main marker */}
                <CircleMarker
                  center={[facility.latitude, facility.longitude]}
                  radius={markerSize}
                  pathOptions={{
                    color: hasRealtime ? REALTIME_GLOW_COLOR : markerColor,
                    fillColor: markerColor,
                    fillOpacity: 0.7,
                    weight: hasRealtime ? 3 : 2,
                  }}
                >
              <Popup>
                <div className="min-w-56 max-w-72">
                  <h3 className="font-semibold text-sm">
                    {facility.name || "Unnamed Parking"}
                  </h3>
                  <div className="text-xs text-gray-500 mt-1 flex flex-wrap gap-1 items-center">
                    <Badge
                      variant="secondary"
                      style={{
                        backgroundColor:
                          PARKING_COLORS[facility.type] || PARKING_COLORS.other,
                        color: "white",
                      }}
                    >
                      {PARKING_LABELS[facility.type] || facility.type}
                    </Badge>
                    {facility.is_paid && (
                      <Badge variant="outline" className="text-xs">
                        Paid
                      </Badge>
                    )}
                    {facility.has_realtime && (
                      <Badge
                        variant="secondary"
                        className="text-xs animate-pulse"
                        style={{
                          backgroundColor: REALTIME_GLOW_COLOR,
                          color: "white",
                        }}
                      >
                        🔴 Live
                      </Badge>
                    )}
                  </div>

                  {/* Location */}
                  {(facility.address || facility.municipality) && (
                    <div className="text-xs mt-2">
                      <MapPin className="inline h-3 w-3 mr-1" />
                      {facility.address || facility.municipality}
                      {facility.province && !facility.address && `, ${facility.province}`}
                    </div>
                  )}

                  {/* Capacity */}
                  {facility.capacity?.total && (
                    <div className="text-xs mt-1">
                      <Car className="inline h-3 w-3 mr-1" />
                      <span className="font-medium">{facility.capacity.total}</span> spaces
                      {facility.capacity.disabled !== undefined && facility.capacity.disabled > 0 && (
                        <span className="ml-2 text-yellow-600">
                          ({facility.capacity.disabled} disabled)
                        </span>
                      )}
                      {facility.capacity.ev_charging !== undefined && facility.capacity.ev_charging > 0 && (
                        <span className="ml-2 text-cyan-600">
                          <Zap className="inline h-3 w-3" /> {facility.capacity.ev_charging} EV
                        </span>
                      )}
                    </div>
                  )}

                  {/* Max height */}
                  {facility.max_height && facility.max_height > 0 && (
                    <div className="text-xs mt-1 text-gray-600">
                      Max height: {(facility.max_height / 100).toFixed(2)}m
                    </div>
                  )}

                  {/* Operator */}
                  {facility.operator && (
                    <div className="text-xs mt-1 text-gray-600">
                      Operator: {facility.operator}
                    </div>
                  )}

                  {/* Opening hours */}
                  {facility.opening_hours && (
                    <div className="text-xs mt-1 text-gray-600">
                      Hours: {facility.opening_hours}
                    </div>
                  )}

                  {/* Access */}
                  {facility.access && (
                    <div className="text-xs mt-1 text-gray-600">
                      Access: {facility.access}
                    </div>
                  )}

                  {/* Website */}
                  {facility.website && (
                    <div className="text-xs mt-1">
                      <a href={facility.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                        Website
                      </a>
                    </div>
                  )}

                  {/* Source info */}
                  <div className="text-xs mt-3 pt-2 border-t border-gray-200 text-gray-400">
                    <div>Source: {SOURCE_LABELS[facility.source || ''] || facility.source}</div>
                    <div className="font-mono text-[10px] mt-0.5">ID: {facility.id}</div>
                    {facility.rdw_id && (
                      <div className="font-mono text-[10px]">RDW: {facility.rdw_id}</div>
                    )}
                    {facility.osm_id && (
                      <div className="font-mono text-[10px]">OSM: {facility.osm_id}</div>
                    )}
                    {facility.last_updated && (
                      <div className="text-[10px] mt-0.5">
                        Updated: {new Date(facility.last_updated).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
              </React.Fragment>
            );
          })}

          {/* Amsterdam GeoJSON layer */}
          {showAmsterdamLayer && amsterdamData && zoom >= 14 && (
            <GeoJSON
              key="amsterdam-parking"
              data={amsterdamData}
              style={amsterdamStyle}
              onEachFeature={(feature, layer) => {
                const props = feature.properties;
                layer.bindPopup(`
                  <div class="min-w-40" style="font-family: system-ui, sans-serif;">
                    <div style="font-weight: 600; font-size: 14px;">${props.straatnaam || props.name || "Street Parking"}</div>
                    <div style="font-size: 12px; margin-top: 4px; color: #666;">
                      ${props.soort || props.type || "Parking"}
                      ${props.fiscal_type ? ` (${props.fiscal_type})` : ""}
                    </div>
                    ${props.spot_count || props.capacity?.total ? `<div style="font-size: 12px; margin-top: 4px;">${props.spot_count || props.capacity?.total} spot(s)</div>` : ""}
                    ${props.buurtcode ? `<div style="font-size: 11px; margin-top: 4px; color: #888;">Buurt: ${props.buurtcode}</div>` : ""}
                    <div style="font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee; color: #999;">
                      <div>Source: Amsterdam Open Data</div>
                      <div style="font-family: monospace; font-size: 10px;">${props.id || ""}</div>
                    </div>
                  </div>
                `, { maxWidth: 300 });
              }}
            />
          )}

          {/* Rotterdam GeoJSON layer */}
          {showRotterdamLayer && rotterdamData && zoom >= 14 && (
            <GeoJSON
              key="rotterdam-parking"
              data={rotterdamData}
              style={rotterdamStyle}
              pointToLayer={(feature, latlng) => {
                return L.circleMarker(latlng, {
                  radius: 6,
                  fillColor: "#06b6d4",
                  color: "#06b6d4",
                  weight: 1,
                  opacity: 0.8,
                  fillOpacity: 0.5,
                });
              }}
              onEachFeature={(feature, layer) => {
                const props = feature.properties;
                layer.bindPopup(`
                  <div class="min-w-40">
                    <div class="font-semibold text-sm">${props.name || "Parking Spot"}</div>
                    <div class="text-xs mt-1">${PARKING_LABELS[props.type] || props.type || "Parking"}</div>
                    ${props.capacity?.total ? `<div class="text-xs mt-1">${props.capacity.total} spots</div>` : ""}
                    ${props.operator ? `<div class="text-xs mt-1 text-gray-500">Operator: ${props.operator}</div>` : ""}
                    ${props.fee ? `<div class="text-xs mt-1">${props.fee === 'yes' ? 'Paid' : props.fee === 'no' ? 'Free' : props.fee}</div>` : ""}
                    <div class="text-xs mt-2 text-gray-400 border-t pt-1">
                      <div>Source: Rotterdam / OSM</div>
                      <div class="font-mono text-[10px]">${props.id || props.osm_id || ''}</div>
                    </div>
                  </div>
                `);
              }}
            />
          )}

          {/* Elburg GeoJSON layer */}
          {showElburgLayer && elburgData && zoom >= 14 && (
            <GeoJSON
              key="elburg-parking"
              data={elburgData}
              style={elburgStyle}
              pointToLayer={(feature, latlng) => {
                return L.circleMarker(latlng, {
                  radius: 6,
                  fillColor: "#8b5cf6",
                  color: "#8b5cf6",
                  weight: 1,
                  opacity: 0.8,
                  fillOpacity: 0.5,
                });
              }}
              onEachFeature={(feature, layer) => {
                const props = feature.properties;
                layer.bindPopup(`
                  <div class="min-w-40">
                    <div class="font-semibold text-sm">${props.name || "Parking Spot"}</div>
                    <div class="text-xs mt-1">${PARKING_LABELS[props.type] || props.type || "Parking"}</div>
                    ${props.capacity?.total ? `<div class="text-xs mt-1">${props.capacity.total} spots</div>` : ""}
                    ${props.operator ? `<div class="text-xs mt-1 text-gray-500">Operator: ${props.operator}</div>` : ""}
                    <div class="text-xs mt-2 text-gray-400 border-t pt-1">
                      <div>Source: Elburg</div>
                      <div class="font-mono text-[10px]">${props.id || ''}</div>
                    </div>
                  </div>
                `);
              }}
            />
          )}

          {/* Zwolle GeoJSON layer */}
          {showZwolleLayer && zwolleData && zoom >= 14 && (
            <GeoJSON
              key="zwolle-parking"
              data={zwolleData}
              style={zwolleStyle}
              pointToLayer={(feature, latlng) => {
                return L.circleMarker(latlng, {
                  radius: 6,
                  fillColor: "#ec4899",
                  color: "#ec4899",
                  weight: 1,
                  opacity: 0.8,
                  fillOpacity: 0.5,
                });
              }}
              onEachFeature={(feature, layer) => {
                const props = feature.properties;
                layer.bindPopup(`
                  <div class="min-w-40">
                    <div class="font-semibold text-sm">${props.name || "Parking Spot"}</div>
                    <div class="text-xs mt-1">${PARKING_LABELS[props.type] || props.type || "Parking"}</div>
                    ${props.capacity?.total ? `<div class="text-xs mt-1">${props.capacity.total} spots</div>` : ""}
                    ${props.operator ? `<div class="text-xs mt-1 text-gray-500">Operator: ${props.operator}</div>` : ""}
                    <div class="text-xs mt-2 text-gray-400 border-t pt-1">
                      <div>Source: Zwolle</div>
                      <div class="font-mono text-[10px]">${props.id || ''}</div>
                    </div>
                  </div>
                `);
              }}
            />
          )}
        </MapContainer>

        {/* Zoom indicator */}
        <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg px-3 py-1 shadow-md text-sm z-20">
          Zoom: {zoom}
        </div>

        {/* Layer selector dropdown */}
        <div className="absolute top-4 right-4 z-[1000]">
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
            {(selectedFacility.address || selectedFacility.municipality) && (
              <div>
                <MapPin className="inline h-4 w-4 mr-1" />
                {selectedFacility.address || selectedFacility.municipality}
              </div>
            )}
            {selectedFacility.capacity?.total && (
              <div>
                <Car className="inline h-4 w-4 mr-1" />
                <span className="font-medium">{selectedFacility.capacity.total}</span> parking spaces
                {selectedFacility.capacity.ev_charging !== undefined && selectedFacility.capacity.ev_charging > 0 && (
                  <span className="ml-2 text-cyan-600">
                    <Zap className="inline h-4 w-4" /> {selectedFacility.capacity.ev_charging} EV
                  </span>
                )}
              </div>
            )}
            {selectedFacility.max_height && selectedFacility.max_height > 0 && (
              <div className="text-gray-500">
                Max height: {(selectedFacility.max_height / 100).toFixed(2)}m
              </div>
            )}
            {selectedFacility.opening_hours && (
              <div className="text-gray-500">
                Hours: {selectedFacility.opening_hours}
              </div>
            )}
            {selectedFacility.operator && (
              <div className="text-gray-500">
                Operator: {selectedFacility.operator}
              </div>
            )}
            {selectedFacility.website && (
              <div>
                <a href={selectedFacility.website} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-sm">
                  Visit website
                </a>
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
