import { api } from './client';
import type { TickRequest, TickResponse, PartyActionRequest, PartyActionResponse } from '../types';

export const postTick = (body: TickRequest) => api.post<TickResponse>('/tick/', body);

export const postPartyAction = (partyId: number, body: PartyActionRequest) =>
  api.post<PartyActionResponse>(`/party/${partyId}/action/`, body);

export const patchPartyTickNotes = (partyId: number, partyTickId: number, notes: string) =>
  api.patch(`/party/${partyId}/ticks/${partyTickId}/notes/`, { notes });
