import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';

const CardList = lazy(() => import('./CardList'));
const EditorPage = lazy(() => import('./EditorPage'));
const GameLayoutEditor = lazy(() => import('./GameLayoutEditor'));
const GameLayoutPicker = lazy(() => import('./GameLayoutPicker'));
const AnimapList = lazy(() => import('./AnimapList'));
const AnimapEditor = lazy(() => import('./AnimapEditor'));

function App() {
  return (
    <Router>
      <Suspense fallback={<div className="flex h-screen w-screen items-center justify-center">Loading...</div>}>
        <Routes>
          <Route path="/" element={<CardList />} />
          <Route path="/edit/:slug" element={<EditorPage />} />
          <Route path="/game-layout" element={<GameLayoutPicker />} />
          <Route path="/game-layout/:scene" element={<GameLayoutPicker />} />
          <Route path="/game-layout/:scene/:aspect" element={<GameLayoutEditor />} />
          <Route path="/animaps" element={<AnimapList />} />
          <Route path="/animaps/:category" element={<AnimapList />} />
          <Route path="/animap/:slug" element={<AnimapEditor />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
