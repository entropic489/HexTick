import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { AddFactionModal } from './AddFactionModal';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Hex } from '../../types';
import { createFaction } from '../../api/maps';

vi.mock('../../api/maps', () => ({ createFaction: vi.fn() }));
const createFactionMock = vi.mocked(createFaction);

beforeEach(() => {
  vi.clearAllMocks();
  createFactionMock.mockResolvedValue({} as never);
});

function makeHex(id: number, row: number, col: number): Hex {
  return {
    id, map_id: 1, row, col, terrain_type: 'plains', terrain_difficulty: 1,
    resource_generation: 1, resources: 0, encounter_likelihood: 0, player_explored: true,
    player_visible: true, has_roads: false, has_rivers: false, can_enter: true,
    linked_map: null, pois: [],
  };
}

const hexes = [makeHex(1, 0, 0), makeHex(2, 1, 0)];

describe('AddFactionModal', () => {
  it('disables Create until a name is entered', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AddFactionModal mapId={1} hexes={hexes} onClose={() => {}} />);
    const create = screen.getByRole('button', { name: 'Create Faction' });
    expect(create).toBeDisabled();
    await user.type(screen.getByPlaceholderText('Faction name'), 'Redhand');
    expect(create).toBeEnabled();
  });

  it('submits the draft (with default stats and the seeded hex) on Create', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AddFactionModal mapId={1} hexes={hexes} defaultHexId={2} onClose={() => {}} />,
    );
    await user.type(screen.getByPlaceholderText('Faction name'), 'Redhand');
    await user.click(screen.getByRole('button', { name: 'Create Faction' }));
    expect(createFactionMock).toHaveBeenCalledOnce();
    const [mapId, body] = createFactionMock.mock.calls[0];
    expect(mapId).toBe(1);
    expect(body).toMatchObject({
      name: 'Redhand',
      current_hex: 2, // seeded from defaultHexId
      speed: 4, max_speed: 4, population: 10,
      is_mobile: true,
    });
  });

  it('calls onClose after a successful create', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<AddFactionModal mapId={1} hexes={hexes} onClose={onClose} />);
    await user.type(screen.getByPlaceholderText('Faction name'), 'X');
    await user.click(screen.getByRole('button', { name: 'Create Faction' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Cancel closes without creating', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<AddFactionModal mapId={1} hexes={hexes} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(createFactionMock).not.toHaveBeenCalled();
  });
});
