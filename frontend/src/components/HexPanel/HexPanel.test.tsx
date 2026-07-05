import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { HexPanel } from './HexPanel';
import { renderWithProviders } from '../../test/renderWithProviders';
import { useGameStore } from '../../store/useGameStore';
import type { Faction, Hex, Party } from '../../types';

// Keep the panel offline: its gallery query + all mutations resolve through mocks.
vi.mock('../../api/maps', () => ({
  patchHex: vi.fn().mockResolvedValue({}),
  patchFaction: vi.fn().mockResolvedValue({}),
  postHighlightHex: vi.fn().mockResolvedValue({}),
  createPOI: vi.fn().mockResolvedValue({}),
  createFaction: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../api/tick', () => ({
  patchParty: vi.fn().mockResolvedValue({}),
  postPartyAction: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../api/gallery', () => ({
  getGallery: vi.fn().mockResolvedValue([]),
  publishGalleryImage: vi.fn().mockResolvedValue({}),
}));

beforeEach(() => vi.clearAllMocks());

function makeHex(o: Partial<Hex> = {}): Hex {
  return {
    id: 1, map_id: 1, row: 2, col: 3, terrain_type: 'forest', terrain_difficulty: 2,
    resource_generation: 1, resources: 7, encounter_likelihood: 30, player_explored: true,
    player_visible: true, has_roads: true, has_rivers: false, can_enter: false,
    linked_map: null, pois: [], ...o,
  };
}

function makeFaction(o: Partial<Faction> = {}): Faction {
  return {
    id: 10, name: 'Redhand', color: '#f00', speed: 3, max_speed: 4, population: 20,
    current_action: null, last_action: null, current_hex: 1,
    destination: null, is_mobile: true, is_dead: false, next_action: null,
    notes: '', leader: '', image: null, movement_restricted: false,
    allowed_hexes: [], ...o,
  };
}

function makeParty(o: Partial<Party> = {}): Party {
  return {
    id: 9, name: 'Heroes', map: 1, player_count: 2, speed: 5, max_speed: 6,
    resource_generation: 0, supplies: 10, tracks_supplies: true, is_lost: false,
    current_hex: 1, destination: null, current_action: null, last_action: null, ...o,
  };
}

const map = { map_type: 'regional' as const, id: 1 };

describe('HexPanel — empty & basic view', () => {
  it('prompts to select a hex when none is passed', () => {
    renderWithProviders(<HexPanel hex={null} factions={[]} gmMode onClose={() => {}} />);
    expect(screen.getByText('Select a hex to view details.')).toBeInTheDocument();
  });

  it('titles the panel with terrain and coordinates', () => {
    renderWithProviders(<HexPanel hex={makeHex()} factions={[]} gmMode onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: /Forest/ })).toHaveTextContent('(2, 3)');
  });
});

describe('HexPanel — GM-only gating', () => {
  it('GM view shows the Edit button and GM-only stats (Resources, Roads)', () => {
    renderWithProviders(
      <HexPanel hex={makeHex()} factions={[]} gmMode mapId={1} map={map} onClose={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByText('Resources')).toBeInTheDocument();
    expect(screen.getByText('Roads')).toBeInTheDocument();
  });

  it('player view hides the Edit button and the GM-only stats', () => {
    // Roadless hex so the player-facing "Roads" label pill can't confound the GM-stat check.
    renderWithProviders(
      <HexPanel hex={makeHex({ has_roads: false })} factions={[]} gmMode={false} mapId={1} map={map} onClose={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByText('Resources')).not.toBeInTheDocument();
    expect(screen.queryByText('Roads')).not.toBeInTheDocument();
  });

  it('player view shows present factions with an Interact button; GM party footer is absent', () => {
    renderWithProviders(
      <HexPanel
        hex={makeHex()} factions={[]} partyHexFactions={[makeFaction()]}
        gmMode={false} mapId={1} map={map} party={makeParty()} onClose={() => {}}
      />,
    );
    expect(screen.getByText('Factions Present')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Interact' })).toBeInTheDocument();
    // The GM-only party edit footer ("Party" title with Edit) must not render for players.
    expect(screen.queryByRole('button', { name: 'Actions…' })).not.toBeInTheDocument();
  });

  it('GM view renders the party footer with an Edit button', () => {
    renderWithProviders(
      <HexPanel hex={makeHex()} factions={[]} gmMode mapId={1} map={map} party={makeParty()} onClose={() => {}} />,
    );
    // Two Edit buttons now (hex + party); assert the party footer title is present.
    expect(screen.getByText('Party')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions…' })).toBeInTheDocument();
  });
});

describe('HexPanel — view/edit toggle', () => {
  it('clicking Edit swaps the stats view for the edit form', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <HexPanel hex={makeHex()} factions={[]} gmMode mapId={1} map={map} onClose={() => {}} />,
    );
    expect(screen.queryByRole('button', { name: '+ Add POI' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByRole('button', { name: '+ Add POI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  it('prepMode opens directly into the edit form', () => {
    renderWithProviders(
      <HexPanel hex={makeHex()} factions={[]} gmMode prepMode mapId={1} map={map} onClose={() => {}} />,
    );
    expect(screen.getByRole('button', { name: '+ Add POI' })).toBeInTheDocument();
  });
});

describe('HexPanel — Move party here visibility', () => {
  it('shows the button when the selected hex differs from the party hex', () => {
    renderWithProviders(
      <HexPanel
        hex={makeHex({ id: 2 })} factions={[]} gmMode mapId={1} map={map}
        party={makeParty({ current_hex: 1 })} onClose={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Move party here' })).toBeInTheDocument();
  });

  it('hides the button when the selected hex is the party hex', () => {
    renderWithProviders(
      <HexPanel
        hex={makeHex({ id: 1 })} factions={[]} gmMode mapId={1} map={map}
        party={makeParty({ current_hex: 1 })} onClose={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Move party here' })).not.toBeInTheDocument();
  });
});

describe('HexPanel — Last Action Result panel', () => {
  it('shows "No action yet." when the store has no moveResult', () => {
    renderWithProviders(<HexPanel hex={makeHex()} factions={[]} gmMode map={map} onClose={() => {}} />);
    expect(screen.getByText('No action yet.')).toBeInTheDocument();
  });

  it('renders the stored moveResult (action, navigation, event)', () => {
    useGameStore.setState({
      moveResult: {
        action: 'move', lost: true, lost_roll: 6, wilderness_event: 'Encounter', event_roll: 2,
      },
    });
    renderWithProviders(<HexPanel hex={makeHex()} factions={[]} gmMode map={map} onClose={() => {}} />);
    expect(screen.getByText('move')).toBeInTheDocument();
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.getByText('Encounter')).toBeInTheDocument();
  });
});
