import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TimeOfDayBadge } from './TimeOfDayBadge';

describe('TimeOfDayBadge', () => {
  it('shows Morning for tick % 3 === 0', () => {
    render(<TimeOfDayBadge tickNumber={0} />);
    expect(screen.getByText('Morning')).toBeInTheDocument();
  });

  it('shows Afternoon for tick % 3 === 1', () => {
    render(<TimeOfDayBadge tickNumber={4} />);
    expect(screen.getByText('Afternoon')).toBeInTheDocument();
  });

  it('shows Night for tick % 3 === 2', () => {
    render(<TimeOfDayBadge tickNumber={5} />);
    expect(screen.getByText('Night')).toBeInTheDocument();
  });

  it('renders the day as floor(tick / 3)', () => {
    render(<TimeOfDayBadge tickNumber={10} />);
    expect(screen.getByText('Day 3')).toBeInTheDocument();
  });

  it('renders a decorative (aria-hidden) icon so the label is the accessible text', () => {
    const { container } = render(<TimeOfDayBadge tickNumber={0} />);
    expect(container.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });
});
