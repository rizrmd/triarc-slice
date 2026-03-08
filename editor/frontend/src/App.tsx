import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';

const CardList = lazy(() => import('./CardList'));
const HeroEditor = lazy(() => import('./HeroEditor'));
const GameLayoutEditor = lazy(() => import('./GameLayoutEditor'));

function App() {
  return (
    <Router>
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center">Loading...</div>}>
        <Routes>
          <Route path="/" element={<CardList />} />
          <Route path="/edit/:slug" element={<HeroEditor />} />
          <Route path="/game-layout" element={<GameLayoutEditor />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
