import { Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './components/Shell';
import { useAuth } from './lib/auth';
import { LoadingScreen, LoginPage, ServerDownScreen, SetupPage } from './pages/AuthScreens';
import TournamentList from './pages/TournamentList';
import TournamentNew from './pages/TournamentNew';
import TournamentDetail from './pages/TournamentDetail';
import PlayersPage from './pages/Players';
import MyResultsPage from './pages/MyResults';
import LeaderboardPage from './pages/Leaderboard';
import ProfilePage from './pages/Profile';

export default function App() {
  const { phase, setupRequired, user, isAdmin } = useAuth();

  if (phase === 'loading') return <LoadingScreen />;
  if (phase === 'error') return <ServerDownScreen />;
  // A fresh install has no admin yet: the first screen is the password setup.
  if (setupRequired) return <SetupPage />;
  // Not signed in: show the sign-in screen at whatever URL was requested, so a
  // deep link still opens after signing in.
  if (!user) return <LoginPage />;

  return (
    <Shell>
      <Routes>
        <Route path="/" element={<TournamentList />} />
        <Route path="/me" element={<MyResultsPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/players" element={<PlayersPage />} />
        <Route path="/players/:id" element={<ProfilePage />} />
        <Route path="/leaderboard/:stat?" element={<LeaderboardPage />} />
        <Route path="/tournaments/new" element={isAdmin ? <TournamentNew /> : <Navigate to="/" replace />} />
        <Route path="/tournaments/:id" element={<TournamentDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
