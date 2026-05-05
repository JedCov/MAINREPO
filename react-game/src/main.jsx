import React from 'react';
import { createRoot } from 'react-dom/client';
import { Gamepad2 } from 'lucide-react';
import { GameScene } from './GameScene';
import './styles.css';

function App() {
  return (
    <div className="app">
      <header className="hud">
        <Gamepad2 size={18} />
        <span>Jungle Run Prototype</span>
      </header>
      <GameScene />
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
