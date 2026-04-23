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
  color: string;
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
  agreeableness: number;
  theology: number;
  technology_max: number;
  next_action: ActionType | null;
  notes: string;
  knowledge: number[];
  leader: number | null;
}

export interface KnowledgeRef {
  id: number;
  title: string;
}

export interface Knowledge {
  id: number;
  title: string;
  description: string;
  do_players_know: boolean;
  age: number;
  related_knowledge: KnowledgeRef[];
}

export interface Character {
  id: number;
  name: string;
  age: number | null;
  faction: number | null;
  is_player: boolean;
  is_leader: boolean;
  is_wanderer: boolean;
  is_dead: boolean;
  can_merge: boolean;
  combat_skill: number;
  speed: number;
  max_speed: number;
  scouting: number;
  resource_generation: number;
  ration_limit: number;
  rations: number;
  famine_streak: number;
  current_hex: number | null;
  destination: number | null;
  notes: string;
  drive: string;
  knowledge: number[];
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
