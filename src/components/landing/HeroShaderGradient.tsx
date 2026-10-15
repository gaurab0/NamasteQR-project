import React from 'react';
import { ShaderGradientCanvas, ShaderGradient } from '@shadergradient/react';

export interface HeroShaderGradientProps {
  /** First brand color (defaults to NamasteQR Electric Blue) */
  color1?: string;
  /** Second brand color (defaults to Warm Amber) */
  color2?: string;
  /** Third brand color (defaults to Deep Indigo) */
  color3?: string;
  /** Motion speed: lower is slower (defaults to 0.1 for slow subtle flow) */
  speed?: number;
  /** Wave strength: lower creates softer ripples (defaults to 2.4) */
  strength?: number;
  /** Grain overlay: 'on' or 'off' (defaults to 'on' for soft texture) */
  grain?: 'on' | 'off';
  /** Brightness multiplier (defaults to 1.1) */
  brightness?: number;
  /** Opacity of the canvas (defaults to 0.65) */
  opacity?: number;
  /** Additional wrapper classes */
  className?: string;
}

export const HeroShaderGradient: React.FC<HeroShaderGradientProps> = ({
  color1 = '#2563eb', // Brand Blue (blue-600)
  color2 = '#f59e0b', // Brand Amber (amber-500)
  color3 = '#4f46e5', // Brand Indigo (indigo-600)
  speed = 0.1,        // Slow, serene motion
  strength = 2.4,     // Subtle, soft waves
  grain = 'on',       // Light grain texture
  brightness = 1.1,
  opacity = 0.65,
  className = '',
}) => {
  return (
    <div
      className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none select-none z-0 ${className}`}
      style={{ opacity }}
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
        pixelDensity={1.2}
        fov={45}
      >
        <ShaderGradient
          type="plane"
          animate="on"
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

      {/* Gentle soft white fade overlay to blend seamlessly into the page */}
      <div className="absolute inset-0 bg-gradient-to-b from-white/40 via-white/10 to-zinc-50/80 pointer-events-none" />
    </div>
  );
};
