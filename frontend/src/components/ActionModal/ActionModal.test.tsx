import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { ActionModal } from './ActionModal';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Hex, Party, PointOfInterest } from '../../types';
import { postPartyAction } from '../../api/tick';

vi.mock('../../api/tick', () => ({ postPartyAction: vi.fn() }));
const postPartyActionMock = vi.mocked(postPartyAction);

beforeEach(() => {
  vi.clearAllMocks();
  postPartyActionMock.mockResolvedValue({} as never);
});

function makeHex(overrides: Partial<Hex> = {}): Hex {
  return {
    id: 1, map_id: 1, row: 0, col: 0, terrain_type: 'plains', terrain_difficulty: 1,
    resource_generation: 1, resources: 0, encounter_likelihood: 0, player_explored: true,
    player_visible: true, has_roads: false, has_rivers: false, can_enter: true,
    linked_map: null, pois: [], ...overrides,
  };
}

function makeDungeon(): PointOfInterest {
  return {
    id: 5, poi_type: 'dungeon', name: 'Crypt', difficulty: 3, title: '', description: '',
    notes: '', hidden: false, player_visible: true, player_explored: false,
  };
}

function makeParty(overrides: Partial<Party> = {}): Party {
  return {
    id: 9, name: 'Heroes', map: 1, player_count: 2, speed: 5, max_speed: 6,
    resource_generation: 0, supplies: 10, tracks_supplies: true, is_lost: false,
    current_hex: 1, destination: null, current_action: null, last_action: null, ...overrides,
  };
}

function btn(label: string): HTMLButtonElement {
  return screen.getByRole('button', { name: new RegExp(`^${label}`) }) as HTMLButtonElement;
}

function renderModal(props: Partial<Parameters<typeof ActionModal>[0]> = {}) {
  const party = props.party ?? makeParty();
  const current = makeHex({ id: 1 });
  return renderWithProviders(
    <ActionModal
      party={party}
      selectedHex={props.selectedHex ?? current}
      originHex={props.originHex ?? current}
      mapId={1}
      tickNumber={props.tickNumber ?? 3}
      onSuccess={props.onSuccess ?? (() => {})}
      onClose={props.onClose ?? (() => {})}
    />,
  );
}

describe('ActionModal gating matrix', () => {
  it('on the current hex: on-hex actions enabled, Move disabled (already here)', () => {
    renderModal();
    expect(btn('Supply')).toBeEnabled();
    expect(btn('Search')).toBeEnabled();
    expect(btn('Social')).toBeEnabled();
    expect(btn('Rest')).toBeEnabled();
    expect(btn('Move')).toBeDisabled();
    expect(btn('Delve')).toBeDisabled(); // no dungeon on hex
  });

  it('on a different visible hex within speed: Move enabled, on-hex actions disabled', () => {
    const dest = makeHex({ id: 2, col: 1, player_visible: true, terrain_difficulty: 1 });
    renderModal({ selectedHex: dest });
    expect(btn('Move')).toBeEnabled();
    expect(btn('Supply')).toBeDisabled();
    expect(btn('Search')).toBeDisabled();
    expect(btn('Rest')).toBeEnabled(); // Rest is always available
  });

  it('Move disabled on an invisible hex', () => {
    const dest = makeHex({ id: 2, col: 1, player_visible: false });
    renderModal({ selectedHex: dest });
    expect(btn('Move')).toBeDisabled();
  });

  it('Move disabled when the terrain cost exceeds party speed (too slow)', () => {
    const dest = makeHex({ id: 2, col: 1, player_visible: true, terrain_difficulty: 8 });
    renderModal({ selectedHex: dest, party: makeParty({ speed: 2 }) });
    expect(btn('Move')).toBeDisabled();
  });

  it('Delve enabled only with an accessible dungeon on the current hex', () => {
    const current = makeHex({ id: 1, pois: [makeDungeon()] });
    renderModal({ selectedHex: current, originHex: current });
    expect(btn('Delve')).toBeEnabled();
  });

  it('Supply disabled when the party does not track supplies', () => {
    renderModal({ party: makeParty({ tracks_supplies: false }) });
    expect(btn('Supply')).toBeDisabled();
  });
});

describe('ActionModal submit body', () => {
  it('Move sends action + hex_id', async () => {
    const user = userEvent.setup();
    const dest = makeHex({ id: 2, col: 1, player_visible: true });
    renderModal({ selectedHex: dest });
    await user.click(btn('Move'));
    expect(postPartyActionMock).toHaveBeenCalledWith(9, { action: 'move', hex_id: 2 });
  });

  it('non-move actions send only the action', async () => {
    const user = userEvent.setup();
    renderModal();
    await user.click(btn('Supply'));
    expect(postPartyActionMock).toHaveBeenCalledWith(9, { action: 'supply' });
  });

  it('calls onSuccess after a successful action', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    renderModal({ onSuccess });
    await user.click(btn('Rest'));
    expect(onSuccess).toHaveBeenCalledOnce();
  });
});
