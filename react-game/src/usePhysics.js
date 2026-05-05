import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';

const DOUBLE_JUMP_MULTIPLIER = 0.9;
const LANE_SPEED = 20;
const LANE_WIDTH = 2;
const THRESHOLD_Z = -22;

export function usePhysics({ inputRef, configRef, onState, onDistance, getObstacles }) {
  const physicsRef = useRef({
    lane: 0,
    x: 0,
    y: 0.4,
    z: 0,
    vy: 0,
    jumpsUsed: 0,
    isGrounded: true,
    isSliding: false,
    slideTimer: 0,
    worldScrollSpeed: 0,
    scrollState: 'PLAYER_MOVING_FORWARD',
    hurtTimer: 0,
    distance: 0,
  });

  useFrame((_, delta) => {
    const p = physicsRef.current;
    const input = inputRef.current;
    const cfg = configRef.current;

    if (input.leftPressed) p.lane = Math.max(-1, p.lane - 1), (input.leftPressed = false);
    if (input.rightPressed) p.lane = Math.min(1, p.lane + 1), (input.rightPressed = false);

    const targetX = p.lane * LANE_WIDTH;
    p.x += (targetX - p.x) * (1 - Math.exp(-LANE_SPEED * delta));

    if (input.jumpQueued) {
      if (p.isGrounded) {
        p.vy = cfg.jumpStrength;
        p.isGrounded = false;
        p.jumpsUsed = 1;
      } else if (p.jumpsUsed < 2) {
        p.vy = cfg.jumpStrength * DOUBLE_JUMP_MULTIPLIER;
        p.jumpsUsed = 2;
      }
      input.jumpQueued = false;
    }

    if (input.duckQueued) {
      p.isSliding = true;
      p.slideTimer = 0.35;
      input.duckQueued = false;
    }
    if (p.slideTimer > 0) p.slideTimer -= delta;
    if (p.slideTimer <= 0 && !input.downHeld) p.isSliding = false;

    p.vy += cfg.gravity * delta;
    p.y += p.vy * delta;
    if (p.y <= 0.4) {
      p.y = 0.4;
      p.vy = 0;
      p.isGrounded = true;
      p.jumpsUsed = 0;
    }

    if (input.upHeld) {
      if (p.z > THRESHOLD_Z) {
        p.z -= cfg.scrollSpeed * delta;
        p.worldScrollSpeed = 0;
        p.scrollState = 'PLAYER_MOVING_FORWARD';
      } else {
        p.worldScrollSpeed = cfg.scrollSpeed;
        p.scrollState = 'WORLD_MOVING_BACKWARD';
      }
      p.distance += cfg.scrollSpeed * delta;
    } else {
      p.worldScrollSpeed = 0;
    }

    const playerHalfY = p.isSliding ? 0.2 : 0.375;
    const playerYCenter = p.isSliding ? 0.2 : p.y;

    for (const obstacle of getObstacles()) {
      if (!obstacle.active) continue;
      const dx = Math.abs(obstacle.lane * LANE_WIDTH - p.x);
      const dz = Math.abs(obstacle.z - p.z);
      const dy = Math.abs(0.5 - playerYCenter);
      if (dx <= 0.875 && dz <= 0.875 && dy <= 0.5 + playerHalfY) p.hurtTimer = 0.2;
    }

    if (p.hurtTimer > 0) p.hurtTimer -= delta;

    onDistance(p.distance);
    onState({ ...p });
  });

  return physicsRef;
}
