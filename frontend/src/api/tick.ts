import { api } from './client';
import type { TickRequest, TickResponse, PartyActionRequest, PartyActionResponse, Party } from '../types';

export interface HexTickState {
  hex_id: number;
  terrain_type: string;
  resources: number;
  weather: string;
  encounter_likelihood: number;
  player_explored: boolean;
  player_visible: boolean;
}

export interface FactionTickState {
  faction_id: number;
  is_mobile: boolean;
  speed: number;
  population: number;
  technology: number;
  technology_max: number;
  resources: number;
  agreeableness: number;
  combat_skill: number;
  current_hex: number | null;
  destination: number | null;
  action: string | null;
}

export interface PartyTickState {
  current_hex: number | null;
  destination: number | null;
  action: string | null;
  last_action: string | null;
  notes: string;
}

export interface TickState {
  tick_number: number;
  hex_ticks: HexTickState[];
  faction_ticks: FactionTickState[];
  party_tick: PartyTickState | null;
}

export const getTickNumbers = (mapId: number) =>
  api.get<number[]>(`/maps/${mapId}/ticks/`);

export const getTickState = (mapId: number, tickNumber: number) =>
  api.get<TickState>(`/maps/${mapId}/tick/${tickNumber}/state/`);

export const resetToTick = (mapId: number, tickNumber: number) =>
  api.post<{ tick_number: number }>(`/maps/${mapId}/tick/${tickNumber}/reset/`, {});

export const getCurrentTick = (mapId: number) =>
  api.get<{ tick_number: number }>(`/maps/${mapId}/tick/current/`);

export const postTick = (body: TickRequest) => api.post<TickResponse>('/tick/', body);

export const postPartyAction = (partyId: number, body: PartyActionRequest) =>
  api.post<PartyActionResponse>(`/party/${partyId}/action/`, body);

export const patchPartyTickNotes = (partyId: number, partyTickId: number, notes: string) =>
  api.patch(`/party/${partyId}/ticks/${partyTickId}/notes/`, { notes });

export const patchPartySupplies = (partyId: number, supplies: number) =>
  api.patch<Party>(`/party/${partyId}/supplies/`, { supplies });

export interface PartyPatch {
  player_count?: number;
  supplies?: number;
  speed?: number;
  max_speed?: number;
  resource_generation?: number;
  current_action?: string | null;
  current_hex?: number;
}

export const patchParty = (partyId: number, body: PartyPatch) =>
  api.patch<Party>(`/party/${partyId}/`, body);
