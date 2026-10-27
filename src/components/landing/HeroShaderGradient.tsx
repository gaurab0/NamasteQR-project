import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';

export interface HeroShaderGradientProps {
  /** First brand color (defaults to NamasteQR Electric Blue) */
  color1?: string;
  /** Second brand color (defaults to Warm Soft Amber) */
  color2?: string;
  /** Third brand color (defaults to Deep Indigo) */
  color3?: string;
  /** Motion speed: lower is slower (defaults to 0.05 for tranquil flow) */
  speed?: number;
  /** Wave strength: lower creates softer ripples (defaults to 1.4) */
  strength?: number;
  /** Grain overlay: 'on' or 'off' (defaults to 'on' for soft texture) */
  grain?: 'on' | 'off';
  /** Brightness multiplier (defaults to 1.05) */
  brightness?: number;
  /** Opacity of the canvas (defaults to 0.45) */
  opacity?: number;
  /** Additional wrapper classes */
  className?: string;
}

/**
 * Safely determines if WebGL / hardware acceleration is operational.
 * Prevents crashes in headless browsers (e.g. VirusTotal, BitDefender crawlers, CI environments).
 */
function isWebGLSupported(): boolean {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');
    return Boolean(gl);
  } catch {
    return false;
  }
}

/**
 * Lightweight, beautiful CSS mesh gradient fallback used when:
 * 1. WebGL is unavailable (headless security scanners, older hardware, disabled GPU).
 * 2. Three.js throws a context loss or initialization exception.
 */
const FallbackCSSGradient: React.FC<{
  color1: string;
  color2: string;
  color3: string;
  opacity: number;
  className?: string;
}> = ({ color1, color2, color3, opacity, className = '' }) => (
  <div
    className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none ${className}`}
    style={{
      background: `
        radial-gradient(ellipse 80% 60% at 15% 15%, ${color1}25 0%, transparent 65%),
        radial-gradient(ellipse 70% 50% at 85% 25%, ${color2}25 0%, transparent 60%),
        radial-gradient(ellipse 85% 70% at 50% 85%, ${color3}22 0%, transparent 70%)
      `,
      opacity,
    }}
    aria-hidden="true"
  >
    <div className="absolute inset-0 bg-white/45 pointer-events-none" />
  </div>
);

/**
 * Isolated error boundary that prevents any Three.js or WebGL runtime error
 * from escalating to the root application ErrorBoundary.
 */
class ShaderErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log silently for diagnostics without crashing parent tree
    console.warn('WebGL/ShaderGradient caught locally, using graceful CSS fallback:', error?.message || error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export const HeroShaderGradient: React.FC<HeroShaderGradientProps> = ({
  color1 = '#2563eb', // Brand Blue (blue-600)
  color2 = '#fbbf24', // Warm Soft Amber (amber-400)
  color3 = '#4f46e5', // Brand Indigo (indigo-600)
  speed = 0.05,       // Serene, tranquil flow
  strength = 1.4,     // Subtle, soft waves
  grain = 'on',       // Light grain texture
  brightness = 1.05,
  opacity = 0.45,
  className = '',
}) => {
  const [mounted, setMounted] = useState(false);
  const [canRenderWebGL, setCanRenderWebGL] = useState(false);

  useEffect(() => {
    // Verify WebGL availability in the client browser
    const supported = isWebGLSupported();
    setCanRenderWebGL(supported);

    // Graceful mount fade-in
    const timer = setTimeout(() => {
      setMounted(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  const fallback = (
    <FallbackCSSGradient
      color1={color1}
      color2={color2}
      color3={color3}
      opacity={opacity}
      className={className}
    />
  );

  // If client environment cannot support WebGL, render the CSS fallback directly
  if (!canRenderWebGL) {
    return fallback;
  }

  return (
    <ShaderErrorBoundary fallback={fallback}>
      <div
        className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none transition-opacity duration-700 ease-out ${className}`}
        style={{ opacity: mounted ? opacity : 0 }}
        aria-hidden="true"
      >
        <ShaderGradientCanvas
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
          }}
          lazyLoad={false}
          pointerEvents="none"
          pixelDensity={1.2}
          fov={45}
        >
          <ShaderGradient
            type="plane"
            animate="on"
            enableTransition={false}
            smoothTime={0}
            uSpeed={speed}
            uStrength={strength}
            uDensity={1.3}
            uFrequency={4.5}
            uAmplitude={1}
            color1={color1}
            color2={color2}
            color3={color3}
            grain={grain}
            lightType="3d"
            brightness={brightness}
            envPreset="city"
            cDistance={3.6}
            cPolarAngle={90}
            cAzimuthAngle={180}
            cameraZoom={1}
            rotationX={0}
            rotationY={10}
            rotationZ={50}
            wireframe={false}
          />
        </ShaderGradientCanvas>

        {/* Gentle soft white diffusion overlay so the gradient remains subtle all the way across the page */}
        <div className="absolute inset-0 bg-white/45 pointer-events-none" />
      </div>
    </ShaderErrorBoundary>
  );
};
