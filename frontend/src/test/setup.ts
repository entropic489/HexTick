// Vitest global setup: registers jest-dom matchers (toBeInTheDocument, etc.)
// and clears the DOM between tests. Referenced from vite.config.ts `test.setupFiles`.
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
