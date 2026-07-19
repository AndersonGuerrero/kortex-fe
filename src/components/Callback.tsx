import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';
import { KortexLogo } from './KortexLogo';

/**
 * Callback component that handles the Auth0 redirect after
 * Google OAuth2 authentication.
 *
 * After Auth0 redirects back to /callback with the authorization code,
 * this component:
 *  1. Waits for Auth0 to finish processing the redirect.
 *  2. Retrieves the access_token from Auth0.
 *  3. Sends it to the backend to exchange for SimpleJWT tokens.
 *  4. Stores the JWT tokens and navigates to the dashboard.
 */
export const Callback: React.FC = () => {
  const { t } = useTranslation('callback');
  const {
    isAuthenticated,
    isLoading,
    getAccessTokenSilently,
    error,
  } = useAuth0();
  const navigate = useNavigate();
  const exchangeCalled = useRef(false);

  useEffect(() => {
    // Prevent double-execution in StrictMode
    if (exchangeCalled.current) return;

    const exchangeToken = async () => {
      if (isLoading) return;

      if (error) {
        console.error('Auth0 callback error:', error);
        navigate('/login', { replace: true });
        return;
      }

      if (!isAuthenticated) {
        navigate('/login', { replace: true });
        return;
      }

      exchangeCalled.current = true;

      try {
        // Get the Auth0 access_token
        const accessToken = await getAccessTokenSilently();

        // Exchange Auth0 token for Kortex SimpleJWT tokens
        await apiService.loginWithAuth0(accessToken);

        // Redirect to the dashboard
        navigate('/', { replace: true });
      } catch (err: unknown) {
        console.error('Error exchanging Auth0 token:', err);
        exchangeCalled.current = false;
        navigate('/login', { replace: true });
      }
    };

    exchangeToken();
  }, [isAuthenticated, isLoading, error, getAccessTokenSilently, navigate]);

  return (
    <div className="login-container">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <div className="login-header">
          <div className="login-logo">
            <KortexLogo size={40} />
          </div>
          <h1 className="login-title">Kortex</h1>
          <p className="login-subtitle">
            {error ? t('authError') : t('loading')}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Callback;
