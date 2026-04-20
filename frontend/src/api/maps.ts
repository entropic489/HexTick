import { api } from './client';
import type { Map, Hex, Faction } from '../types';

export const getMaps = () => api.get<Map[]>('/maps/');
export const getMap = (id: number) => api.get<Map>(`/maps/${id}/`);
export const getHexes = (mapId: number) => api.get<Hex[]>(`/maps/${mapId}/hexes/`);
export const getFactions = (mapId: number) => api.get<Faction[]>(`/maps/${mapId}/factions/`);
