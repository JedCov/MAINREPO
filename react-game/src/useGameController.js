import { useEffect, useRef } from 'react';

export function useGameController() {
  const inputRef = useRef({
    leftPressed: false,
    rightPressed: false,
    upHeld: false,
    downHeld: false,
    jumpQueued: false,
    duckQueued: false,
  });

  useEffect(() => {
    function onKeyDown(event) {
      if (event.code === 'ArrowLeft') inputRef.current.leftPressed = true;
      if (event.code === 'ArrowRight') inputRef.current.rightPressed = true;
      if (event.code === 'ArrowUp') inputRef.current.upHeld = true;
      if (event.code === 'ArrowDown') {
        inputRef.current.downHeld = true;
        inputRef.current.duckQueued = true;
      }
      if (event.code === 'Space') inputRef.current.jumpQueued = true;
    }

    function onKeyUp(event) {
      if (event.code === 'ArrowLeft') inputRef.current.leftPressed = false;
      if (event.code === 'ArrowRight') inputRef.current.rightPressed = false;
      if (event.code === 'ArrowUp') inputRef.current.upHeld = false;
      if (event.code === 'ArrowDown') inputRef.current.downHeld = false;
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  return inputRef;
}
