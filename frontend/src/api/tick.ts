import { api } from './client';
import type { TickRequest, TickResponse, PartyActionRequest, PartyActionResponse, Party } from '../types';

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
