import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Grid, Line } from "@react-three/drei";
import { useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

/** Named trajectory with display style. */
export interface NamedTrajectory {
  name: string;
  points: [number, number, number][];
  /** HSL string e.g. "hsl(167 82% 52%)" */
  color: string;
  /** dashed = ground truth style */
  dashed?: boolean;
}

export interface MapPoint {
  pos: [number, number, number];
  /** optional intensity 0..1 for coloring */
  weight?: number;
}

interface Props {
  /** Legacy single trajectory (kept for Home page compat). */
  trajectory: [number, number, number][];
  keyframes: number[];
  /** Current playhead frame (0..n-1). If omitted, shows the full path with cone at end. */
  currentFrame?: number;
  /** Optional extra trajectories (e.g. ORB-SLAM3, GT) drawn on top. */
  extraTrajectories?: NamedTrajectory[];
  /** Optional sparse map points (ORB-SLAM3 MapPoints). */
  mapPoints?: MapPoint[];
  /** Show view toggle (Trajectory / Map / Both). Defaults to false. */
  showViewToggle?: boolean;
}

type ViewMode = "trajectory" | "map" | "both";

const SCALE = 4;
const toVec = (p: [number, number, number]) =>
  new THREE.Vector3(p[0] * SCALE, p[2] * SCALE, p[1] * SCALE);

export function Trajectory3D({
  trajectory,
  keyframes,
  currentFrame,
  extraTrajectories,
  mapPoints,
  showViewToggle = false,
}: Props) {
  const [view, setView] = useState<ViewMode>(showViewToggle ? "both" : "trajectory");
  const showTraj = view === "trajectory" || view === "both";
  const showMap = view === "map" || view === "both";

  const points = useMemo(() => trajectory.map(toVec), [trajectory]);
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

  const extras = useMemo(
    () =>
      (extraTrajectories ?? []).map((t) => ({
        ...t,
        vec: t.points.map(toVec),
      })),
    [extraTrajectories],
  );

  const mapVecs = useMemo(
    () =>
      (mapPoints ?? []).map((m) => ({
        v: toVec(m.pos),
        w: m.weight ?? 0.5,
      })),
    [mapPoints],
  );

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-md border border-border bg-secondary/30">
      {showViewToggle && (
        <div className="absolute right-2 top-2 z-10 flex rounded-md border border-border bg-card/80 p-0.5 backdrop-blur">
          {(["trajectory", "map", "both"] as ViewMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setView(m)}
              className={cn(
                "px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors",
                view === m
                  ? "rounded bg-primary/20 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      )}
      {extras.length > 0 && (
        <div className="absolute left-2 top-2 z-10 flex flex-col gap-0.5 rounded-md border border-border bg-card/80 p-1.5 backdrop-blur">
          <LegendDot color="hsl(167 82% 52%)" label="V-KAN" />
          {extras.map((t) => (
            <LegendDot key={t.name} color={t.color} label={t.name} dashed={t.dashed} />
          ))}
        </div>
      )}
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

        {/* MAP layer: sparse landmarks + keyframe frustums */}
        {showMap && mapVecs.length > 0 &&
          mapVecs.map((m, i) => (
            <mesh key={i} position={m.v}>
              <sphereGeometry args={[0.025, 6, 6]} />
              <meshBasicMaterial
                color="hsl(45 90% 65%)"
                transparent
                opacity={0.35 + m.w * 0.5}
              />
            </mesh>
          ))}
        {showMap &&
          kfMarkers.map((k) => (
            <Frustum key={`fr-${k.i}`} position={k.point} active={k.recent} past={k.past} />
          ))}

        {/* TRAJECTORY layer */}
        {showTraj && ghostPoints.length > 1 && (
          <Line
            points={ghostPoints}
            color="hsl(222 30% 35%)"
            lineWidth={1}
            dashed
            dashSize={0.15}
            gapSize={0.08}
          />
        )}
        {showTraj && visiblePoints.length > 1 && (
          <Line points={visiblePoints} color="hsl(167 82% 52%)" lineWidth={2} />
        )}
        {showTraj &&
          extras.map((t) =>
            t.vec.length > 1 ? (
              <Line
                key={t.name}
                points={t.vec}
                color={t.color}
                lineWidth={t.dashed ? 1 : 1.5}
                dashed={t.dashed}
                dashSize={0.18}
                gapSize={0.1}
              />
            ) : null,
          )}
        {showTraj &&
          kfMarkers.map((k) => (
            <KeyframeMarker
              key={k.i}
              position={k.point}
              past={k.past}
              recent={k.recent}
            />
          ))}
        {showTraj && cursor && <CameraCursor position={cursor} />}
        <OrbitControls enablePan enableZoom enableRotate />
      </Canvas>
    </div>
  );
}

function LegendDot({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-0.5 w-3 rounded"
        style={{
          background: dashed
            ? `repeating-linear-gradient(to right, ${color} 0 3px, transparent 3px 5px)`
            : color,
        }}
      />
      <span className="font-mono text-[9px] uppercase tracking-wider text-foreground/80">
        {label}
      </span>
    </div>
  );
}

function Frustum({
  position,
  active,
  past,
}: {
  position: THREE.Vector3;
  active: boolean;
  past: boolean;
}) {
  // Small camera pyramid: square base + apex pointing forward
  const color = active
    ? "hsl(45 90% 65%)"
    : past
      ? "hsl(45 60% 50%)"
      : "hsl(45 30% 40%)";
  return (
    <group position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.18, 0.32, 4]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.7} />
      </mesh>
    </group>
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