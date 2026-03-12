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
  HelpCircle,
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

// InfoTooltip component for consistent tooltips
function InfoTooltip({ children, side = "right", className = "" }: { children: React.ReactNode; side?: "top" | "right" | "bottom" | "left"; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={`inline-flex items-center text-gray-400 hover:text-gray-600 transition-colors ${className}`}>
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
  other: {
    description: "Parking facilities that don't fit standard categories, including motorcycle parking, bicycle parking, etc.",
    sources: "OpenStreetMap community contributors.",
  },
};

// Tooltip descriptions for data sources
const SOURCE_TOOLTIPS: Record<string, string> = {
  osm: "OpenStreetMap (OSM) - Community-maintained open geographic database. Data contributed by volunteer mappers worldwide. Updated continuously. Quality varies by area.",
  rdw: "RDW (Rijksdienst voor het Wegverkeer) / NPR (Nationaal Parkeerregister) - Official Dutch vehicle authority. Provides registered parking facilities, real-time occupancy via SPDP 2.0 standard. Updated via opendata.rdw.nl.",
  amsterdam: "Amsterdam Open Data (data.amsterdam.nl) - Official municipal dataset of all individual parking spots (parkeervakken) in Amsterdam. Contains 261k+ spots with fiscal type and zone info.",
  rotterdam: "Rotterdam Open Data - Official municipal dataset of parking facilities and spots in Rotterdam. Contains ~20k spots.",
  utrecht: "Utrecht municipal parking data. Primarily through RDW/NPR integration.",
  eindhoven: "Eindhoven Open Data (data.eindhoven.nl) - Official municipal parking dataset.",
  elburg: "Elburg Open Data - Municipal parking data for the town of Elburg. Contains 298 individual parking spots.",
  zwolle: "Zwolle Open Data - Municipal parking data for Zwolle. Contains ~3,500 parking spots.",
  apeldoorn: "Apeldoorn parking data - Combined from RDW SPDP (real-time garage data) and OpenStreetMap. Contains 57 garages with real-time occupancy where available.",
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
  apeldoorn: "Apeldoorn",
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
  apeldoorn: "#84cc16", // Lime
};

// City center coordinates
const CITY_LOCATIONS: Record<string, { lat: number; lng: number; zoom: number }> = {
  amsterdam: { lat: 52.3676, lng: 4.9041, zoom: 14 },
  rotterdam: { lat: 51.9244, lng: 4.4777, zoom: 14 },
  elburg: { lat: 52.4493, lng: 5.8372, zoom: 15 },
  zwolle: { lat: 52.5168, lng: 6.0830, zoom: 14 },
  apeldoorn: { lat: 52.2112, lng: 5.9699, zoom: 14 },
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
  const [showApeldoornLayer, setShowApeldoornLayer] = useState(false);
  const [rotterdamData, setRotterdamData] = useState<any>(null);
  const [elburgData, setElburgData] = useState<any>(null);
  const [zwolleData, setZwolleData] = useState<any>(null);
  const [apeldoornData, setApeldoornData] = useState<any>(null);

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

  // Load Apeldoorn data when layer is enabled
  useEffect(() => {
    if (showApeldoornLayer && !apeldoornData) {
      fetch("/apeldoorn_parking.geojson")
        .then((r) => r.json())
        .then((data) => setApeldoornData(data))
        .catch((e) => console.error("Error loading Apeldoorn data:", e));
    }
  }, [showApeldoornLayer, apeldoornData]);

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

  // GeoJSON style for Apeldoorn layer
  const apeldoornStyle = useCallback(() => {
    return {
      color: "#84cc16",
      weight: 1,
      opacity: 0.8,
      fillColor: "#84cc16",
      fillOpacity: 0.3,
    };
  }, []);

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
              <InfoTooltip>
                <p className="font-semibold mb-1">Real-time occupancy data</p>
                <p>These facilities report live availability via the SPDP 2.0 standard (Standard for Publication of Dynamic Parking Data).</p>
                <p className="mt-1.5">Markers with a green pulsing ring have real-time data from RDW/NPR. The occupancy numbers update automatically.</p>
                <p className="mt-1.5 text-gray-400">Source: RDW via opendata.rdw.nl</p>
              </InfoTooltip>
            </div>
          )}

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
              <p>Toggle visibility of different parking categories on the map. Each type is color-coded. The source abbreviation shows where the data originates.</p>
              <p className="mt-1.5">Hover over each type for more details about what it includes and its data source.</p>
            </InfoTooltip>
          </div>
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
                    <span className="flex-1">
                      {label} <span className="text-gray-400 text-xs">({sourceText})</span>
                    </span>
                    <Badge variant="secondary" className="text-xs ml-1">
                      {count.toLocaleString()}
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
                <p className="mt-1.5">Hover over each source for details about the data provider and what information it contains.</p>
              </InfoTooltip>
            </div>
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
                <p className="mt-1.5">Enable a layer to load its data. Zoom to level 14+ to see individual spots. The map will automatically fly to the city when enabled.</p>
                <p className="mt-1.5 text-gray-400">Each city's data comes from their official open data portal or a combination of RDW + OSM data.</p>
              </InfoTooltip>
            </div>
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
                    Amsterdam <span className="text-gray-400 text-xs">(261k spots)</span>
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Amsterdam Parking Spots</p>
                  <p>261,000+ individual parking spaces (parkeervakken) from Amsterdam's official open data portal.</p>
                  <p className="mt-1">Includes fiscal type (paid/free/permit), street name, neighborhood code, and zone information.</p>
                  <p className="mt-1.5 text-gray-400">Source: data.amsterdam.nl - Parkeervakken API</p>
                </InfoTooltip>
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
                    Rotterdam <span className="text-gray-400 text-xs">(20k spots)</span>
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Rotterdam Parking</p>
                  <p>~20,000 parking facilities and spots from Rotterdam's open data portal.</p>
                  <p className="mt-1">Includes facility type, capacity, operator, and fee information.</p>
                  <p className="mt-1.5 text-gray-400">Source: Rotterdam Open Data / OpenStreetMap</p>
                </InfoTooltip>
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
                    Elburg <span className="text-gray-400 text-xs">(298 spots)</span>
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Elburg Parking</p>
                  <p>298 individual parking spots from Elburg's municipal open data.</p>
                  <p className="mt-1">Covers the historic town center and surrounding areas.</p>
                  <p className="mt-1.5 text-gray-400">Source: Elburg Open Data</p>
                </InfoTooltip>
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
                    Zwolle <span className="text-gray-400 text-xs">(3.5k spots)</span>
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Zwolle Parking</p>
                  <p>~3,500 parking spots from Zwolle's municipal open data.</p>
                  <p className="mt-1">Includes facility type, capacity, and operator information.</p>
                  <p className="mt-1.5 text-gray-400">Source: Zwolle Open Data</p>
                </InfoTooltip>
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

              <div className="flex items-center gap-2">
                <Checkbox
                  id="apeldoorn"
                  checked={showApeldoornLayer}
                  onCheckedChange={() => {
                    if (!showApeldoornLayer) {
                      setFlyToTarget(CITY_LOCATIONS.apeldoorn);
                    }
                    setShowApeldoornLayer(!showApeldoornLayer);
                  }}
                />
                <Label htmlFor="apeldoorn" className="cursor-pointer flex-1">
                  <span className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: "#84cc16" }} />
                    Apeldoorn <span className="text-gray-400 text-xs">(57 garages)</span>
                  </span>
                </Label>
                <InfoTooltip>
                  <p className="font-semibold mb-1">Apeldoorn Parking</p>
                  <p>57 parking garages combining RDW SPDP real-time data with OpenStreetMap locations.</p>
                  <p className="mt-1">Green markers indicate facilities with real-time occupancy data. Visible from zoom level 12+.</p>
                  <p className="mt-1.5 text-gray-400">Sources: RDW SPDP 2.0 (real-time) + OpenStreetMap</p>
                </InfoTooltip>
                <button
                  onClick={() => setFlyToTarget(CITY_LOCATIONS.apeldoorn)}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                  title="Go to Apeldoorn"
                >
                  <Navigation className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              {showApeldoornLayer && !apeldoornData && (
                <div className="text-xs text-gray-500 ml-5">Loading...</div>
              )}
            </div>
            {(showAmsterdamLayer || showRotterdamLayer || showElburgLayer || showZwolleLayer || showApeldoornLayer) && zoom < 14 && (
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
            <Badge variant="outline" className="text-xs" style={{ borderColor: SOURCE_COLORS.apeldoorn, color: SOURCE_COLORS.apeldoorn }}>APE</Badge>
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

          {/* Apeldoorn GeoJSON layer */}
          {showApeldoornLayer && apeldoornData && zoom >= 12 && (
            <GeoJSON
              key="apeldoorn-parking"
              data={apeldoornData}
              style={apeldoornStyle}
              pointToLayer={(feature, latlng) => {
                const props = feature.properties;
                const hasRealtime = props.has_realtime;
                return L.circleMarker(latlng, {
                  radius: hasRealtime ? 10 : 8,
                  fillColor: hasRealtime ? "#22c55e" : "#84cc16",
                  color: hasRealtime ? "#22c55e" : "#84cc16",
                  weight: hasRealtime ? 3 : 1,
                  opacity: 0.9,
                  fillOpacity: hasRealtime ? 0.7 : 0.5,
                });
              }}
              onEachFeature={(feature, layer) => {
                const props = feature.properties;
                const capacityStr = props.capacity?.total ? `<div class="text-xs mt-1">${props.capacity.total} spots</div>` : "";
                const operatorStr = props.operator ? `<div class="text-xs mt-1 text-gray-500">Operator: ${props.operator}</div>` : "";
                const realtimeStr = props.has_realtime ? `<div class="text-xs mt-1 text-green-600 font-medium">🔴 Real-time data available</div>` : "";
                const maxHeightStr = props.max_height ? `<div class="text-xs mt-1 text-gray-500">Max height: ${(props.max_height / 100).toFixed(2)}m</div>` : "";
                layer.bindPopup(`
                  <div class="min-w-48">
                    <div class="font-semibold text-sm">${props.name || "Parking Garage"}</div>
                    <div class="text-xs mt-1">${PARKING_LABELS[props.type] || props.type || "Garage"}</div>
                    ${realtimeStr}
                    ${capacityStr}
                    ${operatorStr}
                    ${maxHeightStr}
                    <div class="text-xs mt-2 text-gray-400 border-t pt-1">
                      <div>Source: ${props.source === 'rdw' ? 'RDW SPDP' : 'OpenStreetMap'}</div>
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
            <div className="text-xs mt-2 pt-2 border-t border-gray-200 text-gray-400">
              <div>Source: {SOURCE_LABELS[selectedFacility.source || ''] || selectedFacility.source}</div>
              {selectedFacility.source && SOURCE_TOOLTIPS[selectedFacility.source] && (
                <div className="text-[10px] mt-0.5 text-gray-400 italic">{SOURCE_TOOLTIPS[selectedFacility.source].split('.')[0]}.</div>
              )}
              {selectedFacility.last_updated && (
                <div className="text-[10px] mt-0.5">Updated: {new Date(selectedFacility.last_updated).toLocaleDateString()}</div>
              )}
            </div>
          </div>
        </Card>
      )}
    </div>
    </TooltipProvider>
  );
}
