import { describe, it, expect, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { MonsterModal } from './MonsterModal';
import { renderWithProviders } from '../../test/renderWithProviders';

afterEach(() => vi.restoreAllMocks());

// Spy on navigator.clipboard.writeText, installing a stub if jsdom lacks one.
function spyClipboard() {
  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    });
  }
  return vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
}

describe('MonsterModal', () => {
  it('renders a generated statblock with all labeled rows', () => {
    renderWithProviders(<MonsterModal onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Monster' })).toBeInTheDocument();
    for (const label of ['Physique', 'Feature', 'Quirk', 'Weakness', 'Attack', 'Critical', 'Ability']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('Reroll replaces the statblock (deterministic via Math.random)', async () => {
    const user = userEvent.setup();
    // First render/generate picks index 0 of every table.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    renderWithProviders(<MonsterModal onClose={() => {}} />);
    // Physique[0] = 'Albino'; still present after a reroll that also lands on 0.
    expect(screen.getByText('Albino')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reroll' }));
    expect(screen.getByText('Albino')).toBeInTheDocument();
  });

  it('Copy writes the statblock to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = spyClipboard();
    renderWithProviders(<MonsterModal onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('Appearance:');
  });

  it('calls onClose from the ✕ button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<MonsterModal onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: '✕' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
