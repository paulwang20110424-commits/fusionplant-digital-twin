import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, type ThreeEvent } from '@react-three/fiber';
import { Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { MACHINE } from '@/simulation/constants';
import { PF_COIL_POSITIONS, tfCoilOutline } from '@/simulation/tokamakGeometry';
import { useSimulationStore } from '@/store/simulationStore';
import type { ReactorComponentId, ReactorViewMode } from '@/types/simulation';

const R0 = MACHINE.majorRadiusM;

/** Temperature -> emissive colour ramp (cyan -> magenta -> white hot). */
function temperatureColor(t: number, target: THREE.Color): THREE.Color {
  const cold = new THREE.Color('#0e7490');
  const warm = new THREE.Color('#d946ef');
  const hot = new THREE.Color('#f8faff');
  if (t < 0.5) return target.copy(cold).lerp(warm, t * 2);
  return target.copy(warm).lerp(hot, (t - 0.5) * 2);
}

interface PartProps {
  selected: boolean;
  onSelect: (id: ReactorComponentId) => void;
  visible?: boolean;
}

const useHoverCursor = () => {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    document.body.style.cursor = hovered ? 'pointer' : '';
    return () => {
      document.body.style.cursor = '';
    };
  }, [hovered]);
  return setHovered;
};

/* ------------------------------------------------------------------ */
/* Plasma                                                              */
/* ------------------------------------------------------------------ */

function PlasmaCore({ selected, onSelect, visible = true }: PartProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const coreMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const glowMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const temp = useMemo(() => new THREE.Color('#d946ef'), []);
  const setHovered = useHoverCursor();

  useFrame((state) => {
    const frame = useSimulationStore.getState().frame;
    const temperature = Math.min(1, Math.max(0, frame.plasma.temperatureKeV / 16));
    const fusion = Math.min(1, Math.max(0, frame.power.fusionPowerMW / 500));
    const pulse = Math.sin(state.clock.elapsedTime * 2.3) * 0.05;
    temperatureColor(temperature, temp);

    if (coreMaterial.current) {
      coreMaterial.current.emissive.copy(temp);
      coreMaterial.current.color.copy(temp);
      coreMaterial.current.emissiveIntensity = 0.7 + fusion * 1.8 + pulse;
      coreMaterial.current.opacity = 0.5 + fusion * 0.35;
    }
    if (glowMaterial.current) {
      glowMaterial.current.color.copy(temp);
      glowMaterial.current.opacity = 0.09 + fusion * 0.16 + pulse * 0.4;
    }
    if (meshRef.current) {
      const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.4) * 0.008;
      meshRef.current.scale.set(breathe, 1.32 * breathe, breathe);
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.06;
    }
    if (glowRef.current) {
      const glowScale = 1.09 + Math.sin(state.clock.elapsedTime * 1.1) * 0.012;
      glowRef.current.scale.set(glowScale, 1.32 * glowScale, glowScale);
      glowRef.current.rotation.y = -state.clock.elapsedTime * 0.04;
    }
  });

  if (!visible) return null;

  return (
    <group>
      <mesh
        ref={meshRef}
        rotation={[Math.PI / 2, 0, 0]}
        onClick={(event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          onSelect('plasma');
        }}
        onPointerOver={(event) => {
          event.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <torusGeometry args={[R0, MACHINE.minorRadiusM * 0.62, 40, 120]} />
        <meshStandardMaterial
          ref={coreMaterial}
          color="#d946ef"
          emissive="#d946ef"
          emissiveIntensity={1.4}
          transparent
          opacity={0.75}
          roughness={0.35}
          metalness={0.1}
          toneMapped={false}
        />
      </mesh>

      {/* outer glow shell */}
      <mesh ref={glowRef} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[R0, MACHINE.minorRadiusM * 0.72, 24, 96]} />
        <meshBasicMaterial
          ref={glowMaterial}
          color="#d946ef"
          transparent
          opacity={0.14}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.BackSide}
          toneMapped={false}
        />
      </mesh>

      {/* bright plasma core filament */}
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <torusGeometry args={[R0, MACHINE.minorRadiusM * 0.34, 20, 96]} />
        <meshBasicMaterial
          color={selected ? '#ffffff' : '#f5d0fe'}
          transparent
          opacity={0.22}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      <pointLight color="#e879f9" intensity={38} distance={26} decay={2} position={[R0, 0, 0]} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Vacuum vessel + cryostat                                            */
/* ------------------------------------------------------------------ */

function VacuumVessel({ selected, onSelect, cutaway }: PartProps & { cutaway: boolean }) {
  const setHovered = useHoverCursor();
  const arc = cutaway ? Math.PI * 1.28 : Math.PI * 2;

  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect('vacuum-vessel');
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R0, 2.55, 48, 120, arc]} />
        <meshStandardMaterial
          color={selected ? '#2b6f8f' : '#16344b'}
          metalness={0.85}
          roughness={0.35}
          transparent
          opacity={cutaway ? 0.16 : 0.3}
          side={THREE.DoubleSide}
          emissive={selected ? '#22d3ee' : '#000000'}
          emissiveIntensity={selected ? 0.35 : 0}
        />
      </mesh>

      {/* structural ribs */}
      {Array.from({ length: 18 }).map((_, index) => {
        const angle = (index / 18) * Math.PI * 2;
        return (
          <mesh key={`rib-${index}`} rotation={[Math.PI / 2, 0, angle]} raycast={() => null}>
            <torusGeometry args={[R0, 2.58, 6, 40, 0.05]} />
            <meshBasicMaterial color="#2f6f8d" transparent opacity={0.35} />
          </mesh>
        );
      })}
    </group>
  );
}

function Cryostat({ selected, onSelect, visible }: PartProps) {
  const setHovered = useHoverCursor();
  if (!visible) return null;
  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect('cryostat');
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[12.6, 12.6, 15.4, 64, 1, true]} />
        <meshBasicMaterial
          color={selected ? '#22d3ee' : '#1b4a63'}
          wireframe
          transparent
          opacity={selected ? 0.22 : 0.09}
        />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Magnets                                                             */
/* ------------------------------------------------------------------ */

function buildCoilCurve(): THREE.Curve<THREE.Vector3> {
  const points = tfCoilOutline(84).map((point) => new THREE.Vector3(point.r, point.z, 0));
  return new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.2);
}

function ToroidalFieldCoils({ selected, onSelect, visible }: PartProps) {
  const geometry = useMemo(() => {
    const curve = buildCoilCurve();
    const tube = new THREE.TubeGeometry(curve, 120, 0.26, 8, true);
    return tube;
  }, []);
  const setHovered = useHoverCursor();

  useEffect(() => () => geometry.dispose(), [geometry]);

  if (!visible) return null;

  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect('tf-coil');
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {Array.from({ length: MACHINE.tfCoilCount }).map((_, index) => (
        <mesh
          key={`tf-${index}`}
          geometry={geometry}
          rotation={[0, (index / MACHINE.tfCoilCount) * Math.PI * 2, 0]}
        >
          <meshStandardMaterial
            color={selected ? '#2f8fb5' : '#284c66'}
            metalness={0.92}
            roughness={0.28}
            emissive={selected ? '#22d3ee' : '#0a2233'}
            emissiveIntensity={selected ? 0.55 : 0.12}
          />
        </mesh>
      ))}
    </group>
  );
}

const PF_COILS = PF_COIL_POSITIONS;

function PoloidalFieldCoils({ selected, onSelect, visible }: PartProps) {
  const setHovered = useHoverCursor();
  if (!visible) return null;
  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect('pf-coil');
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {PF_COILS.map((coil, index) => (
        <mesh key={`pf-${index}`} position={[0, coil.y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[coil.radius, coil.tube, 10, 72]} />
          <meshStandardMaterial
            color={selected ? '#3c7f9e' : '#1d3a50'}
            metalness={0.9}
            roughness={0.3}
            emissive={selected ? '#67e8f9' : '#081a26'}
            emissiveIntensity={selected ? 0.5 : 0.1}
          />
        </mesh>
      ))}
    </group>
  );
}

function CentralSolenoid({ selected, onSelect, visible }: PartProps) {
  const setHovered = useHoverCursor();
  if (!visible) return null;
  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect('central-solenoid');
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[2.0, 2.0, 10.4, 40]} />
        <meshStandardMaterial
          color={selected ? '#3d7f9e' : '#1b3549'}
          metalness={0.95}
          roughness={0.22}
          emissive={selected ? '#22d3ee' : '#0a1c28'}
          emissiveIntensity={selected ? 0.45 : 0.1}
        />
      </mesh>
      {Array.from({ length: 9 }).map((_, index) => (
        <mesh key={`cs-seg-${index}`} position={[0, -4.4 + index * 1.1, 0]}>
          <torusGeometry args={[2.02, 0.045, 6, 40]} />
          <meshBasicMaterial color="#3f8aad" transparent opacity={0.55} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Divertor, supports, field lines                                      */
/* ------------------------------------------------------------------ */

function Divertor({ selected, onSelect, visible }: PartProps) {
  const setHovered = useHoverCursor();
  if (!visible) return null;
  return (
    <group
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onSelect('divertor');
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      <mesh position={[0, -2.65, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 0.45]}>
        <torusGeometry args={[R0 + 0.35, 0.95, 12, 80]} />
        <meshStandardMaterial
          color={selected ? '#8a5a3a' : '#4b3a30'}
          metalness={0.7}
          roughness={0.55}
          emissive={selected ? '#f59e0b' : '#1a0d05'}
          emissiveIntensity={selected ? 0.4 : 0.15}
        />
      </mesh>
    </group>
  );
}

function Supports() {
  return (
    <group>
      {Array.from({ length: 8 }).map((_, index) => {
        const angle = (index / 8) * Math.PI * 2;
        const radius = 9.6;
        return (
          <group key={`leg-${index}`} position={[Math.cos(angle) * radius, -7.6, Math.sin(angle) * radius]}>
            <mesh>
              <cylinderGeometry args={[0.32, 0.38, 3.6, 10]} />
              <meshStandardMaterial color="#1a3145" metalness={0.85} roughness={0.4} />
            </mesh>
            <mesh position={[0, -1.9, 0]}>
              <cylinderGeometry args={[0.85, 0.95, 0.28, 16]} />
              <meshStandardMaterial color="#152838" metalness={0.7} roughness={0.5} />
            </mesh>
          </group>
        );
      })}
      <mesh position={[0, -9.55, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[3.0, 12.8, 64]} />
        <meshStandardMaterial color="#081724" metalness={0.6} roughness={0.7} transparent opacity={0.9} />
      </mesh>
      <gridHelper args={[46, 30, '#123049', '#0a1c2b']} position={[0, -9.5, 0]} />
    </group>
  );
}

function FieldLines({ visible }: { visible: boolean }) {
  const groupRef = useRef<THREE.Group>(null);

  const lines = useMemo(() => {
    const result: THREE.Vector3[][] = [];
    const q = 2.6;
    const offsets = [0.45, 0.62, 0.78, 0.9];
    offsets.forEach((offset, lineIndex) => {
      const points: THREE.Vector3[] = [];
      const radius = MACHINE.minorRadiusM * offset;
      for (let index = 0; index <= 220; index += 1) {
        const phi = (index / 220) * Math.PI * 3.4;
        const theta = phi / q + (lineIndex * Math.PI) / 2;
        const rho = R0 + radius * Math.cos(theta) * 1.0;
        points.push(new THREE.Vector3(rho * Math.cos(phi), radius * Math.sin(theta) * 1.35, rho * Math.sin(phi)));
      }
      result.push(points);
    });
    return result;
  }, []);

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.11;
    }
  });

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      {lines.map((points, index) => (
        <Line
          key={`field-${index}`}
          points={points}
          color={index % 2 === 0 ? '#22d3ee' : '#a855f7'}
          lineWidth={1}
          transparent
          opacity={0.42}
          dashed={false}
        />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

const LABELS: Array<{ id: ReactorComponentId; text: string; position: [number, number, number] }> = [
  { id: 'vacuum-vessel', text: 'VACUUM VESSEL', position: [R0 + 3.4, 2.9, 0] },
  { id: 'tf-coil', text: 'TF COILS ×18', position: [-R0 - 3.6, 5.4, 0] },
  { id: 'plasma', text: 'PLASMA', position: [0, 1.9, R0] },
  { id: 'central-solenoid', text: 'CENTRAL SOLENOID', position: [0, 7.6, 0] },
  { id: 'pf-coil', text: 'PF COILS', position: [R0 + 5.4, -4.6, 0] },
  { id: 'divertor', text: 'DIVERTOR', position: [-R0 - 1.6, -4.4, 0] },
];

/**
 * Canvas-texture sprite labels.
 *
 * Deliberately not DOM overlays: sprites keep the 3D scene self contained, need no
 * font download, survive without the DOM and avoid creating extra React roots.
 */
function LabelSprite({
  text,
  position,
  active,
  onClick,
}: {
  text: string;
  position: [number, number, number];
  active: boolean;
  onClick: () => void;
}) {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) return null;

    const drawRounded = (x: number, y: number, w: number, h: number, r: number) => {
      context.beginPath();
      context.moveTo(x + r, y);
      context.lineTo(x + w - r, y);
      context.quadraticCurveTo(x + w, y, x + w, y + r);
      context.lineTo(x + w, y + h - r);
      context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      context.lineTo(x + r, y + h);
      context.quadraticCurveTo(x, y + h, x, y + h - r);
      context.lineTo(x, y + r);
      context.quadraticCurveTo(x, y, x + r, y);
      context.closePath();
    };

    context.clearRect(0, 0, 512, 96);
    drawRounded(6, 6, 500, 84, 10);
    context.fillStyle = active ? 'rgba(8, 47, 60, 0.88)' : 'rgba(4, 14, 24, 0.72)';
    context.fill();
    context.lineWidth = 3;
    context.strokeStyle = active ? 'rgba(34, 211, 238, 0.95)' : 'rgba(34, 211, 238, 0.35)';
    context.stroke();

    context.font = 'bold 34px "SFMono-Regular", Menlo, Consolas, monospace';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = active ? '#d7f7ff' : '#7dd3fc';
    context.fillText(text, 256, 52);

    const canvasTexture = new THREE.CanvasTexture(canvas);
    canvasTexture.anisotropy = 4;
    canvasTexture.needsUpdate = true;
    return canvasTexture;
  }, [text, active]);

  useEffect(() => () => texture?.dispose(), [texture]);

  if (!texture) return null;

  return (
    <sprite
      position={position}
      scale={[4.3, 0.8, 1]}
      renderOrder={10}
      onClick={(event: ThreeEvent<MouseEvent>) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        document.body.style.cursor = '';
      }}
    >
      <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  );
}

function ComponentLabels({
  show,
  selected,
  onSelect,
  hidden,
}: {
  show: boolean;
  selected: ReactorComponentId;
  onSelect: (id: ReactorComponentId) => void;
  hidden: ReactorComponentId[];
}) {
  if (!show) return null;
  return (
    <>
      {LABELS.filter((label) => !hidden.includes(label.id)).map((label) => (
        <LabelSprite
          key={label.id}
          text={label.text}
          position={label.position}
          active={selected === label.id}
          onClick={() => onSelect(label.id)}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export interface ReactorSceneProps {
  viewMode: ReactorViewMode;
  showFieldLines: boolean;
  showLabels: boolean;
  hiddenStructures: ReactorComponentId[];
  selected: ReactorComponentId;
  onSelect: (id: ReactorComponentId) => void;
  autoRotate: boolean;
  resetSignal: number;
}

function SceneContents({
  viewMode,
  showFieldLines,
  showLabels,
  hiddenStructures,
  selected,
  onSelect,
  autoRotate,
  resetSignal,
}: ReactorSceneProps) {
  const controlsRef = useRef<{ reset: () => void } | null>(null);
  const plasmaOnly = viewMode === 'PLASMA';
  const cutaway = viewMode === 'CUTAWAY';
  const isVisible = (id: ReactorComponentId) => !hiddenStructures.includes(id);

  useEffect(() => {
    if (resetSignal > 0) controlsRef.current?.reset();
  }, [resetSignal]);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[18, 22, 14]} intensity={1.5} color="#cfe9ff" />
      <directionalLight position={[-20, -10, -16]} intensity={0.5} color="#5b7fa8" />
      <pointLight position={[0, 0, 0]} intensity={22} color="#22d3ee" distance={28} decay={2} />

      <group position={[0, 0.6, 0]}>
        <PlasmaCore selected={selected === 'plasma'} onSelect={onSelect} visible={isVisible('plasma')} />
        {!plasmaOnly && (
          <>
            {isVisible('vacuum-vessel') && (
              <VacuumVessel selected={selected === 'vacuum-vessel'} onSelect={onSelect} cutaway={cutaway} />
            )}
            <ToroidalFieldCoils
              selected={selected === 'tf-coil'}
              onSelect={onSelect}
              visible={!cutaway && isVisible('tf-coil')}
            />
            <PoloidalFieldCoils
              selected={selected === 'pf-coil'}
              onSelect={onSelect}
              visible={!cutaway && isVisible('pf-coil')}
            />
            <CentralSolenoid
              selected={selected === 'central-solenoid'}
              onSelect={onSelect}
              visible={!cutaway && isVisible('central-solenoid')}
            />
            <Divertor selected={selected === 'divertor'} onSelect={onSelect} visible={isVisible('divertor')} />
            <Cryostat
              selected={selected === 'cryostat'}
              onSelect={onSelect}
              visible={!cutaway && isVisible('cryostat')}
            />
            <Supports />
          </>
        )}
        <FieldLines visible={showFieldLines} />
        <ComponentLabels
          show={showLabels}
          selected={selected}
          onSelect={onSelect}
          hidden={hiddenStructures}
        />
      </group>

      <OrbitControls
        ref={controlsRef as never}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.8}
        panSpeed={0.6}
        minDistance={9}
        maxDistance={52}
        maxPolarAngle={Math.PI * 0.9}
        autoRotate={autoRotate}
        autoRotateSpeed={0.55}
        target={[0, 0.6, 0]}
      />
    </>
  );
}

export function ReactorScene(props: ReactorSceneProps) {
  return (
    <Canvas
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ position: [17.5, 11.5, 19.5], fov: 38, near: 0.5, far: 220 }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <SceneContents {...props} />
    </Canvas>
  );
}
