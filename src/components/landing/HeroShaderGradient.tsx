import React, { useState, useEffect } from 'react';
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';

export interface HeroShaderGradientProps {
  /** First brand color (defaults to NamasteQR Electric Blue) */
  color1?: string;
  /** Second brand color (defaults to Warm Soft Amber) */
  color2?: string;
  /** Third brand color (defaults to Deep Indigo) */
  color3?: string;
  /** Motion speed: lower is slower (defaults to 0.06 for tranquil flow) */
  speed?: number;
  /** Wave strength: lower creates softer ripples (defaults to 1.6) */
  strength?: number;
  /** Grain overlay: 'on' or 'off' (defaults to 'on' for soft texture) */
  grain?: 'on' | 'off';
  /** Brightness multiplier (defaults to 1.05) */
  brightness?: number;
  /** Opacity of the canvas (defaults to 0.5) */
  opacity?: number;
  /** Additional wrapper classes */
  className?: string;
}

export const HeroShaderGradient: React.FC<HeroShaderGradientProps> = ({
  color1 = '#2563eb', // Brand Blue (blue-600)
  color2 = '#fbbf24', // Warm Soft Amber (amber-400)
  color3 = '#4f46e5', // Brand Indigo (indigo-600)
  speed = 0.05,       // Serene, tranquil flow (eliminates initial jitter)
  strength = 1.4,     // Subtle, soft waves
  grain = 'on',       // Light grain texture
  brightness = 1.05,
  opacity = 0.45,
  className = '',
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Graceful mount fade-in ensures canvas is fully initialized before becoming visible
    const timer = setTimeout(() => {
      setMounted(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  return (
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
  );
};
