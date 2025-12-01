"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents } from "react-leaflet";
import L, { LatLngExpression, LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Truck, MapPin, Search, X, RefreshCw, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import area from "@turf/area";
import type { NDWEnrichedFacility, NDWDataResponse } from "@/lib/ndw-types";

// Fix Leaflet default icon issue with Next.js
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface EnrichedFeature {
  id: string;
  osm_id: number;
  osm_type: string;
  data_source: string;
  last_updated: string;
  tags: any;
  name: string;
  geometry: {
    type: string;
    coordinates: any;
  };
  latitude: number;
  longitude: number;
  location?: {
    highway_type?: string;
    municipality?: string;
    province?: string;
    road?: string;
    postcode?: string;
    highway?: string;
  };
  hgv?: string;
  parking_type?: string;
  confidence_score: number;
  classification: {
    is_truck_parking: boolean;
    is_rest_area: boolean;
    is_service_area: boolean;
    confidence: number;
  };
  capacity?: any;
  facility_type?: string;
}

const FACILITY_COLORS = {
  truck_parking: "#ef4444",
  service_area: "#3b82f6",
  rest_area: "#10b981",
};

const FACILITY_LABELS = {
  truck_parking: "Truck Parking",
  service_area: "Service Area",
  rest_area: "Rest Area",
};

// Base map layer options
const BASE_LAYERS = {
  osm: {
    name: "OpenStreetMap",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    name: "Satellite (Global)",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
  pdokAerial: {
    name: "PDOK Aerial 25cm",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_ortho25/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> - Actuele luchtfoto\'s ortho 25cm',
  },
  pdokHR: {
    name: "PDOK Aerial HR",
    url: "https://service.pdok.nl/hwh/luchtfotorgb/wmts/v1_0/Actueel_orthoHR/EPSG:3857/{z}/{x}/{y}.jpeg",
    attribution: '&copy; <a href="https://www.pdok.nl">PDOK</a> - Actuele luchtfoto\'s ortho HR',
  },
  topo: {
    name: "Topographic",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
  },
  dark: {
    name: "Dark",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  light: {
    name: "Light",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
};

// Component to handle zoom and viewport changes
function MapEventHandler({
  onZoomChange,
  onViewportChange
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

// Component to handle flying to a specific location
function FlyToLocation({ target }: { target: { lat: number; lng: number; zoom?: number } | null }) {
  const map = useMap();

  useEffect(() => {
    if (target) {
      map.flyTo([target.lat, target.lng], target.zoom || 15, {
        duration: 1.5,
        easeLinearity: 0.25,
      });
    }
  }, [target, map]);

  return null;
}

export default function TruckParkingMapEnhanced() {
  const [data, setData] = useState<EnrichedFeature[] | null>(null);
  const [filters, setFilters] = useState({
    truck_parking: true,
    service_area: true,
    rest_area: true,
  });
  const [stats, setStats] = useState({
    total: 0,
    truck_parking: 0,
    service_area: 0,
    rest_area: 0,
  });
  const [zoom, setZoom] = useState(8);
  const [hoveredFacility, setHoveredFacility] = useState<string | null>(null);
  const [selectedFacility, setSelectedFacility] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [showProvinces, setShowProvinces] = useState(true);
  const [showMunicipalities, setShowMunicipalities] = useState(false);
  const [provinces, setProvinces] = useState<any>(null);
  const [municipalities, setMunicipalities] = useState<any>(null);
  const [viewport, setViewport] = useState<LatLngBounds | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const geoJsonLayerRef = useRef<L.GeoJSON | null>(null);
  const markerClusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const ndwClusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const euClusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);

  // Base layer state
  const [baseLayer, setBaseLayer] = useState("osm");

  // Zoom to location state
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  // NDW real-time data state
  const [ndwData, setNdwData] = useState<NDWEnrichedFacility[] | null>(null);
  const [showNdwLayer, setShowNdwLayer] = useState(true);
  const [ndwLastUpdated, setNdwLastUpdated] = useState<string | null>(null);
  const [isRefreshingNdw, setIsRefreshingNdw] = useState(false);
  const ndwGeoJsonLayerRef = useRef<L.GeoJSON | null>(null);

  // Zenodo data state (Fraunhofer ISI - 19,713 facilities)
  const [zenodoData, setZenodoData] = useState<any[] | null>(null);
  const [showZenodoLayer, setShowZenodoLayer] = useState(false); // Off by default (19k+ markers)
  const [zenodoLastUpdated, setZenodoLastUpdated] = useState<string | null>(null);
  const [isRefreshingZenodo, setIsRefreshingZenodo] = useState(false);
  const zenodoGeoJsonLayerRef = useRef<L.GeoJSON | null>(null);

  // Parking spaces overlay state - 3 separate layers
  const [osmParkingSpaces, setOsmParkingSpaces] = useState<any>(null);
  const [estimatedParkingSpaces, setEstimatedParkingSpaces] = useState<any>(null);
  const [showOsmTruckSpaces, setShowOsmTruckSpaces] = useState(false);
  const [showOsmVanSpaces, setShowOsmVanSpaces] = useState(false);
  const [showEstimatedSpaces, setShowEstimatedSpaces] = useState(false);

  // Province-based parking space loading
  const [provinceIndex, setProvinceIndex] = useState<any>(null);
  const [loadedProvinces, setLoadedProvinces] = useState<Set<string>>(new Set());
  const [parkingSpaceCache, setParkingSpaceCache] = useState<Map<string, any>>(new Map());

  // Location search state
  const [locationSearch, setLocationSearch] = useState("");
  const [showLocationDropdown, setShowLocationDropdown] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<{
    type: 'province' | 'municipality';
    name: string;
    stats?: {
      total: number;
      truck_parking: number;
      service_area: number;
      rest_area: number;
      detected_parking_spaces: number;
    };
  } | null>(null);

  // Fetch facilities data based on viewport and filters
  const fetchFacilities = useCallback(async () => {
    if (!viewport) return;

    try {
      setIsLoadingData(true);
      const bounds = viewport;
      const boundsParam = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

      const activeTypes = Object.entries(filters)
        .filter(([_, enabled]) => enabled)
        .map(([type]) => type);

      const params = new URLSearchParams({
        bounds: boundsParam,
        types: activeTypes.join(','),
        search: searchTerm,
        limit: '2000', // Load more at once to reduce requests
      });

      const response = await fetch(`/api/facilities?${params}`);
      if (!response.ok) throw new Error('Failed to fetch facilities');

      const result = await response.json();

      console.log("Facilities loaded:", {
        total: result.total,
        loaded: result.facilities.length,
        viewport: boundsParam,
      });

      setData(result.facilities);
      setStats(result.stats);
    } catch (error) {
      console.error("Error loading facilities:", error);
    } finally {
      setIsLoadingData(false);
    }
  }, [viewport, filters, searchTerm]);

  // Fetch data when viewport or filters change (with debouncing)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      fetchFacilities();
    }, 500); // Debounce by 500ms to avoid excessive requests during panning/zooming

    return () => clearTimeout(timeoutId);
  }, [fetchFacilities]);

  // Fetch NDW real-time data
  const fetchNdwData = async () => {
    try {
      setIsRefreshingNdw(true);
      const response = await fetch("/api/ndw");
      if (!response.ok) throw new Error("Failed to fetch NDW data");
      const ndwResponse: NDWDataResponse = await response.json();
      setNdwData(ndwResponse.facilities);
      setNdwLastUpdated(ndwResponse.lastUpdated);
      console.log("NDW data loaded:", {
        totalFacilities: ndwResponse.totalFacilities,
        withLiveStatus: ndwResponse.facilities.filter(f => f.liveStatus).length,
      });
    } catch (error) {
      console.error("Error fetching NDW data:", error);
    } finally {
      setIsRefreshingNdw(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    fetchNdwData();

    // Auto-refresh every minute (NDW updates every minute)
    const interval = setInterval(fetchNdwData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch Zenodo data
  const fetchZenodoData = async () => {
    try {
      setIsRefreshingZenodo(true);
      const response = await fetch("/api/zenodo");
      if (!response.ok) throw new Error("Failed to fetch Zenodo data");
      const zenodoResponse = await response.json();
      setZenodoData(zenodoResponse.facilities);
      setZenodoLastUpdated(zenodoResponse.lastUpdated);
      console.log("Zenodo data loaded:", {
        totalFacilities: zenodoResponse.totalFacilities,
        countries: zenodoResponse.countries,
      });
    } catch (error) {
      console.error("Error fetching Zenodo data:", error);
    } finally {
      setIsRefreshingZenodo(false);
    }
  };

  useEffect(() => {
    // Only fetch when layer is enabled (to save bandwidth - 19k+ facilities)
    if (showZenodoLayer && !zenodoData) {
      fetchZenodoData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showZenodoLayer]);

  // Lazy load administrative boundaries only when enabled
  useEffect(() => {
    if (showProvinces && !provinces) {
      console.log("Loading provinces...");
      fetch("https://cartomap.github.io/nl/wgs84/provincie_2020.geojson")
        .then((res) => res.json())
        .then((data) => {
          console.log("Provinces loaded");
          setProvinces(data);
        })
        .catch((error) => {
          console.error("Error loading provinces:", error);
        });
    }
  }, [showProvinces, provinces]);

  useEffect(() => {
    if (showMunicipalities && !municipalities) {
      console.log("Loading municipalities...");
      fetch("https://cartomap.github.io/nl/wgs84/gemeente_2020.geojson")
        .then((res) => res.json())
        .then((data) => {
          console.log("Municipalities loaded");
          setMunicipalities(data);
        })
        .catch((error) => {
          console.error("Error loading municipalities:", error);
        });
    }
  }, [showMunicipalities, municipalities]);

  // Load province index on mount
  useEffect(() => {
    fetch("/provinces/province_index.json")
      .then((res) => res.json())
      .then((data) => {
        console.log("🗺️ Province index loaded:", Object.keys(data).length, "provinces");
        setProvinceIndex(data);
      })
      .catch((error) => {
        console.error("❌ Error loading province index:", error);
      });
  }, []);

  // Check which provinces intersect with viewport bounds
  const getVisibleProvinces = useCallback((mapBounds: LatLngBounds): string[] => {
    if (!provinceIndex) return [];

    const visible: string[] = [];
    const south = mapBounds.getSouth();
    const north = mapBounds.getNorth();
    const west = mapBounds.getWest();
    const east = mapBounds.getEast();

    for (const [key, province] of Object.entries<any>(provinceIndex)) {
      const bounds = province.bounds;
      // Check if province bounds intersect with viewport
      if (!(bounds.max_lat < south || bounds.min_lat > north ||
            bounds.max_lon < west || bounds.min_lon > east)) {
        visible.push(key);
      }
    }

    // Always include "other" for unassigned spaces
    visible.push('other');

    return visible;
  }, [provinceIndex]);

  // Load parking spaces for visible provinces
  const loadProvinceParkingSpaces = useCallback(async (provinceKeys: string[]) => {
    if (!provinceIndex) return;

    // Determine which provinces need to be loaded
    const toLoad = provinceKeys.filter(key => !loadedProvinces.has(key));

    if (toLoad.length === 0) {
      // All required provinces already loaded, merge cache
      const allFeatures: any[] = [];
      provinceKeys.forEach(key => {
        const cached = parkingSpaceCache.get(key);
        if (cached) {
          allFeatures.push(...cached.features);
        }
      });

      setOsmParkingSpaces({
        type: 'FeatureCollection',
        features: allFeatures
      });

      console.log("♻️ Using cached provinces:", provinceKeys.length, "Total features:", allFeatures.length);
      return;
    }

    console.log("🔄 Loading provinces:", toLoad.join(', '));

    // Load new provinces via API route (handles gzip decompression)
    const loadPromises = toLoad.map(async (key) => {
      const filename = key === 'other'
        ? 'other_parking_spaces.geojson.gz'
        : `${key}_parking_spaces.geojson.gz`;

      try {
        const res = await fetch(`/api/provinces/${filename}`);
        if (!res.ok) throw new Error(`Failed to load ${key}: ${res.status}`);

        const data = await res.json();

        console.log(`  ✓ ${key}: ${data.features.length} spaces`);

        return { key, data };
      } catch (error) {
        console.error(`  ✗ ${key}: ${error}`);
        return { key, data: null };
      }
    });

    const results = await Promise.all(loadPromises);

    // Update cache and loaded set
    const newCache = new Map(parkingSpaceCache);
    const newLoaded = new Set(loadedProvinces);

    results.forEach(({ key, data }) => {
      if (data) {
        newCache.set(key, data);
        newLoaded.add(key);
      }
    });

    setParkingSpaceCache(newCache);
    setLoadedProvinces(newLoaded);

    // Merge all required provinces
    const allFeatures: any[] = [];
    provinceKeys.forEach(key => {
      const cached = newCache.get(key);
      if (cached) {
        allFeatures.push(...cached.features);
      }
    });

    setOsmParkingSpaces({
      type: 'FeatureCollection',
      features: allFeatures
    });

    console.log("✅ Parking spaces updated:", {
      loadedNewProvinces: toLoad.length,
      totalProvincesLoaded: newLoaded.size,
      totalFeatures: allFeatures.length,
      truck: allFeatures.filter((f: any) => f.properties.vehicle_type === 'truck').length,
      car: allFeatures.filter((f: any) => f.properties.vehicle_type === 'car').length
    });

  }, [provinceIndex, loadedProvinces, parkingSpaceCache]);

  // Viewport-based parking space loading
  useEffect(() => {
    if (!(showOsmTruckSpaces || showOsmVanSpaces)) {
      // Parking spaces disabled, clear data
      setOsmParkingSpaces(null);
      return;
    }

    if (!viewport || !provinceIndex) return;

    const visibleProvinces = getVisibleProvinces(viewport);

    if (visibleProvinces.length > 0) {
      loadProvinceParkingSpaces(visibleProvinces);
    }
  }, [showOsmTruckSpaces, showOsmVanSpaces, viewport, provinceIndex, getVisibleProvinces, loadProvinceParkingSpaces]);

  // Lazy load estimated parking spaces only when enabled
  // NOTE: Loading South Holland OSM parking areas (3,532 parking area boundaries)
  useEffect(() => {
    if (showEstimatedSpaces && !estimatedParkingSpaces) {
      console.log("Loading South Holland OSM parking areas...");
      fetch("/south_holland_osm_parking_spaces.geojson")
        .then((res) => res.json())
        .then((data) => {
          console.log("South Holland OSM parking areas loaded:", {
            totalFeatures: data.features.length,
            note: "OSM parking area boundaries for all of South Holland"
          });
          setEstimatedParkingSpaces(data);
        })
        .catch((error) => {
          console.error("Error loading OSM parking areas:", error);
        });
    }
  }, [showEstimatedSpaces, estimatedParkingSpaces]);

  // Handle location selection after boundaries are loaded
  useEffect(() => {
    if (selectedLocation && !selectedLocation.stats && data) {
      const boundaryData = selectedLocation.type === 'province' ? provinces : municipalities;
      if (boundaryData) {
        const feature = boundaryData.features.find(
          (f: any) => f.properties?.name?.toLowerCase() === selectedLocation.name.toLowerCase()
        );

        if (feature) {
          const geoJsonLayer = L.geoJSON(feature);
          const bounds = geoJsonLayer.getBounds();

          setFlyToTarget({
            lat: bounds.getCenter().lat,
            lng: bounds.getCenter().lng,
            zoom: selectedLocation.type === 'province' ? 9 : 11,
          });

          const facilitiesInLocation = data?.filter((f) =>
            selectedLocation.type === 'province'
              ? f.location?.province?.toLowerCase() === selectedLocation.name.toLowerCase()
              : f.location?.municipality?.toLowerCase() === selectedLocation.name.toLowerCase()
          ) || [];

          // Count all parking spaces (OSM + estimated)
          const osmSpaces = osmParkingSpaces?.features?.filter((f: any) =>
            facilitiesInLocation.some(facility =>
              Math.abs(facility.latitude - f.geometry.coordinates[1]) < 0.001 &&
              Math.abs(facility.longitude - f.geometry.coordinates[0]) < 0.001
            )
          )?.length || 0;
          const estSpaces = estimatedParkingSpaces?.features?.filter((f: any) =>
            facilitiesInLocation.some(facility =>
              facility.id === f.properties.facility_id
            )
          )?.length || 0;
          const detectedSpaces = osmSpaces + estSpaces;

          setSelectedLocation({
            ...selectedLocation,
            stats: {
              total: facilitiesInLocation.length,
              truck_parking: facilitiesInLocation.filter(f => f.facility_type === 'truck_parking').length,
              service_area: facilitiesInLocation.filter(f => f.facility_type === 'service_area').length,
              rest_area: facilitiesInLocation.filter(f => f.facility_type === 'rest_area').length,
              detected_parking_spaces: detectedSpaces,
            },
          });
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provinces, municipalities, data, osmParkingSpaces, estimatedParkingSpaces]);

  const center: LatLngExpression = [52.1326, 5.2913]; // Center of Netherlands
  const initialZoom = 8;

  const toggleFilter = (type: keyof typeof filters) => {
    setFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // Data is already filtered on the server, so we just use it directly
  const filteredData = data || [];

  // Filter NDW data by viewport for better performance
  const filteredNdwData = useMemo(() => {
    if (!ndwData || !viewport) return ndwData || [];

    return ndwData.filter((facility) => {
      const lat = facility.location.latitude;
      const lng = facility.location.longitude;
      return lat >= viewport.getSouth() && lat <= viewport.getNorth() &&
             lng >= viewport.getWest() && lng <= viewport.getEast();
    });
  }, [ndwData, viewport]);

  // Filter Zenodo data by viewport for better performance
  const filteredZenodoData = useMemo(() => {
    if (!zenodoData || !viewport) return zenodoData || [];

    return zenodoData.filter((facility: any) => {
      const lat = facility.location.latitude;
      const lng = facility.location.longitude;
      return lat >= viewport.getSouth() && lat <= viewport.getNorth() &&
             lng >= viewport.getWest() && lng <= viewport.getEast();
    });
  }, [zenodoData, viewport]);

  // Get unique municipalities and provinces from data
  const locationOptions = useMemo(() => {
    if (!data) return { provinces: [], municipalities: [] };

    const provincesSet = new Set<string>();
    const municipalitiesSet = new Set<string>();

    data.forEach((facility) => {
      if (facility.location?.province) {
        provincesSet.add(facility.location.province);
      }
      if (facility.location?.municipality) {
        municipalitiesSet.add(facility.location.municipality);
      }
    });

    return {
      provinces: Array.from(provincesSet).sort(),
      municipalities: Array.from(municipalitiesSet).sort(),
    };
  }, [data]);

  // Filter location options based on search
  const filteredLocationOptions = useMemo(() => {
    const searchLower = locationSearch.toLowerCase();
    return {
      provinces: locationOptions.provinces.filter((p) => p.toLowerCase().includes(searchLower)),
      municipalities: locationOptions.municipalities.filter((m) => m.toLowerCase().includes(searchLower)),
    };
  }, [locationOptions, locationSearch]);

  // Handle location selection
  const handleLocationSelect = useCallback((type: 'province' | 'municipality', name: string) => {
    setLocationSearch(name);
    setShowLocationDropdown(false);

    // Find the boundary for this location
    const boundaryData = type === 'province' ? provinces : municipalities;
    if (!boundaryData) {
      // Load the boundary data first
      if (type === 'province') {
        setShowProvinces(true);
      } else {
        setShowMunicipalities(true);
      }
      // Set a flag to zoom after data loads
      setSelectedLocation({ type, name });
      return;
    }

    const feature = boundaryData.features.find(
      (f: any) => f.properties?.name?.toLowerCase() === name.toLowerCase()
    );

    if (feature) {
      // Calculate bounds from the feature geometry
      const geoJsonLayer = L.geoJSON(feature);
      const bounds = geoJsonLayer.getBounds();

      // Zoom to the location
      setFlyToTarget({
        lat: bounds.getCenter().lat,
        lng: bounds.getCenter().lng,
        zoom: type === 'province' ? 9 : 11,
      });

      // Calculate stats for this location
      const facilitiesInLocation = data?.filter((f) =>
        type === 'province'
          ? f.location?.province?.toLowerCase() === name.toLowerCase()
          : f.location?.municipality?.toLowerCase() === name.toLowerCase()
      ) || [];

      // Count all parking spaces (OSM + estimated)
      const osmSpaces = osmParkingSpaces?.features?.filter((f: any) =>
        facilitiesInLocation.some(facility =>
          Math.abs(facility.latitude - f.geometry.coordinates[1]) < 0.001 &&
          Math.abs(facility.longitude - f.geometry.coordinates[0]) < 0.001
        )
      )?.length || 0;
      const estSpaces = estimatedParkingSpaces?.features?.filter((f: any) =>
        facilitiesInLocation.some(facility =>
          facility.id === f.properties.facility_id
        )
      )?.length || 0;
      const detectedSpaces = osmSpaces + estSpaces;

      setSelectedLocation({
        type,
        name,
        stats: {
          total: facilitiesInLocation.length,
          truck_parking: facilitiesInLocation.filter(f => f.facility_type === 'truck_parking').length,
          service_area: facilitiesInLocation.filter(f => f.facility_type === 'service_area').length,
          rest_area: facilitiesInLocation.filter(f => f.facility_type === 'rest_area').length,
          detected_parking_spaces: detectedSpaces,
        },
      });
    }
  }, [provinces, municipalities, data, osmParkingSpaces, estimatedParkingSpaces]);

  // Calculate radius based on zoom level (memoized)
  const getMarkerRadius = useCallback((zoomLevel: number) => {
    if (zoomLevel <= 7) return 4;
    if (zoomLevel <= 9) return 6;
    if (zoomLevel <= 11) return 8;
    if (zoomLevel <= 13) return 10;
    return 12;
  }, []);

  // Get color based on occupancy status (memoized)
  const getOccupancyColor = useCallback((facility: NDWEnrichedFacility) => {
    if (!facility.liveStatus) return "#94a3b8"; // Gray for no status

    const { status, occupancy } = facility.liveStatus;

    if (status === "full") return "#dc2626"; // Red for full
    if (status === "unknown") return "#94a3b8"; // Gray for unknown

    // Green to yellow to red gradient based on occupancy percentage
    if (occupancy < 50) return "#10b981"; // Green - plenty of space
    if (occupancy < 75) return "#f59e0b"; // Orange - getting full
    return "#ef4444"; // Red - nearly full
  }, []);

  const handleFacilityClick = (facilityId: string) => {
    setSelectedFacility(facilityId);
    const facility = filteredData.find((f) => f.id === facilityId);
    if (facility) {
      // Zoom to the facility location
      setFlyToTarget({
        lat: facility.latitude,
        lng: facility.longitude,
        zoom: 16,
      });

      // Open popup after a short delay to allow map to zoom first
      if (geoJsonLayerRef.current) {
        setTimeout(() => {
          geoJsonLayerRef.current?.eachLayer((layer: any) => {
            if (layer.feature?.id === facilityId) {
              layer.openPopup();
            }
          });
        }, 1600); // Slightly longer than the flyTo duration
      }
    }
  };

  const renderFacilityDetails = (feature: EnrichedFeature) => {
    const tags = feature.tags || {};
    const capacity = feature.capacity || tags;

    return (
      <div className="text-xs space-y-1">
        <p><strong>Name:</strong> {feature.name}</p>
        <p><strong>Type:</strong> {FACILITY_LABELS[feature.facility_type as keyof typeof FACILITY_LABELS]}</p>

        {/* Capacity Information */}
        {capacity?.["capacity:truck"] && (
          <p><strong>🚛 Truck Capacity:</strong> {capacity["capacity:truck"]} spaces</p>
        )}
        {capacity?.capacity && !capacity?.["capacity:truck"] && (
          <p><strong>Capacity:</strong> {capacity.capacity} spaces</p>
        )}

        {/* Location */}
        {feature.location?.highway && (
          <p><strong>Highway:</strong> {feature.location.highway}</p>
        )}
        {feature.location?.municipality && (
          <p><strong>Municipality:</strong> {feature.location.municipality}</p>
        )}
        {feature.location?.province && (
          <p><strong>Province:</strong> {feature.location.province}</p>
        )}
        {feature.location?.postcode && (
          <p><strong>Postcode:</strong> {feature.location.postcode}</p>
        )}

        {/* Additional Tags */}
        {tags.operator && <p><strong>Operator:</strong> {tags.operator}</p>}
        {tags.opening_hours && <p><strong>Hours:</strong> {tags.opening_hours}</p>}
        {feature.hgv && <p><strong>HGV:</strong> {feature.hgv}</p>}
        {feature.parking_type && <p><strong>Parking Type:</strong> {feature.parking_type}</p>}

        {/* Amenities */}
        {(tags.fuel || tags.amenity?.includes("fuel")) && <p>⛽ Fuel available</p>}
        {tags.restaurant && <p>🍴 Restaurant</p>}
        {tags.toilets && <p>🚻 Toilets</p>}
        {tags.wifi && <p>📶 WiFi</p>}

        {/* More capacity details */}
        {capacity?.["capacity:shower"] && <p><strong>Showers:</strong> {capacity["capacity:shower"]}</p>}
        {capacity?.["capacity:toilets"] && <p><strong>Toilets:</strong> {capacity["capacity:toilets"]}</p>}
        {capacity?.["capacity:restaurant"] && <p><strong>Restaurant Capacity:</strong> {capacity["capacity:restaurant"]}</p>}

        <p className="pt-1 border-t mt-1 text-gray-500">
          <strong>Confidence:</strong> {(feature.confidence_score * 100).toFixed(0)}%
        </p>
      </div>
    );
  };

  return (
    <div className="flex h-screen">
      {/* Left Panel - Filters */}
      {leftPanelOpen && (
        <div className="w-80 border-r bg-background overflow-y-auto flex flex-col">
          {/* Header */}
          <div className="p-4 border-b">
            <div className="flex items-center gap-3 mb-2">
              <Truck className="h-6 w-6 text-primary" />
              <div className="flex-1">
                <h2 className="text-lg font-bold">Filters & Layers</h2>
                <p className="text-xs text-muted-foreground">
                  {stats.total.toLocaleString()} facilities
                </p>
              </div>
              <button
                onClick={() => setLeftPanelOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Facility Type Filters */}
          <div className="p-4 border-b">
            <h3 className="font-semibold mb-3 text-sm">Facility Types</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="truck_parking"
                  checked={filters.truck_parking}
                  onCheckedChange={() => toggleFilter("truck_parking")}
                />
                <Label
                  htmlFor="truck_parking"
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: FACILITY_COLORS.truck_parking }}
                  />
                  {FACILITY_LABELS.truck_parking}
                  <Badge variant="secondary" className="ml-auto">
                    {stats.truck_parking}
                  </Badge>
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="service_area"
                  checked={filters.service_area}
                  onCheckedChange={() => toggleFilter("service_area")}
                />
                <Label
                  htmlFor="service_area"
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: FACILITY_COLORS.service_area }}
                  />
                  {FACILITY_LABELS.service_area}
                  <Badge variant="secondary" className="ml-auto">
                    {stats.service_area}
                  </Badge>
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rest_area"
                  checked={filters.rest_area}
                  onCheckedChange={() => toggleFilter("rest_area")}
                />
                <Label
                  htmlFor="rest_area"
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: FACILITY_COLORS.rest_area }}
                  />
                  {FACILITY_LABELS.rest_area}
                  <Badge variant="secondary" className="ml-auto">
                    {stats.rest_area}
                  </Badge>
                </Label>
              </div>
            </div>
          </div>

          {/* Administrative Boundaries & Parking Spaces */}
          <div className="p-4 border-b">
            <h3 className="font-semibold mb-3 text-sm">Administrative Boundaries</h3>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="provinces"
                  checked={showProvinces}
                  onCheckedChange={() => setShowProvinces(!showProvinces)}
                />
                <Label
                  htmlFor="provinces"
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  🗺️ Province Borders
                  <Badge variant="outline" className="ml-auto">
                    12
                  </Badge>
                </Label>
              </div>
              {showProvinces && zoom < 7 && (
                <div className="text-xs text-muted-foreground pl-6">
                  Zoom in to see borders (zoom 7+)
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="municipalities"
                  checked={showMunicipalities}
                  onCheckedChange={() => setShowMunicipalities(!showMunicipalities)}
                />
                <Label
                  htmlFor="municipalities"
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  🏘️ Municipal Borders
                  <Badge variant="outline" className="ml-auto">
                    ~350
                  </Badge>
                </Label>
              </div>
              {showMunicipalities && zoom < 10 && (
                <div className="text-xs text-muted-foreground pl-6">
                  Zoom in to see borders (zoom 10+)
                </div>
              )}

              {/* Parking Spaces - 3 Sublayers */}
              <div className="font-semibold text-sm mb-2 mt-2 flex items-center justify-between">
                <span>🅿️ Parking Spaces</span>
                <Badge
                  variant={zoom >= 13 ? "default" : "secondary"}
                  className="text-xs"
                >
                  Zoom: {zoom}
                </Badge>
              </div>

              {/* OSM Truck Parking Spaces */}
              <div className="flex items-center space-x-2 pl-4">
                <Checkbox
                  id="osmTruckSpaces"
                  checked={showOsmTruckSpaces}
                  onCheckedChange={() => setShowOsmTruckSpaces(!showOsmTruckSpaces)}
                />
                <Label
                  htmlFor="osmTruckSpaces"
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  🚛 Truck Parking Spaces
                  <Badge variant="outline" className="ml-auto bg-red-100 text-red-800">
                    {osmParkingSpaces?.features?.filter((f: any) => f.properties.vehicle_type === 'truck').length || 0}
                  </Badge>
                </Label>
              </div>

              {/* OSM Van/Car Parking Spaces */}
              <div className="flex items-center space-x-2 pl-4 mt-1">
                <Checkbox
                  id="osmVanSpaces"
                  checked={showOsmVanSpaces}
                  onCheckedChange={() => setShowOsmVanSpaces(!showOsmVanSpaces)}
                />
                <Label
                  htmlFor="osmVanSpaces"
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  🚐 Car/Van Parking Spaces
                  <Badge variant="outline" className="ml-auto bg-blue-100 text-blue-800">
                    {osmParkingSpaces?.features?.filter((f: any) => f.properties.vehicle_type === 'car').length || 0}
                  </Badge>
                </Label>
              </div>

              {/* South Holland OSM Parking Areas */}
              <div className="flex items-center space-x-2 pl-4 mt-1">
                <Checkbox
                  id="estimatedSpaces"
                  checked={showEstimatedSpaces}
                  onCheckedChange={() => setShowEstimatedSpaces(!showEstimatedSpaces)}
                />
                <Label
                  htmlFor="estimatedSpaces"
                  className="flex items-center gap-2 cursor-pointer text-sm"
                >
                  📍 OSM Parking Areas (South Holland)
                  <Badge variant="outline" className="ml-auto bg-blue-100 text-blue-800">
                    {estimatedParkingSpaces?.features?.filter((f: any) => f.properties.feature_type === 'parking_area').length || 0}
                  </Badge>
                </Label>
              </div>
            </div>
          </div>

          {/* NDW Real-Time Data - Compact */}
          <div className="p-3 border-b bg-blue-50/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">📡 NDW Live</h3>
              <button
                onClick={fetchNdwData}
                disabled={isRefreshingNdw}
                className="p-1 hover:bg-blue-100 rounded disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshingNdw ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="ndw_layer"
                  checked={showNdwLayer}
                  onCheckedChange={() => setShowNdwLayer(!showNdwLayer)}
                />
                <Label
                  htmlFor="ndw_layer"
                  className="flex items-center gap-2 cursor-pointer text-xs"
                >
                  Real-Time Occupancy
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {filteredNdwData?.length || 0}
                  </Badge>
                </Label>
              </div>
              {ndwLastUpdated && (
                <div className="text-[10px] text-muted-foreground pl-6">
                  {new Date(ndwLastUpdated).toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

          {/* Zenodo Data - Compact */}
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">🗺️ Zenodo EU</h3>
              <button
                onClick={fetchZenodoData}
                disabled={isRefreshingZenodo}
                className="p-1 hover:bg-gray-100 rounded disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`h-3 w-3 ${isRefreshingZenodo ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="zenodo_layer"
                  checked={showZenodoLayer}
                  onCheckedChange={() => setShowZenodoLayer(!showZenodoLayer)}
                />
                <Label
                  htmlFor="zenodo_layer"
                  className="flex items-center gap-2 cursor-pointer text-xs"
                >
                  19k+ Facilities
                  <Badge variant="secondary" className="ml-auto text-xs">
                    {filteredZenodoData?.length || 0}
                  </Badge>
                </Label>
              </div>
              {zenodoLastUpdated && (
                <div className="text-[10px] text-muted-foreground pl-6">
                  {new Date(zenodoLastUpdated).toLocaleTimeString()}
                </div>
              )}
              {!zenodoData && showZenodoLayer && (
                <div className="text-[10px] text-amber-600 pl-6">
                  Click refresh to load
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Toggle button when left panel is closed */}
      {!leftPanelOpen && (
        <button
          onClick={() => setLeftPanelOpen(true)}
          className="absolute left-4 top-4 z-[1000] bg-background border rounded-lg p-3 shadow-lg hover:bg-gray-50"
        >
          <MapPin className="h-5 w-5" />
        </button>
      )}

      {/* Main Map Area */}
      <div className="flex-1 flex flex-col">
        {/* Location Search Bar */}
        <div className="bg-background border-b p-3 z-[1000] relative">
          <div className="max-w-2xl mx-auto relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search by municipality or province..."
                  value={locationSearch}
                  onChange={(e) => {
                    setLocationSearch(e.target.value);
                    setShowLocationDropdown(true);
                  }}
                  onFocus={() => setShowLocationDropdown(true)}
                  className="pl-10 pr-10 text-base"
                />
                {locationSearch && (
                  <button
                    onClick={() => {
                      setLocationSearch("");
                      setSelectedLocation(null);
                      setShowLocationDropdown(false);
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* About Button */}
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline" size="icon" className="flex-shrink-0">
                    <Info className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-2xl">
                      <Truck className="h-6 w-6" />
                      About This Application
                    </DialogTitle>
                    <DialogDescription>
                      Comprehensive truck parking facility data for the Netherlands and Europe
                    </DialogDescription>
                  </DialogHeader>

                  {/* Experimental Notice */}
                  <div className="bg-amber-50 border border-amber-300 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                      <div className="text-amber-600 text-xl">⚠️</div>
                      <div>
                        <h4 className="font-semibold text-amber-800 mb-1">Experiment / Proof of Concept</h4>
                        <p className="text-sm text-amber-700">
                          This application was built in a few hours as an experimental prototype. It is not production-ready
                          and should be treated as a demonstration only. Data may be incomplete or inaccurate.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 text-sm">
                    {/* Overview Section */}
                    <section>
                      <h3 className="font-semibold text-lg mb-2">Overview</h3>
                      <p className="text-muted-foreground leading-relaxed">
                        This interactive web application visualizes truck parking facilities (verzorgingsplaatsen)
                        across the Netherlands and Europe. It combines multiple data sources to provide comprehensive
                        information about rest areas, service areas, and dedicated truck parking locations along
                        motorways and major roads.
                      </p>
                    </section>

                    {/* Datasets Section */}
                    <section>
                      <h3 className="font-semibold text-lg mb-3">Data Sources</h3>

                      {/* Dataset 1: OSM-based Dutch data */}
                      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                        <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-blue-600" />
                          Primary Dataset: OpenStreetMap Netherlands
                        </h4>
                        <div className="space-y-2 text-muted-foreground">
                          <p>
                            <strong>Source:</strong> OpenStreetMap (OSM) - Community-maintained geographic database
                          </p>
                          <p>
                            <strong>Coverage:</strong> ~1,425 facilities across the Netherlands
                          </p>
                          <p>
                            <strong>Types:</strong> Truck parking, service areas, and rest areas
                          </p>
                          <p>
                            <strong>Data Quality:</strong> 44% high confidence facilities • Only 6.1% have capacity data
                          </p>
                          <p>
                            <strong>Features:</strong> Includes location data (province, municipality, highway),
                            facility classifications, amenities (fuel, restaurants, toilets), operator information,
                            and parking capacities where available.
                          </p>
                          <div className="mt-2 pt-2 border-t border-blue-300">
                            <p className="text-xs">
                              <strong>File:</strong> truck_parking_enriched.json (2.6MB) •
                              <strong> Updated:</strong> Regularly refreshed from OSM
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Dataset 2: NDW Real-time */}
                      <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                        <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-green-600" />
                          NDW Real-Time Occupancy Data
                        </h4>
                        <div className="space-y-2 text-muted-foreground">
                          <p>
                            <strong>Source:</strong> Nationale Databank Wegverkeersgegevens (NDW) - Dutch National Traffic Data Bank
                          </p>
                          <p>
                            <strong>Coverage:</strong> {filteredNdwData?.length || 0} facilities with live occupancy data
                          </p>
                          <p>
                            <strong>Update Frequency:</strong> Real-time updates every minute
                          </p>
                          <p>
                            <strong>Features:</strong> Live parking space availability, occupancy percentages,
                            vacant/occupied space counts, facility capacities (total, lorry, refrigerated, heavy haul),
                            detailed operator information, security certifications, and pricing data.
                          </p>
                          <div className="mt-2 pt-2 border-t border-green-300">
                            <p className="text-xs">
                              <strong>API:</strong> NDW Open Data Platform •
                              <strong> Status Indicators:</strong> Green (&lt;50% full), Orange (50-75%), Red (&gt;75% or full)
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Dataset 3: Zenodo Europe-wide */}
                      <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                        <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-purple-600" />
                          Zenodo Europe-Wide Dataset
                        </h4>
                        <div className="space-y-2 text-muted-foreground">
                          <p>
                            <strong>Source:</strong> Fraunhofer Institute for Systems and Innovation Research (ISI)
                          </p>
                          <p>
                            <strong>Coverage:</strong> 19,713 truck parking facilities across Europe
                          </p>
                          <p>
                            <strong>Geographic Scope:</strong> EU-27, EFTA countries, and United Kingdom
                          </p>
                          <p>
                            <strong>Features:</strong> Includes facility locations, areas (when available),
                            categorization, and country-level distribution data.
                          </p>
                          <div className="mt-2 pt-2 border-t border-purple-300">
                            <p className="text-xs">
                              <strong>Dataset Size:</strong> ~1.6 MB •
                              <strong> DOI:</strong> 10.5281/zenodo.10231359 •
                              <strong> Note:</strong> Loaded on-demand to optimize performance
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Additional Layer: Parking Spaces */}
                      <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                        <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full bg-orange-600" />
                          Individual Parking Spaces - 3-Layer System
                        </h4>
                        <div className="space-y-3 text-muted-foreground">
                          <p>
                            <strong>Total Coverage:</strong> {(osmParkingSpaces?.features?.length || 0) + (estimatedParkingSpaces?.features?.length || 0)} individual parking spaces across South Holland
                          </p>

                          {/* Layer 1: OSM Truck Spaces */}
                          <div className="pl-3 border-l-2 border-red-400">
                            <p className="text-sm mb-1">
                              <strong className="text-red-700">🚛 Layer 1: OSM Truck Spaces (Red)</strong>
                            </p>
                            <p className="text-xs">
                              Individual truck parking spaces (N2/N3) extracted from OpenStreetMap. Size-based classification:
                              spaces ≥30m² with truck designation tags. Includes HGV and LZV (25.25m) spaces.
                            </p>
                          </div>

                          {/* Layer 2: OSM Van/Car Spaces */}
                          <div className="pl-3 border-l-2 border-blue-400">
                            <p className="text-sm mb-1">
                              <strong className="text-blue-700">🚐 Layer 2: OSM Van/Car Spaces (Blue)</strong>
                            </p>
                            <p className="text-xs">
                              Individual car/van parking spaces (N1) extracted from OpenStreetMap. Size-based classification:
                              spaces &lt;30m² automatically classified as N1, preventing misclassification of small spaces.
                            </p>
                          </div>

                          {/* Layer 3: Estimated Spaces */}
                          <div className="pl-3 border-l-2 border-purple-400">
                            <p className="text-sm mb-1">
                              <strong className="text-purple-700">📐 Layer 3: Estimated Spaces (Purple)</strong>
                            </p>
                            <p className="text-xs mb-2">
                              For parking areas without individual space mapping: algorithmically generated parking spaces
                              using capacity data and polygon area. <strong className="text-purple-900">NEW: Satellite-based rotation detection!</strong>
                            </p>
                            <div className="bg-purple-100 p-2 rounded text-xs space-y-1">
                              <p><strong>🛰️ Satellite Analysis Pipeline:</strong></p>
                              <ol className="list-decimal list-inside space-y-1 ml-2">
                                <li>Fetch PDOK 2023 high-resolution aerial imagery for each parking area</li>
                                <li>Apply computer vision: edge detection + Hough Line Transform</li>
                                <li>Detect dominant parking space orientation angle (0-180°)</li>
                                <li>Apply rotation to estimated grid to match real-world layout</li>
                                <li>Result: Purple boxes align with actual parking space angles on satellite imagery</li>
                              </ol>
                            </div>
                          </div>

                          <p className="text-xs pt-2">
                            <strong>Size-Based Classification:</strong> N1 (car/van): 2.5m×5.0m = 12.5m² •
                            N2/N3 (truck): 4.0m×15.0m = 60m² • Threshold: 30m²
                          </p>

                          <p className="text-xs">
                            <strong>Visibility:</strong> All parking space layers only displayed at zoom level 13+ for performance optimization
                          </p>

                          <div className="mt-2 pt-2 border-t border-orange-300">
                            <p className="text-xs">
                              <strong>Technologies:</strong> OpenCV (edge detection) • Hough Line Transform (orientation) •
                              Shapely (geometry rotation) • PDOK WMS (satellite imagery)
                            </p>
                          </div>
                        </div>
                      </div>
                    </section>

                    {/* Context Section */}
                    <section>
                      <h3 className="font-semibold text-lg mb-2">Context & Background</h3>
                      <div className="space-y-2 text-muted-foreground">
                        <p>
                          <strong>Dutch Motorway Rest Areas:</strong> Follow a three-tier public-private model where
                          land is owned by Rijksstaat (Dutch National Government), infrastructure is managed by
                          Rijkswaterstaat (RWS), property is managed by Rijksvastgoedbedrijf, and operations
                          are handled by private concessionaires (Shell, BP, Total, Esso) via 15-year leases.
                        </p>
                        <p>
                          <strong>Parking Shortage:</strong> The Netherlands faces a national shortage of
                          approximately 4,400 truck parking spaces, making real-time occupancy data crucial
                          for logistics planning.
                        </p>
                        <p>
                          <strong>LZV Compliance:</strong> Some facilities accommodate LZV (Longer and Heavier Vehicles)
                          up to 25.25m in length.
                        </p>
                      </div>
                    </section>

                    {/* Technical Details */}
                    <section>
                      <h3 className="font-semibold text-lg mb-2">Technical Architecture</h3>
                      <div className="space-y-2 text-muted-foreground">
                        <p>
                          <strong>Framework:</strong> Next.js 16 with App Router • React 19.2.0
                        </p>
                        <p>
                          <strong>Mapping:</strong> Leaflet 1.9.4 + react-leaflet 5.0
                        </p>
                        <p>
                          <strong>Styling:</strong> Tailwind CSS 3.4 + shadcn/ui components
                        </p>
                        <p>
                          <strong>Map Layers:</strong> Multiple base layers including OpenStreetMap, Satellite imagery,
                          PDOK Aerial (25cm and HR), Topographic, Dark, and Light themes
                        </p>
                        <p>
                          <strong>Performance Optimizations:</strong> Viewport-based loading, marker clustering,
                          lazy loading of administrative boundaries, debounced searches
                        </p>
                      </div>
                    </section>

                    {/* Statistics */}
                    <section>
                      <h3 className="font-semibold text-lg mb-2">Statistics</h3>
                      <div className="grid grid-cols-3 gap-3">
                        <Card className="p-3 bg-red-50 border-red-200">
                          <div className="text-xl font-bold text-red-900">{stats.truck_parking}</div>
                          <div className="text-xs text-red-700">Truck Parking</div>
                        </Card>
                        <Card className="p-3 bg-blue-50 border-blue-200">
                          <div className="text-xl font-bold text-blue-900">{stats.service_area}</div>
                          <div className="text-xs text-blue-700">Service Areas</div>
                        </Card>
                        <Card className="p-3 bg-green-50 border-green-200">
                          <div className="text-xl font-bold text-green-900">{stats.rest_area}</div>
                          <div className="text-xs text-green-700">Rest Areas</div>
                        </Card>
                      </div>
                    </section>

                    {/* Footer */}
                    <section className="pt-4 border-t space-y-2">
                      <p className="text-xs text-muted-foreground">
                        This application is designed to support logistics planning, fleet management,
                        and transportation research by providing comprehensive, real-time truck parking information.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <strong>License:</strong> MIT License • Open source and free to use, modify, and distribute.
                      </p>
                    </section>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {/* Dropdown with location options */}
            {showLocationDropdown && locationSearch && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-background border rounded-lg shadow-lg max-h-96 overflow-y-auto z-50">
                {filteredLocationOptions.provinces.length > 0 && (
                  <div>
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-gray-50 sticky top-0">
                      Provinces
                    </div>
                    {filteredLocationOptions.provinces.map((province) => (
                      <button
                        key={`province-${province}`}
                        onClick={() => handleLocationSelect('province', province)}
                        className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-2 text-sm"
                      >
                        <MapPin className="h-4 w-4 text-blue-600" />
                        <span>{province}</span>
                        <Badge variant="secondary" className="ml-auto">
                          Province
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
                {filteredLocationOptions.municipalities.length > 0 && (
                  <div>
                    <div className="px-3 py-2 text-xs font-semibold text-muted-foreground bg-gray-50 sticky top-0">
                      Municipalities
                    </div>
                    {filteredLocationOptions.municipalities.map((municipality) => (
                      <button
                        key={`municipality-${municipality}`}
                        onClick={() => handleLocationSelect('municipality', municipality)}
                        className="w-full text-left px-4 py-2 hover:bg-blue-50 flex items-center gap-2 text-sm"
                      >
                        <MapPin className="h-4 w-4 text-green-600" />
                        <span>{municipality}</span>
                        <Badge variant="secondary" className="ml-auto">
                          Municipality
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
                {filteredLocationOptions.provinces.length === 0 &&
                  filteredLocationOptions.municipalities.length === 0 && (
                    <div className="px-4 py-3 text-sm text-muted-foreground text-center">
                      No locations found
                    </div>
                  )}
              </div>
            )}

            {/* Selected location stats */}
            {selectedLocation?.stats && (
              <div className="mt-3 grid grid-cols-5 gap-2">
                <Card className="p-3 bg-blue-50 border-blue-200">
                  <div className="text-2xl font-bold text-blue-900">
                    {selectedLocation.stats.total}
                  </div>
                  <div className="text-xs text-blue-700 mt-1">Total Facilities</div>
                </Card>
                <Card className="p-3 bg-red-50 border-red-200">
                  <div className="text-2xl font-bold text-red-900">
                    {selectedLocation.stats.truck_parking}
                  </div>
                  <div className="text-xs text-red-700 mt-1">Truck Parking</div>
                </Card>
                <Card className="p-3 bg-blue-50 border-blue-200">
                  <div className="text-2xl font-bold text-blue-900">
                    {selectedLocation.stats.service_area}
                  </div>
                  <div className="text-xs text-blue-700 mt-1">Service Areas</div>
                </Card>
                <Card className="p-3 bg-green-50 border-green-200">
                  <div className="text-2xl font-bold text-green-900">
                    {selectedLocation.stats.rest_area}
                  </div>
                  <div className="text-xs text-green-700 mt-1">Rest Areas</div>
                </Card>
                <Card className="p-3 bg-orange-50 border-orange-200">
                  <div className="text-2xl font-bold text-orange-900">
                    {selectedLocation.stats.detected_parking_spaces}
                  </div>
                  <div className="text-xs text-orange-700 mt-1">Detected Spaces</div>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {/* Map Style Selector Overlay */}
          <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2 items-end">
            <div className="bg-white border rounded-lg shadow-lg overflow-hidden">
              <select
                value={baseLayer}
                onChange={(e) => setBaseLayer(e.target.value)}
                className="px-3 py-2 text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                {Object.entries(BASE_LAYERS).map(([key, layer]) => (
                  <option key={key} value={key}>
                    {layer.name}
                  </option>
                ))}
              </select>
            </div>
            {isLoadingData && (
              <div className="bg-white border rounded-lg px-4 py-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading facilities...</span>
                </div>
              </div>
            )}
          </div>

          <MapContainer
              center={center}
              zoom={initialZoom}
              className="h-full w-full"
              style={{ background: "#f0f0f0" }}
            >
              <MapEventHandler onZoomChange={setZoom} onViewportChange={setViewport} />
              <FlyToLocation target={flyToTarget} />
              <TileLayer
                key={baseLayer}
                attribution={BASE_LAYERS[baseLayer as keyof typeof BASE_LAYERS].attribution}
                url={BASE_LAYERS[baseLayer as keyof typeof BASE_LAYERS].url}
              />
              {filteredData.length > 0 && (
                <GeoJSON
                  ref={geoJsonLayerRef}
                  key={`facilities-${JSON.stringify(filters)}-${searchTerm}-${filteredData.length}`}
                  data={{
                    type: "FeatureCollection",
                    features: filteredData.map((f) => ({
                      type: "Feature",
                      id: f.id,
                      geometry: f.geometry,
                      properties: f,
                    })),
                  } as any}
                  pointToLayer={(feature, latlng) => {
                    const props = feature.properties as EnrichedFeature;
                    const type = props.facility_type as keyof typeof FACILITY_COLORS;
                    const color = FACILITY_COLORS[type] || "#999";

                    return L.circleMarker(latlng, {
                      radius: getMarkerRadius(zoom),
                      fillColor: color,
                      color: "#fff",
                      weight: 2,
                      opacity: 1,
                      fillOpacity: 0.85,
                    });
                  }}
                  onEachFeature={(feature, layer) => {
                    const props = feature.properties as EnrichedFeature;
                    const tags = props.tags || {};
                    const capacity = props.capacity || tags;

                    // Calculate polygon area
                    let polygonArea = null;
                    if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
                      try {
                        const areaInSquareMeters = area(feature.geometry);
                        polygonArea = Math.round(areaInSquareMeters);
                      } catch (e) {
                        console.error("Error calculating area:", e);
                      }
                    }

                    // Extract parking capacities
                    const hgvCapacity = capacity?.["capacity:hgv"] || capacity?.["capacity:truck"] || null;
                    const vanCapacity = capacity?.["capacity:van"] || null;
                    const carCapacity = capacity?.["capacity:car"] || capacity?.capacity;

                    // Check if capacity is a string like "74 hgv"
                    if (typeof carCapacity === "string" && carCapacity.includes("hgv")) {
                      const match = carCapacity.match(/(\d+)\s*hgv/i);
                      if (match && !hgvCapacity) {
                        const extractedHgv = match[1];
                        // Use this as HGV capacity instead
                      }
                    }

                    // Build amenities list
                    const amenities = [];
                    if (tags.fuel || tags.amenity?.includes("fuel")) amenities.push("⛽");
                    if (tags.restaurant) amenities.push("🍴");
                    if (tags.toilets) amenities.push("🚻");
                    if (tags.wifi) amenities.push("📶");
                    if (capacity?.["capacity:shower"]) amenities.push("🚿");

                    const popupContent = `
                      <div style="min-width: 480px; max-width: 600px; font-family: system-ui, -apple-system, sans-serif;">
                        <!-- Header -->
                        <div style="background: ${
                          FACILITY_COLORS[props.facility_type as keyof typeof FACILITY_COLORS] || "#666"
                        }; color: white; padding: 12px 16px; margin: -12px -12px 12px -12px; border-radius: 8px 8px 0 0;">
                          <h3 style="margin: 0; font-size: 18px; font-weight: 600;">
                            ${props.name !== "Unnamed" ? props.name : "Truck Parking Facility"}
                          </h3>
                          <div style="font-size: 13px; opacity: 0.9; margin-top: 2px;">
                            ${FACILITY_LABELS[props.facility_type as keyof typeof FACILITY_LABELS]}
                            ${amenities.length > 0 ? ` • ${amenities.join(" ")}` : ""}
                          </div>
                        </div>

                        <!-- Main Content Grid -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px;">

                          <!-- Left Column -->
                          <div>
                            ${hgvCapacity || vanCapacity || carCapacity || polygonArea ? `
                            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">🚛 Parking Capacity</div>
                              ${hgvCapacity ? `<div style="margin-bottom: 4px;">HGV/Trucks: <strong>${hgvCapacity}</strong> spaces</div>` : ""}
                              ${vanCapacity ? `<div style="margin-bottom: 4px;">Vans: <strong>${vanCapacity}</strong> spaces</div>` : ""}
                              ${carCapacity && !hgvCapacity ? `<div style="margin-bottom: 4px;">Total: <strong>${carCapacity}</strong> spaces</div>` : ""}
                              ${polygonArea ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0;">📏 Area: <strong>${polygonArea.toLocaleString()} m²</strong></div>` : ""}
                            </div>
                            ` : ""}

                            ${props.location?.highway || props.location?.municipality ? `
                            <div style="margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">📍 Location</div>
                              ${props.location?.highway ? `<div style="margin-bottom: 3px;">${props.location.highway}</div>` : ""}
                              ${props.location?.municipality ? `<div style="margin-bottom: 3px;">${props.location.municipality}${props.location?.province ? `, ${props.location.province}` : ""}</div>` : ""}
                              ${props.location?.postcode ? `<div>${props.location.postcode}</div>` : ""}
                            </div>
                            ` : ""}
                          </div>

                          <!-- Right Column -->
                          <div>
                            ${tags.operator || tags.opening_hours ? `
                            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">👔 Operations</div>
                              ${tags.operator ? `<div style="margin-bottom: 4px;"><strong>Operator:</strong> ${tags.operator}</div>` : ""}
                              ${tags.opening_hours ? `<div><strong>Hours:</strong> ${tags.opening_hours}</div>` : ""}
                            </div>
                            ` : ""}

                            ${capacity?.["capacity:shower"] || capacity?.["capacity:toilets"] || capacity?.["capacity:restaurant"] ? `
                            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">🏢 Facilities</div>
                              ${capacity["capacity:shower"] ? `<div style="margin-bottom: 3px;">🚿 Showers: ${capacity["capacity:shower"]}</div>` : ""}
                              ${capacity["capacity:toilets"] ? `<div style="margin-bottom: 3px;">🚻 Toilets: ${capacity["capacity:toilets"]}</div>` : ""}
                              ${capacity["capacity:restaurant"] ? `<div>🍴 Restaurant: ${capacity["capacity:restaurant"]}</div>` : ""}
                            </div>
                            ` : ""}

                            ${Object.keys(tags).filter(k => !["operator", "opening_hours", "highway", "name", "amenity", "fuel", "restaurant", "toilets", "wifi"].includes(k) && !k.startsWith("capacity")).length > 0 ? `
                            <div style="margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">🏷️ Tags</div>
                              <div style="font-size: 11px; line-height: 1.6;">
                                ${Object.entries(tags)
                                  .filter(([key]) => !["operator", "opening_hours", "highway", "name", "amenity", "fuel", "restaurant", "toilets", "wifi"].includes(key) && !key.startsWith("capacity"))
                                  .slice(0, 5)
                                  .map(([key, value]) => `<div><span style="color: #64748b;">${key}:</span> ${typeof value === "string" ? value : JSON.stringify(value)}</div>`)
                                  .join("")}
                              </div>
                            </div>
                            ` : ""}
                          </div>
                        </div>

                        <!-- Footer Metadata -->
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                          <div>
                            <div>ID: ${props.id.split("_").slice(-1)[0]}</div>
                            <div>OSM: ${props.osm_id} (${props.osm_type})</div>
                            <div>Confidence: ${(props.confidence_score * 100).toFixed(0)}%</div>
                          </div>
                          <div style="text-align: right;">
                            <div>${props.latitude.toFixed(5)}, ${props.longitude.toFixed(5)}</div>
                            <div>${new Date(props.last_updated).toLocaleDateString()}</div>
                            <div style="color: #3b82f6; cursor: pointer;" onclick="window.open('https://www.openstreetmap.org/${props.osm_type}/${props.osm_id}', '_blank')">View on OSM →</div>
                            <div style="color: #10b981; cursor: pointer; margin-top: 2px;" onclick="window.open('https://www.google.com/maps?q=&layer=c&cbll=${props.latitude},${props.longitude}', '_blank')">📍 Street View →</div>
                          </div>
                        </div>
                      </div>
                    `;
                    layer.bindPopup(popupContent, { maxWidth: 600 });

                    layer.on("click", () => {
                      setSelectedFacility(props.id);
                    });
                  }}
                />
              )}

              {/* NDW Real-Time Layer */}
              {showNdwLayer && filteredNdwData && filteredNdwData.length > 0 && (
                <GeoJSON
                  ref={ndwGeoJsonLayerRef}
                  key={`ndw-${ndwLastUpdated}-${filteredNdwData.length}`}
                  data={{
                    type: "FeatureCollection",
                    features: filteredNdwData.map((facility) => ({
                      type: "Feature",
                      id: facility.id,
                      geometry: {
                        type: "Point",
                        coordinates: [facility.location.longitude, facility.location.latitude],
                      },
                      properties: facility,
                    })),
                  } as any}
                  pointToLayer={(feature, latlng) => {
                    const props = feature.properties as NDWEnrichedFacility;
                    const color = getOccupancyColor(props);

                    return L.circleMarker(latlng, {
                      radius: getMarkerRadius(zoom) + 2, // Slightly larger for NDW markers
                      fillColor: color,
                      color: "#fff",
                      weight: 2,
                      opacity: 1,
                      fillOpacity: 0.85,
                    });
                  }}
                  onEachFeature={(feature, layer) => {
                    const facility = feature.properties as NDWEnrichedFacility;
                    const status = facility.liveStatus;

                    // Build facilities list
                    const facilitiesList = facility.facilities?.map(f => {
                      const icons: Record<string, string> = {
                        restaurant: "🍴",
                        shower: "🚿",
                        toilet: "🚻",
                        wifi: "📶",
                        fuel: "⛽",
                        "fresh water": "💧",
                        "waste disposal": "🗑️",
                        "electric charging": "🔌",
                        "truck wash": "🚿",
                      };
                      const icon = Object.keys(icons).find(key => f.toLowerCase().includes(key));
                      return icon ? icons[icon] : null;
                    }).filter(Boolean).join(" ") || "";

                    const popupContent = `
                      <div style="min-width: 480px; max-width: 600px; font-family: system-ui, -apple-system, sans-serif;">
                        <!-- Header with occupancy status -->
                        <div style="background: ${getOccupancyColor(facility)}; color: white; padding: 12px 16px; margin: -12px -12px 12px -12px; border-radius: 8px 8px 0 0;">
                          <h3 style="margin: 0; font-size: 18px; font-weight: 600;">
                            ${facility.name}
                          </h3>
                          <div style="font-size: 13px; opacity: 0.9; margin-top: 2px;">
                            📡 NDW Live Data ${facilitiesList ? `• ${facilitiesList}` : ""}
                          </div>
                        </div>

                        <!-- Real-Time Occupancy -->
                        ${status ? `
                        <div style="background: ${status.status === 'full' ? '#fee2e2' : status.occupancy > 75 ? '#fed7aa' : '#d1fae5'}; padding: 12px; border-radius: 6px; margin-bottom: 16px; border-left: 4px solid ${getOccupancyColor(facility)};">
                          <div style="font-weight: 700; font-size: 16px; margin-bottom: 8px; color: #1f2937;">
                            ${status.status === 'full' ? '🚫 FULL' : status.status === 'spacesAvailable' ? '✅ Spaces Available' : '❓ Status Unknown'}
                          </div>
                          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; font-size: 13px;">
                            <div>
                              <div style="font-size: 24px; font-weight: 700; color: #10b981;">${status.vacantSpaces}</div>
                              <div style="color: #6b7280;">Vacant</div>
                            </div>
                            <div>
                              <div style="font-size: 24px; font-weight: 700; color: #ef4444;">${status.occupiedSpaces}</div>
                              <div style="color: #6b7280;">Occupied</div>
                            </div>
                            <div>
                              <div style="font-size: 24px; font-weight: 700; color: #3b82f6;">${status.occupancy.toFixed(0)}%</div>
                              <div style="color: #6b7280;">Full</div>
                            </div>
                          </div>
                          <div style="margin-top: 8px; font-size: 11px; color: #6b7280;">
                            Last updated: ${new Date(status.timestamp).toLocaleString()}
                          </div>
                        </div>
                        ` : '<div style="background: #f3f4f6; padding: 12px; border-radius: 6px; margin-bottom: 16px; color: #6b7280;">No live status data available</div>'}

                        <!-- Main Content Grid -->
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 13px;">

                          <!-- Left Column -->
                          <div>
                            ${facility.capacity.totalSpaces > 0 ? `
                            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">🚛 Total Capacity</div>
                              <div style="margin-bottom: 4px;">Total: <strong>${facility.capacity.totalSpaces}</strong> spaces</div>
                              ${facility.capacity.lorrySpaces ? `<div style="margin-bottom: 4px;">Lorry: <strong>${facility.capacity.lorrySpaces}</strong></div>` : ""}
                              ${facility.capacity.refrigeratedSpaces ? `<div style="margin-bottom: 4px;">Refrigerated: <strong>${facility.capacity.refrigeratedSpaces}</strong></div>` : ""}
                              ${facility.capacity.heavyHaulSpaces ? `<div>Heavy Haul: <strong>${facility.capacity.heavyHaulSpaces}</strong></div>` : ""}
                            </div>
                            ` : ""}

                            ${facility.address ? `
                            <div style="margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">📍 Address</div>
                              ${facility.address.street ? `<div>${facility.address.street} ${facility.address.houseNumber || ""}</div>` : ""}
                              ${facility.address.postalCode ? `<div>${facility.address.postalCode} ${facility.address.city || ""}</div>` : ""}
                            </div>
                            ` : ""}

                            ${facility.access ? `
                            <div style="margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">🛣️ Access</div>
                              ${facility.access.motorway ? `<div>Motorway: ${facility.access.motorway}</div>` : ""}
                              ${facility.access.junction ? `<div>Junction: ${facility.access.junction}</div>` : ""}
                              ${facility.access.distance ? `<div>Distance: ${facility.access.distance}m</div>` : ""}
                            </div>
                            ` : ""}
                          </div>

                          <!-- Right Column -->
                          <div>
                            ${facility.operator ? `
                            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">👔 Operator</div>
                              ${facility.operator.name ? `<div style="margin-bottom: 4px;"><strong>${facility.operator.name}</strong></div>` : ""}
                              ${facility.operator.email ? `<div style="margin-bottom: 4px; font-size: 11px;">${facility.operator.email}</div>` : ""}
                              ${facility.operator.phone ? `<div style="font-size: 11px;">${facility.operator.phone}</div>` : ""}
                            </div>
                            ` : ""}

                            ${facility.pricing ? `
                            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">💰 Pricing</div>
                              ${facility.pricing.rate ? `<div style="margin-bottom: 4px;">Rate: <strong>${facility.pricing.currency || "€"}${facility.pricing.rate}</strong>/hour</div>` : ""}
                              ${facility.pricing.website ? `<div style="font-size: 11px;"><a href="${facility.pricing.website}" target="_blank" style="color: #3b82f6;">Visit website →</a></div>` : ""}
                            </div>
                            ` : ""}

                            ${facility.security ? `
                            <div style="background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">🔒 Security</div>
                              ${facility.security.certified ? `<div style="margin-bottom: 4px; color: #10b981; font-weight: 600;">✓ Level ${facility.security.certificationLevel || ""} Certified</div>` : ""}
                              <div style="font-size: 11px; line-height: 1.6;">
                                ${facility.security.cctv ? "• CCTV<br>" : ""}
                                ${facility.security.fencing ? "• Fencing<br>" : ""}
                                ${facility.security.lighting ? "• Lighting<br>" : ""}
                                ${facility.security.guards24h ? "• 24h Guards<br>" : ""}
                                ${facility.security.patrols ? "• Security Patrols" : ""}
                              </div>
                            </div>
                            ` : ""}

                            ${facility.facilities && facility.facilities.length > 0 ? `
                            <div style="margin-bottom: 12px;">
                              <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">🏢 Facilities</div>
                              <div style="font-size: 11px; line-height: 1.6;">
                                ${facility.facilities.slice(0, 8).map(f => `• ${f}`).join("<br>")}
                              </div>
                            </div>
                            ` : ""}
                          </div>
                        </div>

                        <!-- Footer -->
                        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: right;">
                          <div>ID: ${facility.id}</div>
                          <div>${facility.location.latitude.toFixed(5)}, ${facility.location.longitude.toFixed(5)}</div>
                          <div style="color: #10b981; cursor: pointer; margin-top: 2px;" onclick="window.open('https://www.google.com/maps?q=${facility.location.latitude},${facility.location.longitude}', '_blank')">📍 Open in Maps →</div>
                        </div>
                      </div>
                    `;
                    layer.bindPopup(popupContent, { maxWidth: 600 });
                  }}
                />
              )}

              {/* Zenodo Layer - Europe-wide dataset */}
              {showZenodoLayer && filteredZenodoData && filteredZenodoData.length > 0 && (
                <GeoJSON
                  ref={zenodoGeoJsonLayerRef}
                  key={`zenodo-${zenodoLastUpdated}-${filteredZenodoData.length}`}
                  data={{
                    type: "FeatureCollection",
                    features: filteredZenodoData.map((facility: any) => ({
                      type: "Feature",
                      id: facility.id,
                      geometry: {
                        type: "Point",
                        coordinates: [facility.location.longitude, facility.location.latitude],
                      },
                      properties: facility,
                    })),
                  } as any}
                  pointToLayer={(feature, latlng) => {
                    return L.circleMarker(latlng, {
                      radius: getMarkerRadius(zoom),
                      fillColor: "#64748b", // Gray for Zenodo data
                      color: "#fff",
                      weight: 1.5,
                      opacity: 1,
                      fillOpacity: 0.6,
                    });
                  }}
                  onEachFeature={(feature, layer) => {
                    const facility = feature.properties as any;

                    const popupContent = `
                      <div style="min-width: 380px; max-width: 550px; font-family: system-ui, -apple-system, sans-serif;">
                        <div style="background: #64748b; color: white; padding: 12px 16px; margin: -12px -12px 12px -12px; border-radius: 8px 8px 0 0;">
                          <h3 style="margin: 0; font-size: 18px; font-weight: 600;">
                            ${facility.name}
                          </h3>
                          <div style="font-size: 13px; opacity: 0.9; margin-top: 2px;">
                            🗺️ ${facility.source} • ${facility.category}
                          </div>
                        </div>

                        <div style="font-size: 13px;">
                          <div style="background: #f8fafc; padding: 10px; border-radius: 6px; margin-bottom: 12px;">
                            <div style="font-weight: 600; margin-bottom: 6px; color: #334155;">📍 Location</div>
                            <div style="margin-bottom: 4px;">Country: <strong>${facility.country}</strong></div>
                            <div>${facility.location.latitude.toFixed(5)}, ${facility.location.longitude.toFixed(5)}</div>
                            ${facility.area ? `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0;">Area: <strong>${Math.round(facility.area).toLocaleString()} m²</strong></div>` : ""}
                          </div>

                          <div style="font-size: 11px; color: #64748b; padding-top: 8px; border-top: 1px solid #e2e8f0;">
                            <div style="margin-bottom: 4px;">ID: ${facility.id}</div>
                            <div style="margin-bottom: 6px;">Source: Fraunhofer ISI Zenodo Dataset</div>
                            <div>DOI: 10.5281/zenodo.10231359</div>
                            <div style="color: #10b981; cursor: pointer; margin-top: 6px;" onclick="window.open('https://www.google.com/maps?q=${facility.location.latitude},${facility.location.longitude}', '_blank')">📍 View on Maps →</div>
                          </div>
                        </div>
                      </div>
                    `;
                    layer.bindPopup(popupContent, { maxWidth: 550 });
                  }}
                />
              )}

              {/* Provincial Boundaries - Only show at zoom 7+ */}
              {showProvinces && provinces && zoom >= 7 && (
                <GeoJSON
                  data={provinces}
                  style={{
                    color: "#4B5563",
                    weight: 2,
                    fillOpacity: 0,
                    opacity: 0.6,
                  }}
                  onEachFeature={(feature, layer) => {
                    if (feature.properties?.name) {
                      layer.bindTooltip(feature.properties.name, {
                        permanent: false,
                        direction: "center",
                        className: "province-tooltip",
                      });
                    }
                  }}
                />
              )}

              {/* Municipal Boundaries - Only show at zoom 10+ */}
              {showMunicipalities && municipalities && zoom >= 10 && (
                <GeoJSON
                  data={municipalities}
                  style={{
                    color: "#9CA3AF",
                    weight: 1.5,
                    fillOpacity: 0,
                    opacity: 0.6,
                  }}
                  onEachFeature={(feature, layer) => {
                    if (feature.properties?.name) {
                      layer.bindTooltip(feature.properties.name, {
                        permanent: false,
                        direction: "center",
                        className: "municipality-tooltip",
                      });
                    }
                  }}
                />
              )}

              {/* Truck Parking Space Polygons */}
              {showOsmTruckSpaces && osmParkingSpaces && (() => {
                const truckFeatures = osmParkingSpaces.features.filter(
                  (f: any) => f.properties.vehicle_type === 'truck'
                );
                console.log('🚛 Rendering truck parking spaces:', {
                  total: truckFeatures.length,
                  sampleCoords: truckFeatures[0]?.geometry?.coordinates?.[0]?.[0],
                  sampleProps: truckFeatures[0]?.properties
                });
                return (
                  <GeoJSON
                    key="truck-parking-spaces"
                    data={{
                      type: 'FeatureCollection',
                      features: truckFeatures
                    } as any}
                    pane="overlayPane"
                  style={{
                    color: '#ef4444',
                    weight: 3,
                    fillColor: '#ef4444',
                    fillOpacity: 0.5,
                    opacity: 1,
                  }}
                  onEachFeature={(feature, layer) => {
                    const props = feature.properties;
                    const tooltipContent = `
                      <div style="font-size: 12px;">
                        <strong>🚛 Truck Parking Space</strong><br/>
                        ${props.parking_area_name || props.facility_name || 'Unknown Area'}<br/>
                        <em style="color: #666;">Dimensions: ${props.width_m}m × ${props.length_m}m</em><br/>
                        ${props.rotation_angle ? `Rotation: ${props.rotation_angle}°<br/>` : ''}
                        ${props.estimated ? '<em style="color: #999;">Estimated from satellite</em>' : ''}
                      </div>
                    `;
                    layer.bindTooltip(tooltipContent, {
                      permanent: false,
                      direction: "top",
                    });
                  }}
                />
                );
              })()}

              {/* Car/Van Parking Space Polygons */}
              {showOsmVanSpaces && osmParkingSpaces && (
                <GeoJSON
                  key="car-van-parking-spaces"
                  data={{
                    type: 'FeatureCollection',
                    features: osmParkingSpaces.features.filter(
                      (f: any) => f.properties.vehicle_type === 'car'
                    )
                  } as any}
                  style={{
                    color: '#3b82f6',
                    weight: 1,
                    fillColor: '#3b82f6',
                    fillOpacity: 0.25,
                    opacity: 0.7,
                  }}
                  onEachFeature={(feature, layer) => {
                    const props = feature.properties;
                    const tooltipContent = `
                      <div style="font-size: 12px;">
                        <strong>🚐 Car/Van Parking Space</strong><br/>
                        ${props.parking_area_name || props.facility_name || 'Unknown Area'}<br/>
                        <em style="color: #666;">Dimensions: ${props.width_m}m × ${props.length_m}m</em><br/>
                        ${props.rotation_angle ? `Rotation: ${props.rotation_angle}°<br/>` : ''}
                        ${props.estimated ? '<em style="color: #999;">Estimated from satellite</em>' : ''}
                      </div>
                    `;
                    layer.bindTooltip(tooltipContent, {
                      permanent: false,
                      direction: "top",
                    });
                  }}
                />
              )}

              {/* OSM Parking Area Boundaries */}
              {showEstimatedSpaces && estimatedParkingSpaces && (
                <GeoJSON
                  key="osm-parking-areas"
                  data={{
                    type: 'FeatureCollection',
                    features: estimatedParkingSpaces.features.filter(
                      (f: any) => f.properties.feature_type === 'parking_area'
                    )
                  } as any}
                  style={(feature) => {
                    // Blue boundaries for parking areas
                    return {
                      color: '#3b82f6',
                      weight: 2,
                      fillColor: '#3b82f6',
                      fillOpacity: 0.1,
                      opacity: 0.8,
                    };
                  }}
                  onEachFeature={(feature, layer) => {
                    const props = feature.properties;
                    const tooltipContent = `
                      <div style="font-size: 12px;">
                        <strong>${props.name || props.facility_name || 'Parking Area'}</strong><br/>
                        ${props.operator && props.operator !== 'N/A' ? `Operator: ${props.operator}<br/>` : ''}
                        ${props.capacity && props.capacity !== 'N/A' ? `Capacity: ${props.capacity}<br/>` : ''}
                        ${props.capacity_hgv && props.capacity_hgv !== 'N/A' ? `HGV Capacity: ${props.capacity_hgv}<br/>` : ''}
                        ${props.parking_type && props.parking_type !== 'N/A' ? `Type: ${props.parking_type}<br/>` : ''}
                        ${props.fee && props.fee !== 'N/A' ? `Fee: ${props.fee}<br/>` : ''}
                        <em style="color: #3b82f6;">📍 OSM Parking Area</em>
                      </div>
                    `;
                    layer.bindTooltip(tooltipContent, {
                      permanent: false,
                      direction: "top",
                    });
                  }}
                />
              )}
            </MapContainer>
        </div>
      </div>

      {/* Side Panel */}
      {sidePanelOpen && (
        <div className="w-96 border-l bg-background overflow-hidden flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <h2 className="font-bold">All Facilities ({filteredData.length})</h2>
            </div>
            <button
              onClick={() => setSidePanelOpen(false)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Search */}
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by name, location..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Facilities List */}
          <div className="flex-1 overflow-y-auto">
            {filteredData.map((facility) => (
              <div
                key={facility.id}
                className={`p-3 border-b cursor-pointer transition-colors ${
                  hoveredFacility === facility.id
                    ? "bg-blue-50"
                    : selectedFacility === facility.id
                    ? "bg-blue-100"
                    : "hover:bg-gray-50"
                }`}
                onMouseEnter={() => setHoveredFacility(facility.id)}
                onMouseLeave={() => setHoveredFacility(null)}
                onClick={() => handleFacilityClick(facility.id)}
              >
                <div className="flex items-start gap-2">
                  <div
                    className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
                    style={{
                      backgroundColor:
                        FACILITY_COLORS[facility.facility_type as keyof typeof FACILITY_COLORS] ||
                        "#999",
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                      {facility.name !== "Unnamed" ? facility.name : `Facility #${facility.osm_id}`}
                    </h3>
                    {hoveredFacility === facility.id ? (
                      <div className="mt-2">
                        {renderFacilityDetails(facility)}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground mt-1">
                        <p>{FACILITY_LABELS[facility.facility_type as keyof typeof FACILITY_LABELS]}</p>
                        {facility.location?.municipality && (
                          <p>{facility.location.municipality}, {facility.location.province}</p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Toggle button when panel is closed */}
      {!sidePanelOpen && (
        <button
          onClick={() => setSidePanelOpen(true)}
          className="absolute right-4 top-20 z-[1000] bg-background border rounded-lg p-3 shadow-lg hover:bg-gray-50"
        >
          <MapPin className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
