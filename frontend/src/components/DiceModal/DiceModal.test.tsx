import { describe, it, expect, vi, afterEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { DiceModal } from './DiceModal';
import { renderWithProviders } from '../../test/renderWithProviders';

afterEach(() => vi.restoreAllMocks());

describe('DiceModal', () => {
  it('renders the roll form with default 1d6 and no results yet', () => {
    renderWithProviders(<DiceModal onClose={() => {}} />);
    expect(screen.getByRole('heading', { name: 'Roll Dice' })).toBeInTheDocument();
    const inputs = screen.getAllByRole('spinbutton');
    expect(inputs[0]).toHaveValue(1); // number of dice
    expect(inputs[1]).toHaveValue(6); // number of sides
  });

  it('rolls and tallies faces (deterministic via stubbed Math.random)', async () => {
    // Math.random -> 0 makes every die land on face 1.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const user = userEvent.setup();
    renderWithProviders(<DiceModal onClose={() => {}} />);
    const inputs = screen.getAllByRole('spinbutton');
    await user.clear(inputs[0]);
    await user.type(inputs[0], '3'); // 3 dice
    await user.click(screen.getByRole('button', { name: 'Roll' }));
    // Face 1 got all three; every other face got zero.
    const rows = screen.getByText('1').closest('div');
    expect(rows).toHaveTextContent('3');
  });

  it('disables Roll when dice or sides drop below 1', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DiceModal onClose={() => {}} />);
    const inputs = screen.getAllByRole('spinbutton');
    await user.clear(inputs[0]); // empty -> Number('') === 0
    expect(screen.getByRole('button', { name: 'Roll' })).toBeDisabled();
  });

  it('calls onClose from the ✕ and Close buttons', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<DiceModal onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: '✕' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
