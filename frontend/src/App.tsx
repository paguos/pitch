import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import TournamentList from './pages/TournamentList';
import TournamentNew from './pages/TournamentNew';
import TournamentDetail from './pages/TournamentDetail';
import PlayersPage from './pages/Players';

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<TournamentList />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/tournaments/new" element={<TournamentNew />} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
