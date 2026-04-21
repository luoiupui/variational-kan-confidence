import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

interface Props {
  trajectory: [number, number, number][];
  keyframes: number[];
  /** Current playhead frame (0..n-1). If omitted, shows the full path with cone at end. */
  currentFrame?: number;
}

export function Trajectory3D({ trajectory, keyframes, currentFrame }: Props) {
  const points = useMemo(
    () => trajectory.map((p) => new THREE.Vector3(p[0] * 4, p[2] * 4, p[1] * 4)),
    [trajectory],
  );
  const idx =
    currentFrame === undefined
      ? points.length - 1
      : Math.max(0, Math.min(points.length - 1, currentFrame));
  const visiblePoints = useMemo(() => points.slice(0, idx + 1), [points, idx]);
  const ghostPoints = useMemo(() => points.slice(idx), [points, idx]);
  const cursor = points[idx];

  // Keyframes split by past / upcoming + pop animation when we just crossed one
  const recentKfThreshold = 6;
  const kfMarkers = useMemo(
    () =>
      keyframes
        .map((i) => ({
          i,
          point: points[i],
          past: i <= idx,
          recent: idx >= i && idx - i < recentKfThreshold,
        }))
        .filter((k) => k.point),
    [keyframes, points, idx],
  );

  return (
    <div className="h-72 w-full overflow-hidden rounded-md border border-border bg-secondary/30">
      <Canvas camera={{ position: [5, 5, 7], fov: 50 }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[5, 5, 5]} intensity={0.6} />
        <Grid
          args={[20, 20]}
          cellColor="hsl(222 30% 22%)"
          sectionColor="hsl(222 30% 30%)"
          fadeDistance={20}
          infiniteGrid
        />
        {/* upcoming path (ghost) */}
        {ghostPoints.length > 1 && (
          <Line
            points={ghostPoints}
            color="hsl(222 30% 35%)"
            lineWidth={1}
            dashed
            dashSize={0.15}
            gapSize={0.08}
          />
        )}
        {/* trail so far */}
        {visiblePoints.length > 1 && (
          <Line points={visiblePoints} color="hsl(167 82% 52%)" lineWidth={2} />
        )}
        {kfMarkers.map((k) => (
          <KeyframeMarker key={k.i} position={k.point} past={k.past} recent={k.recent} />
        ))}
        {cursor && <CameraCursor position={cursor} />}
        <OrbitControls enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  );
}

function KeyframeMarker({
  position,
  past,
  recent,
}: {
  position: THREE.Vector3;
  past: boolean;
  recent: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = recent ? 1.8 : past ? 1 : 0.55;
    ref.current.scale.x += (target - ref.current.scale.x) * Math.min(1, dt * 6);
    ref.current.scale.y = ref.current.scale.x;
    ref.current.scale.z = ref.current.scale.x;
  });
  return (
    <mesh ref={ref} position={position}>
      <sphereGeometry args={[0.12, 16, 16]} />
      <meshStandardMaterial
        color={past ? "hsl(280 80% 65%)" : "hsl(280 30% 45%)"}
        emissive={recent ? "hsl(280 90% 60%)" : past ? "hsl(280 80% 40%)" : "hsl(0 0% 0%)"}
        emissiveIntensity={recent ? 1.4 : past ? 0.6 : 0}
      />
    </mesh>
  );
}

function CameraCursor({ position }: { position: THREE.Vector3 }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 1.4;
  });
  return (
    <group ref={ref} position={position}>
      <mesh>
        <coneGeometry args={[0.18, 0.4, 12]} />
        <meshStandardMaterial
          color="hsl(167 82% 52%)"
          emissive="hsl(167 82% 40%)"
          emissiveIntensity={0.8}
        />
      </mesh>
      <mesh>
        <ringGeometry args={[0.32, 0.38, 32]} />
        <meshBasicMaterial color="hsl(167 82% 52%)" transparent opacity={0.5} />
      </mesh>
    </group>
  );
}