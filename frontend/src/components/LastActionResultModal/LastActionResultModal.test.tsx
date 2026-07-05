import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { LastActionResultModal } from './LastActionResultModal';
import { renderWithProviders } from '../../test/renderWithProviders';
import type { MoveResult } from '../../store/useGameStore';

function makeResult(overrides: Partial<MoveResult> = {}): MoveResult {
  return {
    action: 'move',
    lost: false,
    lost_roll: 4,
    wilderness_event: 'Encounter',
    event_roll: 2,
    ...overrides,
  };
}

describe('LastActionResultModal', () => {
  it('renders the action, on-course navigation, and event', () => {
    renderWithProviders(<LastActionResultModal result={makeResult()} onClose={() => {}} />);
    expect(screen.getByText('move')).toBeInTheDocument();
    expect(screen.getByText('On course')).toBeInTheDocument();
    expect(screen.getByText('Encounter')).toBeInTheDocument();
  });

  it('shows Lost when the party got lost', () => {
    renderWithProviders(
      <LastActionResultModal result={makeResult({ lost: true, lost_roll: 6 })} onClose={() => {}} />,
    );
    expect(screen.getByText('Lost')).toBeInTheDocument();
    expect(screen.queryByText('On course')).not.toBeInTheDocument();
  });

  it('annotates a skipped lost roll (on course, lost_roll null)', () => {
    renderWithProviders(
      <LastActionResultModal result={makeResult({ lost: false, lost_roll: null })} onClose={() => {}} />,
    );
    expect(screen.getByText('(Skipped)')).toBeInTheDocument();
  });

  it('renders a weather transition only when both endpoints are present', () => {
    const { rerender } = renderWithProviders(
      <LastActionResultModal result={makeResult()} onClose={() => {}} />,
    );
    expect(screen.queryByText('Weather')).not.toBeInTheDocument();
    rerender(
      <LastActionResultModal
        result={makeResult({ weather_before: 'fair', weather_after: 'inclement' })}
        onClose={() => {}}
      />,
    );
    expect(screen.getByText('Weather')).toBeInTheDocument();
    expect(screen.getByText('Fair → Inclement')).toBeInTheDocument();
  });

  it('calls onClose from both the ✕ and the Close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderWithProviders(<LastActionResultModal result={makeResult()} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: '✕' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
