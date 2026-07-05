export type TerrainType = 'plains' | 'forest' | 'mountain' | 'swamp' | 'desert' | 'coast' | 'ocean' | 'city';
export type WeatherType = 'fair' | 'overcast' | 'inclement' | 'extreme' | 'catastrophic';
export type ActionType =
  | 'supply' | 'travel' | 'rest'
  | 'search' | 'explore' | 'social' | 'delve';
export type POIType = 'dungeon' | 'village' | 'ruin' | 'stash' | 'monster_base' | 'general';

export interface Map {
  id: number;
  name: string;
  image: string | null;
  hex_size: number;
  origin_x: number;
  origin_y: number;
  fog_of_war: boolean;
  map_type: 'regional' | 'city';
  sub_tick: number;
  weather: WeatherType;
  player_actions_locked: boolean;
  reveal_mode: 'grey_fog' | 'two_layer';
  detail_image?: string | null;
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
  encounter_likelihood: number;
  player_explored: boolean;
  player_visible: boolean;
  has_roads: boolean;
  has_rivers: boolean;
  can_enter: boolean;
  linked_map: number | null;
  pois: PointOfInterest[];
}

export interface Faction {
  id: number;
  name: string;
  color: string;
  speed: number;
  max_speed: number;
  population: number;
  current_action: ActionType | null;
  last_action: ActionType | null;
  current_hex: number | null;
  destination: number | null;
  is_mobile: boolean;
  is_dead: boolean;
  next_action: ActionType | null;
  notes: string;
  leader: string;
  image: number | null;
  movement_restricted: boolean;
  allowed_hexes: number[];
}

export interface Party {
  id: number;
  name: string;
  map: number | null;
  player_count: number;
  speed: number;
  max_speed: number;
  resource_generation: number;
  supplies: number;
  tracks_supplies: boolean;
  is_lost: boolean;
  current_hex: number | null;
  destination: number | null;
  current_action: string | null;
  last_action: string | null;
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

export type PartyActionType = 'move' | 'search' | 'explore' | 'supply' | 'delve' | 'social' | 'rest' | 'clear_lost';

export interface PartyActionRequest {
  action: PartyActionType;
  hex_id?: number;
  poi_id?: number;
}

export interface GalleryImage {
  id: number;
  name: string;
  image: string;
  is_published: boolean;
}

export interface PartyActionResponse {
  tick_number: number;
  events: TickEvent[];
  party_tick_id: number;
  encounter_likelihood?: number;
  terrain_type?: TerrainType;
  lost?: boolean;
  lost_roll?: number | null;
  wilderness_event?: string;
  event_roll?: number;
  weather_roll?: number;
  weather_before?: string;
  weather_after?: string;
}
