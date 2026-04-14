import { GameProvider, useGame } from './contexts/GameContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { LoadingScene } from './scenes/LoadingScene';
import { MainMenu } from './scenes/MainMenu';
import { Gameplay } from './scenes/Gameplay';

function AppInner() {
  const { state } = useGame();
  switch (state.scene) {
    case 'loading': return <LoadingScene />;
    case 'main': return <MainMenu />;
    case 'gameplay': return <Gameplay />;
  }
}

export default function App() {
  return (
    <GameProvider>
      <WebSocketProvider>
        <AppInner />
      </WebSocketProvider>
    </GameProvider>
  );
}
