import { api } from './client';
import type { Map, Hex, Faction, Party, Knowledge, TerrainType, WeatherType, ActionType } from '../types';

export interface PatchHexParams {
  terrain_type?: TerrainType;
  resources?: number;
  weather?: WeatherType;
  encounter_likelihood?: number;
  player_explored?: boolean;
  player_visible?: boolean;
}

export const patchHex = (hexId: number, params: PatchHexParams) =>
  api.patch<Hex>(`/hexes/${hexId}/`, params);

export interface BulkPatchHexParams {
  terrain_type?: TerrainType;
  has_roads?: boolean;
  has_rivers?: boolean;
  player_visible?: boolean;
  player_explored?: boolean;
}

export const bulkPatchHexes = (ids: number[], params: BulkPatchHexParams) =>
  api.post<{ updated: number }>('/hexes/bulk-patch/', { ids, ...params });

export interface CreatePOIParams {
  poi_type: string;
  name?: string;
  difficulty?: number;
  title?: string;
  description?: string;
  notes?: string;
  technology_max_modifier?: number;
  monster_type?: string;
  age?: number;
  player_visible?: boolean;
  player_explored?: boolean;
  hidden?: boolean;
}

export const createPOI = (hexId: number, params: CreatePOIParams) =>
  api.post<import('../types').PointOfInterest>(`/hexes/${hexId}/pois/`, params);

export interface CreateFactionParams {
  name: string;
  color: string;
  speed: number;
  population: number;
  technology: number;
  resources: number;
  combat_skill: number;
  current_hex?: number | null;
  destination?: number | null;
  is_mobile: boolean;
  is_player_faction: boolean;
  is_gm_faction: boolean;
}

export const createFaction = (mapId: number, params: CreateFactionParams) =>
  api.post<import('../types').Faction>(`/maps/${mapId}/factions/`, params);

export interface PatchFactionParams {
  name?: string;
  color?: string;
  speed?: number;
  population?: number;
  technology?: number;
  resources?: number;
  combat_skill?: number;
  current_hex?: number | null;
  destination?: number | null;
  is_mobile?: boolean;
  is_player_faction?: boolean;
  is_gm_faction?: boolean;
  agreeableness?: number;
  theology?: number;
  next_action?: ActionType | null;
  notes?: string;
  knowledge?: number[];
  leader?: string;
  image?: number | null;
  movement_restricted?: boolean;
  allowed_hexes?: number[];
}

export const patchFaction = (factionId: number, params: PatchFactionParams) =>
  api.patch<import('../types').Faction>(`/factions/${factionId}/`, params);

export const patchMapLocked = (mapId: number, locked: boolean) =>
  api.patch<Map>(`/maps/${mapId}/locked/`, { locked });

export const postHighlightHex = (mapId: number, hexId: number | null) =>
  api.post<{ hex_id: number | null }>(`/maps/${mapId}/highlight/`, { hex_id: hexId });

export const getMaps = () => api.get<Map[]>('/maps/');
export const getMap = (id: number) => api.get<Map>(`/maps/${id}/`);
export const getHexes = (mapId: number) => api.get<Hex[]>(`/maps/${mapId}/hexes/`);
export const getFactions = (mapId: number) => api.get<Faction[]>(`/maps/${mapId}/factions/`);

export interface PatchKnowledgeParams {
  title?: string;
  description?: string;
  do_players_know?: boolean;
  age?: number;
  related_knowledge?: number[];
}

export interface CreateKnowledgeParams {
  title: string;
  description?: string;
  do_players_know?: boolean;
  age?: number;
  related_knowledge?: number[];
}

export const getKnowledge = (mapId: number) => api.get<Knowledge[]>(`/maps/${mapId}/knowledge/`);
export const createKnowledge = (mapId: number, params: CreateKnowledgeParams) =>
  api.post<Knowledge>(`/maps/${mapId}/knowledge/`, params);
export const patchKnowledge = (id: number, params: PatchKnowledgeParams) =>
  api.patch<Knowledge>(`/knowledge/${id}/`, params);

export const getParty = (mapId: number) => api.get<Party>(`/maps/${mapId}/party/`);

export const duplicateMap = (mapId: number, name: string) =>
  api.post<Map>(`/maps/${mapId}/duplicate/`, { name });

export interface CreateMapParams {
  name: string;
  hex_size: number;
  origin_x: number;
  origin_y: number;
  image?: File;
  image_path?: string;
}

export function createMap(params: CreateMapParams): Promise<Map> {
  const form = new FormData();
  form.append('name', params.name);
  form.append('hex_size', String(params.hex_size));
  form.append('origin_x', String(params.origin_x));
  form.append('origin_y', String(params.origin_y));
  if (params.image) form.append('image', params.image);
  if (params.image_path) form.append('image_path', params.image_path);
  return api.postForm<Map>('/maps/', form);
}
