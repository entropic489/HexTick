import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { EventLog } from './EventLog';
import { renderWithProviders } from '../../test/renderWithProviders';
import { useGameStore } from '../../store/useGameStore';

describe('EventLog', () => {
  it('renders nothing when there are no pending events', () => {
    const { container } = renderWithProviders(<EventLog />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one row per pending event with its message', () => {
    useGameStore.setState({
      pendingEvents: [
        { type: 'battle', message: 'Ashfolk clashed with Redhand' },
        { type: 'trade', message: 'Goods exchanged at the crossroads' },
      ],
    });
    renderWithProviders(<EventLog />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Ashfolk clashed with Redhand');
    expect(items[1]).toHaveTextContent('Goods exchanged at the crossroads');
  });

  it('Dismiss button click empties the events and collapses the log', async () => {
    const user = userEvent.setup();
    useGameStore.setState({ pendingEvents: [{ type: 'info', message: 'A quiet night' }] });
    const { container } = renderWithProviders(<EventLog />);
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(useGameStore.getState().pendingEvents).toHaveLength(0);
    expect(container).toBeEmptyDOMElement();
  });
});
