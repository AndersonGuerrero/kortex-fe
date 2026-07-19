import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useTranslation } from 'react-i18next';
import { User, Lock, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { apiService } from '../services/api';
import { KortexLogo } from './KortexLogo';
import { LanguageToggle } from './LanguageToggle';
import './Login.css';

/**
 * Pantalla de Login con diseño Premium y Glassmorphism.
 * Soporta autenticación JWT tradicional (usuario/contraseña) y
 * login social con Google via Auth0.
 */
export const Login: React.FC = () => {
  const { t } = useTranslation('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const { loginWithRedirect } = useAuth0();

  /**
   * Maneja el login tradicional con usuario y contraseña.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) {
      setError(t('errors.fieldsRequired'));
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      await apiService.login(username, password);
      // Login exitoso, redirigimos al dashboard principal
      navigate('/', { replace: true });
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError(t('errors.unexpected'));
      }
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Inicia el flujo OAuth2 con Google mediante Auth0.
   */
  const handleGoogleLogin = () => {
    loginWithRedirect({
      authorizationParams: {
        connection: 'google-oauth2',
      },
    });
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-language-toggle">
          <LanguageToggle />
        </div>
        <div className="login-header">
          <div className="login-logo">
            <KortexLogo size={90} />
          </div>
          <h1 className="login-title">Kortex</h1>
          <p className="login-subtitle">{t('header.subtitle')}</p>
        </div>

        {error && (
          <div className="login-alert">
            <AlertCircle size={18} className="alert-icon" style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Botón de Google OAuth2 via Auth0 */}
        <button
          type="button"
          className="google-login-button"
          onClick={handleGoogleLogin}
          id="google-login-btn"
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="20" height="20">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>{t('google.continueWith')}</span>
        </button>

        {/* Separador visual */}
        <div className="login-divider">
          <span className="login-divider-line" />
          <span className="login-divider-text">{t('divider.or')}</span>
          <span className="login-divider-line" />
        </div>

        {/* Formulario de login tradicional */}
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="input-group">
            <label className="input-label" htmlFor="username">
              {t('form.usernameLabel')}
            </label>
            <div className="input-wrapper">
              <input
                className="login-input"
                type="text"
                id="username"
                placeholder={t('form.usernamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={isLoading}
                required
              />
              <User size={18} className="input-icon" />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label" htmlFor="password">
              {t('form.passwordLabel')}
            </label>
            <div className="input-wrapper">
              <input
                className="login-input login-input-pwd"
                type={showPassword ? 'text' : 'password'}
                id="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                required
              />
              <Lock size={18} className="input-icon" />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                title={showPassword ? t('form.hidePassword') : t('form.showPassword')}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <span className="spinner" />
                <span>{t('form.signingIn')}</span>
              </>
            ) : (
              <>
                <span>{t('form.submit')}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
export default Login;
