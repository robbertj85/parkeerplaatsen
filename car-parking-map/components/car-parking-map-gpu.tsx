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
};

const SOURCE_COLORS: Record<string, string> = {
  osm: "#10b981",
  rdw: "#3b82f6",
  amsterdam: "#f97316",
};

// Base map styles
const BASE_LAYERS = {
  osm: {
    name: "OpenStreetMap",
    style: {
      version: 8 as const,
      sources: {
        osm: {
          type: "raster" as const,
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors",
        },
      },
      layers: [
        {
          id: "osm",
          type: "raster" as const,
          source: "osm",
        },
      ],
    },
  },
  satellite: {
    name: "Satellite",
    style: {
      version: 8 as const,
      sources: {
        satellite: {
          type: "raster" as const,
          tiles: [
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          ],
          tileSize: 256,
          attribution: "© Esri",
        },
      },
      layers: [
        {
          id: "satellite",
          type: "raster" as const,
          source: "satellite",
        },
      ],
    },
  },
  light: {
    name: "Light",
    style:
      "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
  },
  dark: {
    name: "Dark",
    style:
      "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
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
    object: ParkingFacility;
  } | null>(null);
  const [showAmsterdamLayer, setShowAmsterdamLayer] = useState(false);
  const [showRotterdamLayer, setShowRotterdamLayer] = useState(false);

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
          getFillColor: [249, 115, 22, 100],
          getLineColor: [249, 115, 22, 200],
          getLineWidth: 1,
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
          getFillColor: [6, 182, 212, 100],
          getLineColor: [6, 182, 212, 200],
          getLineWidth: 1,
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
            </div>
            {(showAmsterdamLayer || showRotterdamLayer) &&
              viewState.zoom < 14 && (
                <div className="text-xs text-yellow-600 mt-2">
                  Zoom in to level 14+ to see individual spots
                </div>
              )}
          </div>

          {/* Base layer selector */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Base Map
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(BASE_LAYERS).map(([key, layer]) => (
                <Button
                  key={key}
                  variant={baseLayer === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setBaseLayer(key)}
                  className="text-xs"
                >
                  {layer.name}
                </Button>
              ))}
            </div>
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
              {PARKING_LABELS[hoverInfo.object.type] || hoverInfo.object.type}
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
            {selectedFacility.capacity?.total && (
              <div>
                <Car className="inline h-4 w-4 mr-1" />
                {selectedFacility.capacity.total} parking spaces
              </div>
            )}
            {selectedFacility.operator && (
              <div className="text-gray-500">
                Operator: {selectedFacility.operator}
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
