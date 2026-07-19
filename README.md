# Kortex Frontend

Este es el frontend del proyecto Kortex, desarrollado utilizando **React (TypeScript)**, **Vite** y **pnpm** como gestor de paquetes.

## Requisitos Previos

- [nvm (Node Version Manager)](https://github.com/nvm-sh/nvm) instalado.
- Node.js versión **24** (que incluye `pnpm`).

## Configuración y Desarrollo

1. Asegúrate de estar en el directorio `frontend/`:
   ```bash
   cd frontend
   ```

2. Activa la versión correcta de Node.js con `nvm`:
   ```bash
   nvm use v24
   ```

3. Instala las dependencias del proyecto:
   ```bash
   pnpm install
   ```

4. Inicia el servidor de desarrollo local:
   ```bash
   pnpm run dev
   ```
   El servidor estará disponible por defecto en [http://localhost:5173](http://localhost:5173).

## Scripts Disponibles

- `pnpm run dev`: Inicia el servidor de desarrollo local con recarga rápida (HMR).
- `pnpm run build`: Compila el proyecto con TypeScript y genera los archivos optimizados para producción en la carpeta `dist/`.
- `pnpm run lint`: Ejecuta ESLint para analizar y reportar problemas de estilo o errores de código.
- `pnpm run preview`: Levanta un servidor local para previsualizar los archivos compilados en `dist/`.

## Estructura del Proyecto

- `src/`: Directorio principal del código fuente.
  - `main.tsx`: Punto de entrada del frontend.
  - `App.tsx`: Componente raíz de la aplicación.
  - `assets/`: Imágenes, iconos y otros recursos estáticos importados en el código.
- `public/`: Archivos estáticos servidos directamente (como `favicon.svg`).
- `vite.config.ts`: Configuración de Vite.
- `tsconfig.json`: Configuración general de TypeScript.
