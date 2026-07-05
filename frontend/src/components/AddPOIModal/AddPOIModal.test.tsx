import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { AddPOIModal } from './AddPOIModal';
import { renderWithProviders } from '../../test/renderWithProviders';
import { createPOI } from '../../api/maps';

vi.mock('../../api/maps', () => ({ createPOI: vi.fn() }));
const createPOIMock = vi.mocked(createPOI);

beforeEach(() => {
  vi.clearAllMocks();
  createPOIMock.mockResolvedValue({} as never);
});

function render() {
  return renderWithProviders(<AddPOIModal hexId={7} mapId={1} onClose={() => {}} />);
}

describe('AddPOIModal conditional fields', () => {
  it('shows dungeon-only fields (Title, Tech mod, Difficulty, Description) for the default dungeon type', () => {
    render();
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Tech mod')).toBeInTheDocument();
    expect(screen.getByText('Difficulty')).toBeInTheDocument();
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.queryByText('Monster type')).not.toBeInTheDocument();
  });

  it('shows Difficulty but not dungeon fields for ruin', async () => {
    const user = userEvent.setup();
    render();
    await user.selectOptions(screen.getByRole('combobox'), 'ruin');
    expect(screen.getByText('Difficulty')).toBeInTheDocument();
    expect(screen.queryByText('Title')).not.toBeInTheDocument();
    expect(screen.queryByText('Tech mod')).not.toBeInTheDocument();
    expect(screen.queryByText('Description')).not.toBeInTheDocument();
  });

  it('shows Monster type for monster_base and no Difficulty', async () => {
    const user = userEvent.setup();
    render();
    await user.selectOptions(screen.getByRole('combobox'), 'monster_base');
    expect(screen.getByText('Monster type')).toBeInTheDocument();
    expect(screen.queryByText('Difficulty')).not.toBeInTheDocument();
  });

  it('shows Description/Notes but no Difficulty for general', async () => {
    const user = userEvent.setup();
    render();
    await user.selectOptions(screen.getByRole('combobox'), 'general');
    expect(screen.getByText('Description')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
    expect(screen.queryByText('Difficulty')).not.toBeInTheDocument();
  });
});

describe('AddPOIModal submit', () => {
  it('posts the draft to the hex, carrying edited fields and defaults', async () => {
    const user = userEvent.setup();
    render();
    await user.type(screen.getByPlaceholderText('Optional display name'), 'The Deep');
    await user.click(screen.getByRole('button', { name: 'Add POI' }));
    expect(createPOIMock).toHaveBeenCalledOnce();
    const [hexId, body] = createPOIMock.mock.calls[0];
    expect(hexId).toBe(7);
    expect(body).toMatchObject({
      poi_type: 'dungeon',
      name: 'The Deep',
      age: 4,
      player_visible: false,
      hidden: false,
    });
  });

  it('reflects checkbox toggles in the submitted body', async () => {
    const user = userEvent.setup();
    render();
    await user.click(screen.getByLabelText('Player visible'));
    await user.click(screen.getByLabelText('Hidden'));
    await user.click(screen.getByRole('button', { name: 'Add POI' }));
    const [, body] = createPOIMock.mock.calls[0];
    expect(body).toMatchObject({ player_visible: true, hidden: true, player_explored: false });
  });
});
