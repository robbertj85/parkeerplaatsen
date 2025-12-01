// NDW (Nationaal Dataportaal Wegverkeer) Data Types

export interface NDWParkingFacility {
  id: string;
  version: number;
  name: string;
  location: {
    latitude: number;
    longitude: number;
  };
  address?: {
    street?: string;
    houseNumber?: string;
    postalCode?: string;
    city?: string;
  };
  capacity: {
    totalSpaces: number;
    lorrySpaces?: number;
    refrigeratedSpaces?: number;
    heavyHaulSpaces?: number;
  };
  operator?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  pricing?: {
    rate?: number;
    currency?: string;
    website?: string;
  };
  facilities?: string[];
  security?: {
    cctv?: boolean;
    fencing?: boolean;
    lighting?: boolean;
    guards24h?: boolean;
    patrols?: boolean;
    certified?: boolean;
    certificationLevel?: number;
  };
  access?: {
    motorway?: string;
    junction?: string;
    distance?: number;
    barrierType?: string;
  };
}

export interface NDWParkingStatus {
  id: string;
  vacantSpaces: number;
  occupiedSpaces: number;
  occupancy: number;
  status: 'spacesAvailable' | 'full' | 'unknown';
  timestamp: string;
  groupedStatus?: {
    index: number;
    vacantSpaces: number;
    occupiedSpaces: number;
    occupancy: number;
  }[];
}

export interface NDWEnrichedFacility extends NDWParkingFacility {
  liveStatus?: NDWParkingStatus;
}

export interface NDWDataResponse {
  facilities: NDWEnrichedFacility[];
  lastUpdated: string;
  tableVersion: number;
  totalFacilities: number;
}
