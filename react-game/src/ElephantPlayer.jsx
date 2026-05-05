export function ElephantPlayer({ physics }) {
  const isHurt = physics.hurtTimer > 0;
  const isSliding = physics.isSliding;

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[physics.x, 0.01, physics.z]} receiveShadow>
        <circleGeometry args={[0.55, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} depthWrite={false} />
      </mesh>

      <mesh position={[physics.x, isSliding ? 0.2 : physics.y, physics.z]} castShadow>
        <boxGeometry args={[0.75, isSliding ? 0.4 : 0.75, 0.75]} />
        <meshStandardMaterial color={isHurt ? '#ff3b30' : '#ff8fcf'} />
      </mesh>
    </>
  );
}
