import React from 'react';
import { Navigate } from 'react-router-dom';
import { apiService } from '../services/api';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Componente contenedor para proteger rutas que requieren autenticación.
 * Redirige al login si el usuario no tiene una sesión activa.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const isAuth = apiService.isAuthenticated();

  if (!isAuth) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};
