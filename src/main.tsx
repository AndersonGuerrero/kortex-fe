import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import './index.css'
import './i18n'
import App from './App.tsx'

// Aplicar tema tempranamente para evitar flash de tema incorrecto
const savedTheme = localStorage.getItem('kortex-theme') || 'dark';
document.documentElement.setAttribute('data-theme', savedTheme);

/**
 * Auth0 configuration from Vite environment variables.
 * These must be set in frontend/.env for the Auth0 integration to work.
 */
const auth0Domain = import.meta.env.VITE_AUTH0_DOMAIN || '';
const auth0ClientId = import.meta.env.VITE_AUTH0_CLIENT_ID || '';
const auth0Audience = import.meta.env.VITE_AUTH0_AUDIENCE || '';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Auth0Provider
      domain={auth0Domain}
      clientId={auth0ClientId}
      authorizationParams={{
        redirect_uri: `${window.location.origin}/callback`,
        audience: auth0Audience,
        scope: 'openid profile email',
      }}
    >
      <App />
    </Auth0Provider>
  </StrictMode>,
)
