const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface Planet {
  id: string;
  x: number;
  y: number;
  name: string;
  ownerId: string;
  ownerName: string;
  units?: Record<string, number>;
  resources?: { carbon: number; titanium: number; food: number; credits: number };
  production?: { carbon: number; titanium: number; food: number };
  gridSize?: number; // Legacy, use gridSizeX/gridSizeY
  gridSizeX?: number;
  gridSizeY?: number;
  defenseTurretsJson?: string | null;
  buildings?: { id: string; type: string; level: number; x: number; y: number; status: string }[];
  construction?: { isBuilding: boolean; activeBuildId: string | null; buildFinishTime: string | null };
  recruitmentQueue?: any[];
  manufacturingQueue?: any[];
  turretConstructionQueue?: any[];
  tools?: { toolType: string; count: number }[];
  defense?: { canopy: number; minefield: number; hub: number };
  taxRate?: number;
  isNpc?: boolean;
  npcLevel?: number;
  createdAt: string;
  stats?: {
    carbonRate: number;
    titaniumRate: number;
    foodRate: number;
    foodConsumption: number;
    netFoodRate: number;
    creditRate: number;
    population: number;
    publicOrder: number;
    productivity: number;
  };
}

export interface WorldPlanetsResponse {
  planets: Planet[];
  count: number;
}

export interface Fleet {
  id: string;
  type: 'attack' | 'support' | 'scout';
  fromPlanet: { id: string; x: number; y: number; name: string };
  toPlanet: { id: string; x: number; y: number; name: string };
  units: Record<string, number>;
  departAt: string;
  arriveAt: string;
  status: string;
  distance?: number;
  travelTimeSeconds?: number;
}

export interface FleetsResponse {
  fleets: Fleet[];
}

let authToken: string | null = null;

export const setAuthToken = (token: string) => {
  authToken = token;
  localStorage.setItem('authToken', token);
};

export const getAuthToken = () => {
  if (!authToken) {
    authToken = localStorage.getItem('authToken') || '';
  }
  return authToken;
};

const getHeaders = (includeAuth = false) => {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (includeAuth && authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }
  return headers;
};

// Basic JWT decode (payload only)
export const getCurrentUser = (): { userId: string; username: string } | null => {
  if (!authToken) return null;
  try {
    const payload = authToken.split('.')[1];
    if (!payload) return null;
    const json = atob(payload);
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
};

export const api = {
  async getPlanets(): Promise<WorldPlanetsResponse> {
    const response = await fetch(`${API_BASE_URL}/world/planets`, {
      headers: getHeaders(true)
    });
    if (!response.ok) {
      throw new Error('Failed to fetch planets');
    }
    return response.json();
  },

  async getReports(): Promise<{ reports: any[] }> {
    const response = await fetch(`${API_BASE_URL}/reports/battles`, {
      method: 'GET',
      headers: getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to fetch reports');
    return response.json();
  },

  async getReport(id: string): Promise<any> {
    const response = await fetch(`${API_BASE_URL}/reports/battles/${id}`, {
      method: 'GET',
      headers: getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to fetch report');
    return response.json();
  },

  async getPlanet(id: string): Promise<Planet> {
    const response = await fetch(`${API_BASE_URL}/world/planet/${id}`, {
      headers: getHeaders(true)
    });
    if (!response.ok) {
      throw new Error('Failed to fetch planet');
    }
    return response.json();
  },

  async register(username: string, email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ username, email, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Registration failed');
    }
    const data = await response.json();
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  async login(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }
    const data = await response.json();
    if (data.token) {
      setAuthToken(data.token);
    }
    return data;
  },

  async createFleet(
    fromPlanetId: string,
    toPlanetId: string,
    type: 'attack' | 'support' | 'scout',
    units: Record<string, number>,
    laneAssignments?: any,
    admiralId?: string
  ): Promise<{ message: string; fleet: Fleet }> {
    const response = await fetch(`${API_BASE_URL}/actions/fleet`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ fromPlanetId, toPlanetId, type, units, laneAssignments, admiralId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create fleet');
    }
    return response.json();
  },

  async spawnPlanet(quadrant?: 'NW' | 'NE' | 'SW' | 'SE') {
    const response = await fetch(`${API_BASE_URL}/actions/spawn`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ quadrant }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Spawn failed');
    }
    return response.json();
  },

  async build(planetId: string, buildingType: string, x: number, y: number) {
    const response = await fetch(`${API_BASE_URL}/actions/build`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId, buildingType, x, y }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Construction failed');
    }
    return response.json();
  },

  async recruit(planetId: string, unitType: string, count: number) {
    const response = await fetch(`${API_BASE_URL}/actions/recruit`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId, unitType, count }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Recruitment failed');
    }
    return response.json();
  },

  async manufacture(planetId: string, toolType: string, count: number) {
    const response = await fetch(`${API_BASE_URL}/actions/manufacture`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId, toolType, count }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Production failed');
    }
    return response.json();
  },

  async getFleets(): Promise<FleetsResponse> {
    const response = await fetch(`${API_BASE_URL}/actions/fleets`, {
      headers: getHeaders(true),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch fleets');
    }
    return response.json();
  },

  async getDefenseProfile(planetId: string) {
    const response = await fetch(`${API_BASE_URL}/defense/planets/${planetId}/defense-profile`, {
      headers: getHeaders(true),
    });
    if (!response.ok) throw new Error('Failed to fetch defense profile');
    return response.json();
  },

  async updateDefenseLayout(planetId: string, layout: { front: any, left: any, right: any }) {
    const response = await fetch(`${API_BASE_URL}/defense/planets/${planetId}/defense-layout`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify(layout),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to update defense layout');
    }
    return response.json();
  },

  async moveBuilding(planetId: string, buildingId: string, x: number, y: number) {
    const response = await fetch(`${API_BASE_URL}/actions/move`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId, buildingId, x, y }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to move building');
    }
    return response.json();
  },

  async updateTaxRate(planetId: string, taxRate: number) {
    const response = await fetch(`${API_BASE_URL}/actions/tax`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId, taxRate }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || 'Failed to update tax rate');
    }
    return response.json();
  },

  async getMe() {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      method: 'GET',
      headers: getHeaders(true),
    });
    if (!response.ok) {
      // Silent fail or throw? Throw allows app to logout.
      throw new Error('Failed to fetch user');
    }
    return response.json();
  },

  async expandPlanet(planetId: string, direction: 'x' | 'y') {
    const response = await fetch(`${API_BASE_URL}/actions/expand`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId, direction }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Expansion failed');
    }
    return response.json();
  },

  async addDefenseTurret(planetId: string, level: number) {
    const response = await fetch(`${API_BASE_URL}/actions/defense-turret`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId, level }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to add defense turret');
    }
    return response.json();
  },

  // Admiral API
  async getAdmiral() {
    const response = await fetch(`${API_BASE_URL}/admiral`, {
      headers: getHeaders(true),
    });
    if (!response.ok) {
      let errorMessage = 'Failed to fetch admiral';
      try {
        const error = await response.json();
        errorMessage = error.error || errorMessage;
      } catch (e) {
        // If response isn't JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }
      throw new Error(errorMessage);
    }
    return response.json();
  },

  async updateAdmiralName(name: string) {
    const response = await fetch(`${API_BASE_URL}/admiral/name`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify({ name }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update admiral name');
    }
    return response.json();
  },

  async updateAdmiralGear(gear: Record<string, any>) {
    const response = await fetch(`${API_BASE_URL}/admiral/gear`, {
      method: 'PUT',
      headers: getHeaders(true),
      body: JSON.stringify({ gear }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to update admiral gear');
    }
    return response.json();
  },

  async getGearInventory() {
    const response = await fetch(`${API_BASE_URL}/admiral/gear/inventory`, {
      headers: getHeaders(true),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch gear inventory');
    }
    return response.json();
  },

  async equipGearPiece(pieceId: string, slotType: string) {
    const response = await fetch(`${API_BASE_URL}/admiral/gear/equip`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ pieceId, slotType }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to equip gear');
    }
    return response.json();
  },

  async unequipGearPiece(slotType: string) {
    const response = await fetch(`${API_BASE_URL}/admiral/gear/unequip`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ slotType }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to unequip gear');
    }
    return response.json();
  },

  async stationAdmiral(planetId: string | null) {
    const response = await fetch(`${API_BASE_URL}/admiral/station`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to station admiral');
    }
    return response.json();
  },

  async demolish(planetId: string, buildingId: string) {
    const response = await fetch(`${API_BASE_URL}/actions/demolish`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId, buildingId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Demolition failed');
    }
    return response.json();
  },

  // Developer Tools
  async devAddResources(planetId: string, amount: number) {
    const response = await fetch(`${API_BASE_URL}/dev/add-resources`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId, amount }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Dev tool failed');
    }
    return response.json();
  },

  async devFastForward(planetId: string) {
    const response = await fetch(`${API_BASE_URL}/dev/fast-forward`, {
      method: 'POST',
      headers: getHeaders(true),
      body: JSON.stringify({ planetId }),
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Dev tool failed');
    }
    return response.json();
  }
};

