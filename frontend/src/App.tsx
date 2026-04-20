import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapSelection } from './pages/MapSelection/MapSelection';
import { GMPage } from './pages/GMPage/GMPage';
import { PlayerPage } from './pages/PlayerPage/PlayerPage';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MapSelection />} />
          <Route path="/map/:mapId/gm" element={<GMPage />} />
          <Route path="/map/:mapId/player" element={<PlayerPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
