import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { BulkHexPanel } from './BulkHexPanel';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { Hex, TerrainType } from '../../types';
import { bulkPatchHexes } from '../../api/maps';

vi.mock('../../api/maps', () => ({ bulkPatchHexes: vi.fn() }));
const bulkPatchMock = vi.mocked(bulkPatchHexes);

beforeEach(() => {
  vi.clearAllMocks();
  bulkPatchMock.mockResolvedValue({ updated: 2 });
});

function makeHex(id: number, o: Partial<Hex> = {}): Hex {
  return {
    id, map_id: 1, row: 0, col: id, terrain_type: 'plains', terrain_difficulty: 1,
    resource_generation: 1, resources: 0, encounter_likelihood: 0, player_explored: false,
    player_visible: false, has_roads: false, has_rivers: false, can_enter: true,
    linked_map: null, pois: [], ...o,
  };
}

// Two hexes that disagree on every flag/terrain → every field initializes to "no change".
const mixedHexes: Hex[] = [
  makeHex(1, { terrain_type: 'plains', has_roads: true, has_rivers: true, player_visible: true, player_explored: true }),
  makeHex(2, { terrain_type: 'forest' as TerrainType, has_roads: false, has_rivers: false, player_visible: false, player_explored: false }),
];

function renderPanel(hexes = mixedHexes, hexIds = [1, 2]) {
  return renderWithProviders(
    <BulkHexPanel hexIds={hexIds} hexes={hexes} mapId={1} onDone={() => {}} />,
  );
}

const roads = () => screen.getByRole('checkbox', { name: /Roads/ }) as HTMLInputElement;
const apply = () => screen.getByRole('button', { name: 'Apply' });

describe('BulkHexPanel tri-state', () => {
  it('renders an empty prompt with no hexes selected', () => {
    renderPanel([], []);
    expect(screen.getByText('Click hexes on the map to select them.')).toBeInTheDocument();
  });

  it('initializes every field to no-change (indeterminate) when the selection disagrees', () => {
    renderPanel();
    expect(roads().indeterminate).toBe(true);
    expect(roads().checked).toBe(false);
    expect(apply()).toBeDisabled(); // nothing to change yet
  });

  it('pre-fills a flag when the whole selection agrees on it', () => {
    const agreeing = [makeHex(1, { has_roads: true }), makeHex(2, { has_roads: true })];
    renderPanel(agreeing);
    expect(roads().indeterminate).toBe(false);
    expect(roads().checked).toBe(true);
    expect(apply()).toBeEnabled(); // agreed value counts as a change to apply
  });

  it('cycles a checkbox no-change → true → false → no-change', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(roads()); // → true
    expect(roads().checked).toBe(true);
    expect(roads().indeterminate).toBe(false);
    await user.click(roads()); // → false
    expect(roads().checked).toBe(false);
    expect(roads().indeterminate).toBe(false);
    await user.click(roads()); // → no-change
    expect(roads().indeterminate).toBe(true);
    expect(apply()).toBeDisabled();
  });

  it('sends only the changed fields (true) in the bulk-patch body', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(roads()); // has_roads → true; everything else stays no-change
    await user.click(apply());
    expect(bulkPatchMock).toHaveBeenCalledWith([1, 2], { has_roads: true });
  });

  it('sends an explicit false when a checkbox is cycled to ✗', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(roads()); // true
    await user.click(roads()); // false
    await user.click(apply());
    expect(bulkPatchMock).toHaveBeenCalledWith([1, 2], { has_roads: false });
  });

  it('includes a chosen terrain in the body', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.selectOptions(screen.getByRole('combobox'), 'mountain');
    await user.click(apply());
    expect(bulkPatchMock).toHaveBeenCalledWith([1, 2], { terrain_type: 'mountain' });
  });
});
