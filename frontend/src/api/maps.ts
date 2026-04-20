import { api } from './client';
import type { Map, Hex, Faction, TerrainType, WeatherType } from '../types';

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

export const getMaps = () => api.get<Map[]>('/maps/');
export const getMap = (id: number) => api.get<Map>(`/maps/${id}/`);
export const getHexes = (mapId: number) => api.get<Hex[]>(`/maps/${mapId}/hexes/`);
export const getFactions = (mapId: number) => api.get<Faction[]>(`/maps/${mapId}/factions/`);

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
