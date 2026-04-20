export type TerrainType = 'plains' | 'forest' | 'mountain' | 'swamp' | 'desert' | 'coast';
export type WeatherType = 'fair' | 'unpleasant' | 'inclement' | 'extreme' | 'catastrophic';
export type ActionType =
  | 'supply' | 'travel' | 'trade' | 'merge' | 'battle'
  | 'train' | 'craft' | 'delve' | 'search' | 'explore';
export type POIType = 'dungeon' | 'village' | 'ruin' | 'stash' | 'monster_base';

export interface Map {
  id: number;
  name: string;
  image: string | null;
  hex_size: number;
  origin_x: number;
  origin_y: number;
}

export interface PointOfInterest {
  id: number;
  poi_type: POIType;
  name: string;
  difficulty: number;
  title: string;
  description: string;
  notes: string;
  hidden: boolean;
  player_visible: boolean;
  player_explored: boolean;
}

export interface Hex {
  id: number;
  map_id: number;
  row: number;
  col: number;
  terrain_type: TerrainType;
  terrain_difficulty: number;
  resource_generation: number;
  resources: number;
  weather: WeatherType;
  encounter_likelihood: number;
  player_explored: boolean;
  player_visible: boolean;
  pois: PointOfInterest[];
}

export interface Faction {
  id: number;
  name: string;
  speed: number;
  population: number;
  technology: number;
  resources: number;
  combat_skill: number;
  current_action: ActionType | null;
  last_action: ActionType | null;
  current_hex: number | null;
  destination: number | null;
  is_mobile: boolean;
  is_player_faction: boolean;
  is_gm_faction: boolean;
  is_famine: boolean;
  is_dying: boolean;
  max_speed: number;
}

export interface Party {
  id: number;
  faction: number | null;
  current_hex: number | null;
  destination: number | null;
}

export interface TickRequest {
  map_id: number;
  mode: 'shift' | 'day';
}

export interface TickEvent {
  type: string;
  message: string;
  hex_id?: number;
  faction_id?: number;
}

export interface TickResponse {
  tick_number: number;
  events: TickEvent[];
}

export type PartyActionType = 'move' | 'search' | 'explore' | 'supply';

export interface PartyActionRequest {
  action: PartyActionType;
  hex_id?: number;
  poi_id?: number;
}

export interface PartyActionResponse {
  tick_number: number;
  events: TickEvent[];
  party_tick_id: number;
  encounter_likelihood?: number;
  terrain_type?: TerrainType;
}
