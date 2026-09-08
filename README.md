# Kortex Frontend

Frontend del proyecto Kortex: una aplicación para extracción y etiquetado de datos
de documentos PDF asistida por modelos de IA. Construido con **React 19
(TypeScript)**, **Vite** y **pnpm**, con autenticación vía **Auth0**,
internacionalización (español/inglés) y facturación con **Wompi**.

## Requisitos previos

- [nvm](https://github.com/nvm-sh/nvm) (recomendado) para gestionar la versión de Node.
- **Node.js 24**.
- **pnpm** como gestor de paquetes. Si no lo tienes, actívalo con Corepack
  (incluido en Node): `corepack enable pnpm`, o instálalo con `npm i -g pnpm`.

## Configuración y desarrollo

Todos los comandos se ejecutan desde la raíz del repositorio (este directorio es
el frontend).

1. Selecciona la versión de Node:
   ```bash
   nvm use 24
   ```

2. Instala las dependencias:
   ```bash
   pnpm install
   ```

3. Crea tu archivo de variables de entorno a partir del ejemplo y complétalo:
   ```bash
   cp .env.example .env
   ```

4. Inicia el servidor de desarrollo:
   ```bash
   pnpm run dev
   ```
   Disponible por defecto en [http://localhost:5173](http://localhost:5173).

## Variables de entorno

Definidas en `.env` (ver `.env.example`). Todas usan el prefijo `VITE_` para ser
expuestas al cliente.

| Variable | Descripción |
| --- | --- |
| `VITE_API_BASE_URL` | URL base de la API del backend (Django). Por defecto `http://127.0.0.1:8000`. |
| `VITE_AUTH0_DOMAIN` | Dominio del tenant de Auth0 (ej. `mi-app.us.auth0.com`). |
| `VITE_AUTH0_CLIENT_ID` | Client ID de la aplicación SPA en Auth0. |
| `VITE_AUTH0_AUDIENCE` | Identificador de la API registrada en Auth0. |
| `VITE_WOMPI_PUBLIC_KEY` | Llave pública de Wompi para tokenización de tarjetas (`pub_test_*` / `pub_prod_*`). |
| `VITE_WOMPI_BASE_URL` | URL base de la API de Wompi (sandbox por defecto). |

> Nota: solo se usa la **llave pública** de Wompi en el frontend.

## Scripts disponibles

- `pnpm run dev`: Servidor de desarrollo con recarga rápida (HMR).
- `pnpm run build`: Chequeo de tipos (`tsc -b`) y build de producción en `dist/`.
- `pnpm run preview`: Sirve localmente el contenido compilado en `dist/`.
- `pnpm run lint`: Ejecuta ESLint sobre el proyecto.
- `pnpm run test`: Ejecuta la suite de pruebas con Vitest.
- `pnpm run test:coverage`: Ejecuta las pruebas y genera reporte de cobertura.

## Estructura del proyecto

- `src/`: Código fuente.
  - `main.tsx`: Punto de entrada. Monta React y envuelve la app en `Auth0Provider`.
  - `App.tsx`: Componente raíz. Define el enrutamiento (`react-router-dom`) y la
    vista de Dashboard.
  - `components/`: Componentes de la aplicación.
    - `Login.tsx`, `Callback.tsx`, `ProtectedRoute.tsx`: Flujo de autenticación Auth0.
    - `ProjectDetails.tsx`, `Etiquetado.tsx`, `PdfEditor.tsx`: Detalle de tipos de
      documento, etiquetado y edición de PDF.
    - `ModelTraining.tsx`: Gestión y entrenamiento del modelo de IA.
    - `Billing.tsx`: Facturación e integración con Wompi.
    - `KortexLogo.tsx`, `LanguageToggle.tsx`: Componentes de UI.
  - `services/api.ts`: Cliente de la API del backend y tipos compartidos.
  - `i18n/`: Configuración de internacionalización.
    - `index.ts`: Inicialización de i18next (idioma por defecto: `es`, fallback `es`).
    - `locales/es`, `locales/en`: Traducciones por namespace.
  - `assets/`: Imágenes e iconos importados desde el código.
- `public/`: Archivos estáticos servidos tal cual (ej. `favicon.svg`).
- `index.html`: HTML raíz. Carga `pdf.js` desde CDN para la previsualización de PDF.
- `vite.config.ts`: Configuración de Vite y de Vitest (entorno `jsdom`).
- `tsconfig*.json`: Configuración de TypeScript.
- `wrangler.jsonc`: Configuración de despliegue en Cloudflare Workers.

## Rutas

| Ruta | Vista | Acceso |
| --- | --- | --- |
| `/login` | Inicio de sesión | Pública |
| `/callback` | Callback de Auth0 | Pública |
| `/` | Dashboard | Protegida |
| `/document-type/:id` | Detalle de tipo de documento | Protegida |
| `/models` | Entrenamiento de modelos | Protegida |
| `/document/:id/tag` | Etiquetado de documento | Protegida |
| `/document/:id/edit` | Edición de PDF | Protegida |
| `/billing` | Facturación | Protegida |

Cualquier otra ruta redirige a `/`.

## Internacionalización

La app soporta español (por defecto) e inglés mediante `i18next` /
`react-i18next`. El idioma seleccionado se persiste en `localStorage`
(`kortex-language`). Las traducciones están organizadas por namespace en
`src/i18n/locales/{es,en}/`.

## Despliegue

El proyecto se despliega como una SPA en **Cloudflare Workers** usando
[Wrangler](https://developers.cloudflare.com/workers/wrangler/) (incluido como
dependencia de desarrollo). La configuración está en `wrangler.jsonc`, que sirve
el contenido de `dist/` con enrutamiento SPA (`not_found_handling:
single-page-application`).

```bash
pnpm run build
pnpm exec wrangler deploy
```

## Pruebas

Las pruebas usan **Vitest** con **Testing Library** y entorno `jsdom`. Los
archivos de test viven junto al código (`*.test.tsx`) y el setup global está en
`src/setupTests.ts`.
