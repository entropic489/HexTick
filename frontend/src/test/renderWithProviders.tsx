// Shared test render helper. Wraps RTL `render` in a fresh QueryClient (per call,
// retries off so failed queries surface immediately) and a MemoryRouter, and resets
// the Zustand game store to its module-load snapshot before each test.
//
// Every component test that touches React Query, routing, or the store depends on
// this. Seed query data via the returned `queryClient` (e.g.
// `queryClient.setQueryData(['gallery', mapId], …)`) rather than mocking network
// where a component reads a query directly.
import { beforeEach } from 'vitest';
import { render, type RenderOptions } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement, ReactNode } from 'react';
import { useGameStore } from '../store/useGameStore';

// Snapshot the pristine store once at module load; restored before each test.
const storeInitial = useGameStore.getState();
beforeEach(() => {
  useGameStore.setState(storeInitial, true);
});

interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  // Initial history entries for the MemoryRouter (e.g. ['/map/1/gallery']).
  routerEntries?: string[];
  // Provide an existing client to pre-seed cache before render; otherwise a fresh one is made.
  queryClient?: QueryClient;
}

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  { routerEntries = ['/'], queryClient, ...options }: RenderWithProvidersOptions = {},
) {
  const client = queryClient ?? makeTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={routerEntries}>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { queryClient: client, ...render(ui, { wrapper: Wrapper, ...options }) };
}
