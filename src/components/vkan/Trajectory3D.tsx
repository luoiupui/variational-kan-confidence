import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";

interface Props {
  trajectory: [number, number, number][];
  keyframes: number[];
}

export function Trajectory3D({ trajectory, keyframes }: Props) {
  const points = useMemo(
    () => trajectory.map((p) => new THREE.Vector3(p[0] * 4, p[2] * 4, p[1] * 4)),
    [trajectory],
  );
  const kfPoints = useMemo(
    () => keyframes.map((i) => points[i]).filter(Boolean),
    [keyframes, points],
  );
  const last = points[points.length - 1];

  return (
    <div className="h-72 w-full overflow-hidden rounded-md border border-border bg-secondary/30">
      <Canvas camera={{ position: [4, 4, 6], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.6} />
        <Grid
          args={[20, 20]}
          cellColor="hsl(222 30% 22%)"
          sectionColor="hsl(222 30% 30%)"
          fadeDistance={20}
          infiniteGrid
        />
        {points.length > 1 && (
          <Line points={points} color="hsl(167 82% 52%)" lineWidth={2} />
        )}
        {kfPoints.map((p, idx) => (
          <mesh key={idx} position={p}>
            <sphereGeometry args={[0.12, 16, 16]} />
            <meshStandardMaterial color="hsl(280 80% 65%)" emissive="hsl(280 80% 50%)" />
          </mesh>
        ))}
        {last && (
          <mesh position={last}>
            <coneGeometry args={[0.18, 0.4, 12]} />
            <meshStandardMaterial color="hsl(167 82% 52%)" emissive="hsl(167 82% 40%)" />
          </mesh>
        )}
        <OrbitControls enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  );
}