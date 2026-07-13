import React from 'react';
import { motion } from 'framer-motion';
import { Canvas } from '@react-three/fiber';
import { Float } from '@react-three/drei';
import * as THREE from 'three';

const vertexShader = `
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  varying float vDisplacement;

  vec3 mod289(vec3 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec4 mod289(vec4 x) {
    return x - floor(x * (1.0 / 289.0)) * 289.0;
  }

  vec4 permute(vec4 x) {
    return mod289(((x * 34.0) + 1.0) * x);
  }

  vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
  }

  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);

    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);

    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;

    i = mod289(i);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0))
      + i.y + vec4(0.0, i1.y, i2.y, 1.0))
      + i.x + vec4(0.0, i1.x, i2.x, 1.0));

    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;

    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);

    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);

    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);

    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);

    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));

    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);

    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;

    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    vUv = uv;
    vec3 pos = position;
    
    float noise1 = snoise(pos * 1.5 + uTime * 0.3);
    float noise2 = snoise(pos * 3.0 + uTime * 0.5);
    float noise3 = snoise(pos * 5.0 + uTime * 0.7);
    
    float displacement = (noise1 * 0.5 + noise2 * 0.25 + noise3 * 0.125) * uIntensity;
    vDisplacement = displacement;
    
    pos += normal * displacement;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  varying float vDisplacement;

  void main() {
    float fresnel = pow(1.0 - abs(dot(normalize(vec3(0.0, 0.0, 1.0)), vec3(0.0, 0.0, 1.0))), 2.0);
    
    float glow = fresnel * 0.8 + vDisplacement * 0.5;
    
    vec3 color = uColor + vec3(0.2, 0.4, 0.6) * glow;
    
    float alpha = (0.3 + fresnel * 0.4 + glow * 0.3) * uOpacity;
    
    gl_FragColor = vec4(color, alpha);
  }
`;

const INTENSITY_MAP = {
  idle: 0.15,
  listening: 0.35,
  thinking: 0.5,
  talking: 0.4,
};

const COLOR_MAP = {
  idle: new THREE.Color('#4dd0e1'),
  listening: new THREE.Color('#6ee7ff'),
  thinking: new THREE.Color('#49b3ff'),
  talking: new THREE.Color('#8cefff'),
};

function OrbMesh({ state }) {
  const meshRef = React.useRef(null);
  const materialRef = React.useRef(null);

  const uniforms = React.useMemo(() => ({
    uTime: { value: 0 },
    uIntensity: { value: INTENSITY_MAP[state] || 0.15 },
    uColor: { value: COLOR_MAP[state] || new THREE.Color('#4dd0e1') },
    uOpacity: { value: 0.85 },
  }), [state]);

  React.useEffect(() => {
    if (materialRef.current) {
      const targetIntensity = INTENSITY_MAP[state] || 0.15;
      const targetColor = COLOR_MAP[state] || new THREE.Color('#4dd0e1');
      
      const animate = () => {
        if (materialRef.current) {
          materialRef.current.uniforms.uIntensity.value += (targetIntensity - materialRef.current.uniforms.uIntensity.value) * 0.05;
          materialRef.current.uniforms.uColor.value.lerp(targetColor, 0.03);
        }
        requestAnimationFrame(animate);
      };
      const animId = requestAnimationFrame(animate);
      return () => cancelAnimationFrame(animId);
    }
  }, [state]);

  React.useEffect(() => {
    if (meshRef.current) {
      let time = 0;
      const rotate = () => {
        if (meshRef.current) {
          time += 0.016;
          meshRef.current.rotation.y = time * 0.1;
          meshRef.current.rotation.x = time * 0.05;
          if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = time;
          }
        }
        requestAnimationFrame(rotate);
      };
      const rotId = requestAnimationFrame(rotate);
      return () => cancelAnimationFrame(rotId);
    }
  }, []);

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[1.6, 64]} />
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function Particles() {
  const pointsRef = React.useRef(null);

  const { positions, colors } = React.useMemo(() => {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const radius = 2.2 + Math.random() * 1.2;
      
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = radius * Math.cos(phi);
      
      colors[i * 3] = 0.3 + Math.random() * 0.3;
      colors[i * 3 + 1] = 0.8 + Math.random() * 0.2;
      colors[i * 3 + 2] = 0.9 + Math.random() * 0.1;
    }
    
    return { positions, colors };
  }, []);

  React.useEffect(() => {
    if (pointsRef.current) {
      let time = 0;
      const rotate = () => {
        if (pointsRef.current) {
          time += 0.016;
          pointsRef.current.rotation.y = time * 0.02;
          pointsRef.current.rotation.x = time * 0.01;
        }
        requestAnimationFrame(rotate);
      };
      const rotId = requestAnimationFrame(rotate);
      return () => cancelAnimationFrame(rotId);
    }
  }, []);

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={colors.length / 3}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.025}
        vertexColors
        transparent
        opacity={0.5}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

function Ring({ speed }) {
  const ringRef = React.useRef(null);

  React.useEffect(() => {
    if (ringRef.current) {
      let time = 0;
      const rotate = () => {
        if (ringRef.current) {
          time += 0.016;
          ringRef.current.rotation.z = time * speed;
        }
        requestAnimationFrame(rotate);
      };
      const rotId = requestAnimationFrame(rotate);
      return () => cancelAnimationFrame(rotId);
    }
  }, [speed]);

  return (
    <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
      <torusGeometry args={[2.8, 0.015, 16, 100]} />
      <meshBasicMaterial color="#4dd0e1" transparent opacity={0.25} />
    </mesh>
  );
}

const STATUS_CONFIG = {
  idle: {
    label: 'Standby',
    detail: 'Awaiting command',
    accent: 'from-cyan-300/50 via-sky-400/35 to-transparent',
    glow: 'rgba(86, 208, 255, 0.34)',
    pulse: [1, 1.02, 1],
    ringScale: [0.9, 1.02, 0.9],
    orbitDuration: 22,
    beamDuration: 12,
    barHeights: [0.25, 0.3, 0.4, 0.5, 0.4, 0.3, 0.25],
  },
  listening: {
    label: 'Listening',
    detail: 'Voice capture active',
    accent: 'from-cyan-200/70 via-sky-300/55 to-transparent',
    glow: 'rgba(110, 227, 255, 0.48)',
    pulse: [1, 1.05, 1],
    ringScale: [0.92, 1.12, 0.92],
    orbitDuration: 9,
    beamDuration: 6,
    barHeights: [0.35, 0.5, 0.75, 0.95, 0.75, 0.5, 0.35],
  },
  thinking: {
    label: 'Thinking',
    detail: 'Reasoning through context',
    accent: 'from-cyan-300/70 via-blue-400/55 to-transparent',
    glow: 'rgba(73, 179, 255, 0.56)',
    pulse: [1, 1.08, 0.98, 1],
    ringScale: [0.92, 1.18, 0.92],
    orbitDuration: 4.5,
    beamDuration: 2.8,
    barHeights: [0.2, 0.7, 0.38, 0.92, 0.38, 0.7, 0.2],
  },
  talking: {
    label: 'Speaking',
    detail: 'Neural voice streaming',
    accent: 'from-cyan-100/80 via-cyan-300/60 to-transparent',
    glow: 'rgba(140, 239, 255, 0.62)',
    pulse: [1, 1.1, 1],
    ringScale: [0.92, 1.15, 0.92],
    orbitDuration: 6.5,
    beamDuration: 3.6,
    barHeights: [0.42, 0.82, 0.58, 1, 0.58, 0.82, 0.42],
  },
};

const ORBIT_POINTS = [
  { top: '10%', left: '50%' },
  { top: '23%', left: '79%' },
  { top: '50%', left: '90%' },
  { top: '77%', left: '79%' },
  { top: '90%', left: '50%' },
  { top: '77%', left: '21%' },
  { top: '50%', left: '10%' },
  { top: '23%', left: '21%' },
];

function getRingSpeed(state) {
  if (state === 'listening') return 0.8;
  if (state === 'thinking') return 1.5;
  if (state === 'talking') return 1.2;
  return 0.3;
}

function getVisualState(state, speaking) {
  if (state === 'talking' || speaking) {
    return 'talking';
  }
  if (state === 'listening') {
    return 'listening';
  }
  if (state === 'thinking') {
    return 'thinking';
  }
  return 'idle';
}

export default function Orb({ state = 'idle', speaking = false }) {
  const visualState = getVisualState(state, speaking);
  const config = STATUS_CONFIG[visualState];
  const ringSpeed = getRingSpeed(visualState);

  return (
    <div className="relative aspect-square w-full max-w-[420px]">
      <div className="absolute inset-0">
        <Canvas
          camera={{ position: [0, 0, 5], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          style={{ background: 'transparent' }}
        >
          <Float speed={2} rotationIntensity={0.2} floatIntensity={0.3}>
            <OrbMesh state={visualState} />
          </Float>
          <Particles />
          <Ring speed={ringSpeed} />
        </Canvas>
      </div>

      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute inset-[10%] rounded-full blur-3xl"
          animate={{ opacity: [0.45, 0.92, 0.45], scale: config.pulse }}
          transition={{ duration: visualState === 'thinking' ? 2.2 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            background: `radial-gradient(circle, ${config.glow} 0%, rgba(19, 61, 107, 0.14) 48%, transparent 76%)`,
          }}
        />

      <motion.div
        className={`absolute inset-[5%] rounded-full bg-linear-to-br ${config.accent} opacity-40 blur-2xl`}
        animate={{ rotate: 360 }}
        transition={{ duration: config.orbitDuration, repeat: Infinity, ease: 'linear' }}
      />

      <div className="absolute inset-0 rounded-full border border-cyan-300/10 bg-[radial-gradient(circle_at_center,rgba(0,30,54,0.55),rgba(0,0,0,0.08)_58%,transparent_75%)] shadow-[inset_0_0_100px_rgba(40,167,255,0.08),0_0_70px_rgba(0,158,255,0.08)]" />

      <motion.div
        className="absolute inset-[10%] rounded-full border border-cyan-200/20"
        animate={{ scale: config.ringScale, opacity: [0.2, 0.72, 0.2] }}
        transition={{ duration: visualState === 'thinking' ? 2.1 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
      />

      <motion.div
        className="absolute inset-[18%] rounded-full border border-cyan-200/25"
        animate={{ rotate: 360 }}
        transition={{ duration: config.orbitDuration, repeat: Infinity, ease: 'linear' }}
      >
        {ORBIT_POINTS.map((point, index) => (
          <motion.span
            key={index}
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-200 shadow-[0_0_14px_rgba(125,241,255,0.9)]"
            style={{ top: point.top, left: point.left }}
            animate={{
              scale: visualState === 'idle' ? [0.75, 1.05, 0.75] : [0.85, 1.35, 0.85],
              opacity: visualState === 'thinking' ? [0.3, 1, 0.45] : [0.35, 0.9, 0.35],
            }}
            transition={{
              duration: visualState === 'thinking' ? 1.3 : 1.9,
              repeat: Infinity,
              delay: index * 0.12,
              ease: 'easeInOut',
            }}
          />
        ))}
      </motion.div>

      <motion.div
        className="absolute inset-[19%] rounded-full opacity-70"
        style={{
          background:
            'conic-gradient(from 180deg, transparent 0deg, rgba(163, 241, 255, 0.9) 54deg, transparent 120deg, transparent 360deg)',
          maskImage: 'radial-gradient(circle, transparent 56%, black 57%, black 63%, transparent 64%)',
          WebkitMaskImage: 'radial-gradient(circle, transparent 56%, black 57%, black 63%, transparent 64%)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration: config.beamDuration, repeat: Infinity, ease: 'linear' }}
      />

      <motion.div
        className="absolute inset-[24%] rounded-full border border-cyan-100/10 bg-[linear-gradient(145deg,rgba(7,18,29,0.9),rgba(7,13,20,0.66))] backdrop-blur-xl shadow-[inset_0_0_40px_rgba(0,174,255,0.12)]"
        animate={{ scale: config.pulse }}
        transition={{ duration: visualState === 'thinking' ? 1.8 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
      >
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_25%,rgba(193,246,255,0.18),transparent_40%),radial-gradient(circle_at_70%_70%,rgba(31,164,255,0.15),transparent_45%)]" />

        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          <div className="text-center group">
            <motion.div 
               animate={{ opacity: [0.6, 1, 0.6] }}
               transition={{ duration: 3, repeat: Infinity }}
               className="text-[14px] font-bold uppercase tracking-[0.6em] text-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]"
            >
              Jarvis
            </motion.div>
            
            <motion.div
              key={config.label}
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="mt-4 text-3xl font-black uppercase tracking-[0.15em] text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            >
              {config.label}
            </motion.div>
            
            <motion.div 
              animate={{ width: ['20%', '60%', '20%'] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="mx-auto mt-6 h-[2px] bg-linear-to-r from-transparent via-cyan-400 to-transparent opacity-40"
            />
          </div>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
