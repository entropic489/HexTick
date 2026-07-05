import { describe, it, expect, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { NPCModal } from './NPCModal';
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

describe('NPCModal', () => {
  it('renders a generated NPC with all labeled rows', () => {
    renderWithProviders(<NPCModal onClose={() => {}} />);
    for (const label of ['Quirk', 'Background', 'Goal', 'Virtue', 'Vice', 'Mutation']) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it('Reroll regenerates without crashing and keeps the rows', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NPCModal onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Reroll' }));
    expect(screen.getByText('Goal')).toBeInTheDocument();
  });

  it('Copy writes a markdown NPC block to the clipboard', async () => {
    const user = userEvent.setup();
    const writeText = spyClipboard();
    renderWithProviders(<NPCModal onClose={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0][0]).toContain('Background:');
  });

  it('calls onClose from the ✕ button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<NPCModal onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: '✕' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
