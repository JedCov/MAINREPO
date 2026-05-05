import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import { RepeatWrapping, TextureLoader } from 'three';
import { useMemo, useRef, useState } from 'react';
import { ElephantPlayer } from './ElephantPlayer';
import { useGameController } from './useGameController';
import { usePhysics } from './usePhysics';

const SPAWN_INTERVAL = 2;
const POOL_SIZE = 15;
const LANE_WIDTH = 2;

function Floor({ scrollSpeed }) {
  const floorRef = useRef(null);
  const texture = useLoader(TextureLoader, 'https://threejs.org/examples/textures/uv_grid_opengl.jpg');
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(50, 400);

  useFrame((_, delta) => {
    if (!floorRef.current) return;
    floorRef.current.position.z += scrollSpeed * delta;
    if (floorRef.current.position.z >= -850) floorRef.current.position.z = -950;
  });

  return (
    <mesh ref={floorRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -950]} receiveShadow>
      <planeGeometry args={[120, 2000]} />
      <meshStandardMaterial color="#1b3a2b" map={texture} />
    </mesh>
  );
}

function Crate({ obstacle, playerZ }) {
  return (
    <mesh
      position={[obstacle.lane * LANE_WIDTH, 0.5, obstacle.z - playerZ]}
      visible={obstacle.active}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#7a4b24" />
    </mesh>
  );
}

export function GameScene() {
  const [obstacles, setObstacles] = useState(() =>
    Array.from({ length: POOL_SIZE }, (_, id) => ({ id, lane: 0, z: -40, active: false })),
  );
  const [physicsState, setPhysicsState] = useState({ x: 0, y: 0.4, z: 0, isSliding: false, hurtTimer: 0, worldScrollSpeed: 0, scrollState: 'PLAYER_MOVING_FORWARD' });

  const inputRef = useGameController();
  const laneOptions = useMemo(() => [-1, 0, 1], []);
  const spawnTimer = useRef(0);

  usePhysics({
    inputRef,
    onState: (nextState) => setPhysicsState(nextState),
    getObstacles: () => obstacles,
  });

  useFrame((_, delta) => {
    spawnTimer.current += delta;

    setObstacles((previous) => {
      const next = previous.map((obstacle) => {
        if (!obstacle.active) return obstacle;
        const movedZ = obstacle.z + physicsState.worldScrollSpeed * delta;
        if (movedZ > physicsState.z + 10) return { ...obstacle, active: false, z: -40 };
        return { ...obstacle, z: movedZ };
      });

      if (spawnTimer.current >= SPAWN_INTERVAL && physicsState.worldScrollSpeed > 0) {
        spawnTimer.current -= SPAWN_INTERVAL;
        const poolIndex = next.findIndex((obstacle) => !obstacle.active);
        if (poolIndex !== -1) {
          const randomLane = laneOptions[Math.floor(Math.random() * laneOptions.length)];
          next[poolIndex] = { ...next[poolIndex], active: true, lane: randomLane, z: physicsState.z - 50 };
        }
      }
      return next;
    });

    if (physicsState.worldScrollSpeed > 0) {
      console.log('Scroll State:', physicsState.scrollState);
    }
  });

  return (
    <Canvas shadows>
      <PerspectiveCamera makeDefault fov={60} position={[0, 6, 12]} />
      <ambientLight intensity={0.35} />
      <directionalLight castShadow intensity={1.1} position={[6, 14, 8]} />

      <ElephantPlayer physics={physicsState} />
      <Floor scrollSpeed={physicsState.worldScrollSpeed} />
      {obstacles.map((obstacle) => <Crate key={obstacle.id} obstacle={obstacle} playerZ={physicsState.z} />)}
    </Canvas>
  );
}
