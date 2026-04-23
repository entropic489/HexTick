import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MapSelection } from './pages/MapSelection/MapSelection';
import { CreateMap } from './pages/CreateMap/CreateMap';
import { GMPage } from './pages/GMPage/GMPage';
import { PlayerPage } from './pages/PlayerPage/PlayerPage';
import { FactionsPage } from './pages/FactionsPage/FactionsPage';
import { KnowledgePage } from './pages/KnowledgePage/KnowledgePage';
import { CharactersPage } from './pages/CharactersPage/CharactersPage';

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
          <Route path="/map/:mapId/factions" element={<FactionsPage />} />
          <Route path="/map/:mapId/knowledge" element={<KnowledgePage />} />
          <Route path="/map/:mapId/characters" element={<CharactersPage />} />
          <Route path="/maps/create" element={<CreateMap />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
