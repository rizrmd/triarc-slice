import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import CardList from './CardList';
import CardEditor from './CardEditor';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CardList />} />
        <Route path="/edit/:slug" element={<CardEditor />} />
      </Routes>
    </Router>
  );
}

export default App;
