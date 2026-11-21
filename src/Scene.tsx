import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { BufferGeometry, Vector3 } from 'three';
import { OrbitControls } from 'three-stdlib';
import { createBodyGeometry, getBodyLandmarks, type GeometryQuality } from './geometry';
import { ellipseRadii, type ResolvedBody } from './measurements';
import type { ViewCommand } from './BodyVisualizer';

interface SceneProps {
  body: ResolvedBody; muscle: number; color: string; measurementColor: string;
  showMeasurements: boolean; showGrid: boolean; autoRotate: boolean;
  quality: GeometryQuality; command: ViewCommand; fallback: ReactNode;
}

function CameraControls({ height, command, autoRotate }: { height: number; command: ViewCommand; autoRotate: boolean }) {
  const { camera, gl, invalidate, size } = useThree();
  const controls = useMemo(() => new OrbitControls(camera), [camera]);
  useEffect(() => {
    controls.connect(gl.domElement);
    controls.target.set(0, height * 0.50, 0);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minDistance = height * 0.65;
    controls.maxDistance = height * 3.5;
    controls.minPolarAngle = Math.PI * 0.15;
    controls.maxPolarAngle = Math.PI * 0.85;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.7;
    const onChange = () => invalidate();
    controls.addEventListener('change', onChange);
    return () => { controls.removeEventListener('change', onChange); controls.dispose(); };
  }, [controls, gl, height, invalidate]);
  useEffect(() => {
    const target = controls.target;
    if (command.turn) {
      camera.position.sub(target).applyAxisAngle(new Vector3(0, 1, 0), command.turn).add(target);
    } else if (command.zoom) {
      const offset = camera.position.clone().sub(target).multiplyScalar(command.zoom);
      offset.clampLength(height * 0.65, height * 3.5);
      camera.position.copy(target).add(offset);
    } else {
      const angle = { front: 0, side: Math.PI / 2, back: Math.PI, perspective: Math.PI / 6 }[command.view];
      // Fit both narrow embedded cards and full-width desktop stages.
      const distance = height * Math.max(1.95, 1.05 / (size.width / size.height));
      camera.position.set(Math.sin(angle) * distance, height * 0.53, Math.cos(angle) * distance);
    }
    controls.update();
    invalidate();
  }, [command, camera, controls, height, size.width, size.height, invalidate]);
  useFrame((_state, delta) => {
    if (!autoRotate) return;
    camera.position.sub(controls.target).applyAxisAngle(new Vector3(0, 1, 0), delta * 0.16).add(controls.target);
    controls.update();
    invalidate();
  });
  useEffect(() => { if (autoRotate) invalidate(); }, [autoRotate, invalidate]);
  return null;
}

function Ring({ width, depth, y, color }: { width: number; depth: number; y: number; color: string }) {
  const geometry = useMemo(() => {
    const points = Array.from({ length: 128 }, (_, i) => {
      const t = i / 128 * Math.PI * 2;
      return new Vector3(Math.cos(t) * width, y, Math.sin(t) * depth);
    });
    return new BufferGeometry().setFromPoints(points);
  }, [width, depth, y]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <lineLoop geometry={geometry} renderOrder={2}>
    <lineBasicMaterial color={color} transparent opacity={0.85} depthTest={false} />
  </lineLoop>;
}

function Body({ body, quality, muscle, color, showMeasurements, measurementColor }: SceneProps) {
  // Delay geometry work until a slider pauses. Existing geometry stays visible.
  const [shape, setShape] = useState({ body, quality, muscle });
  useEffect(() => {
    const timer = window.setTimeout(() => setShape({ body, quality, muscle }), 120);
    return () => window.clearTimeout(timer);
  }, [body, quality, muscle]);
  const geometry = useMemo(() => createBodyGeometry(shape.body, shape.quality, shape.muscle), [shape]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const landmarks = getBodyLandmarks(shape.body);
  const m = shape.body.measurements;
  return <>
    <mesh geometry={geometry} castShadow receiveShadow dispose={null}>
      <meshStandardMaterial color={color} roughness={0.73} metalness={0.04} />
    </mesh>
    {showMeasurements && (['chest', 'waist', 'hips'] as const).map(key => {
      const ratio = key === 'chest' ? (shape.body.template === 'female' ? 1.5 : 1.55) : key === 'waist' ? 1.42 : shape.body.template === 'female' ? 1.48 : 1.38;
      const [width, depth] = ellipseRadii(m[key] / 100, ratio);
      return <Ring key={key} width={width + 0.004} depth={depth + 0.004} y={landmarks[key]} color={measurementColor} />;
    })}
  </>;
}

export default function Scene(props: SceneProps) {
  const h = props.body.measurements.height / 100;
  return <Canvas shadows frameloop="demand" dpr={[1, 1.75]} fallback={props.fallback}
    camera={{ fov: 36, near: 0.01, far: 50, position: [0, h * 0.53, h * 1.75] }}
    gl={{ antialias: true, alpha: true }}
    style={{ position: 'absolute', inset: 0 }}
    onCreated={({ gl }) => { gl.domElement.setAttribute('aria-hidden', 'true'); }}>
    <hemisphereLight args={['#fffdf1', '#8c9285', 2]} />
    <directionalLight position={[-h, h * 1.8, h * 1.4]} intensity={3.4} castShadow
      shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005}
      shadow-camera-left={-h} shadow-camera-right={h} shadow-camera-top={h} shadow-camera-bottom={-h} />
    <directionalLight position={[h, h, -h]} intensity={2} color="#d9e6ed" />
    <Body {...props} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.003, 0]} receiveShadow>
      <planeGeometry args={[h * 8, h * 8]} />
      <shadowMaterial transparent opacity={0.15} />
    </mesh>
    {props.showGrid && <gridHelper args={[h * 4, 40, '#bac0b3', '#d4d8cd']} position={[0, -0.006, 0]} />}
    <CameraControls height={h} command={props.command} autoRotate={props.autoRotate} />
  </Canvas>;
}
