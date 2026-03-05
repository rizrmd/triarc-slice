import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import CardList from './CardList';
import HeroEditor from './HeroEditor';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CardList />} />
        <Route path="/edit/:slug" element={<HeroEditor />} />
      </Routes>
    </Router>
  );
}

export default App;
