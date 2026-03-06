import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import CardList from './CardList';
import HeroEditor from './HeroEditor';
import GameLayoutEditor from './GameLayoutEditor';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CardList />} />
        <Route path="/edit/:slug" element={<HeroEditor />} />
        <Route path="/game-layout" element={<GameLayoutEditor />} />
      </Routes>
    </Router>
  );
}

export default App;
