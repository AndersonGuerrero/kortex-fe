import React from 'react';

/**
 * Props para el componente KortexLogo SVG.
 */
interface KortexLogoProps extends React.SVGProps<SVGSVGElement> {
  /** Tamaño del ícono en píxeles (ancho y alto). */
  size?: number;
}

export const KortexLogo: React.FC<KortexLogoProps> = ({ size = 64, ...props }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ filter: 'drop-shadow(0px 4px 12px rgba(147, 51, 234, 0.3))' }}
      {...props}
    >
      <defs>
        {/* Degradado de fondo que combina con tu botón "Ingresar" */}
        <linearGradient id="kortexBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#a855f7" />   {/* Violeta Neón */}
          <stop offset="50%" stopColor="#6366f1" />  {/* Índigo */}
          <stop offset="100%" stopColor="#3b82f6" /> {/* Azul Eléctrico */}
        </linearGradient>

        {/* Degradado blanco translúcido para el símbolo interno */}
        <linearGradient id="symbolGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.6" />
        </linearGradient>
      </defs>

      {/* Caja contenedora redondeada idéntica a tu diseño original */}
      <rect width="100" height="100" rx="26" fill="url(#kortexBgGrad)" />

      {/* Símbolo Central: Una "K" tecnológica compuesta por nodos y vectores de extracción */}
      {/* Línea vertical izquierda (Eje de datos) */}
      <path
        d="M36 28V72"
        stroke="url(#symbolGrad)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      
      {/* Vector superior derecho (Nodo inteligente) */}
      <path
        d="M36 50L58 28"
        stroke="url(#symbolGrad)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      
      {/* Vector inferior derecho (Ancla geométrica de Layout) */}
      <path
        d="M45 41L61 72"
        stroke="url(#symbolGrad)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />

      {/* Puntos de control (Nodos que indican extracción de texto coordinada) */}
      <circle cx="58" cy="28" r="4" fill="#ffffff" />
      <circle cx="61" cy="72" r="4" fill="#ffffff" />
      <circle cx="36" cy="50" r="3" fill="#ffffff" />
    </svg>
  );
};