import React from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { LoginPage } from './LoginPage';
import type { Role } from '../types';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, only these roles may view children. Others see the fallback. */
  allowedRoles?: Role[];
  /** Optional custom fallback for authenticated-but-wrong-role users. */
  fallback?: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles, fallback }) => {
  const { isAuthenticated, isLoading, hasRole } = useAuth();

  if (isLoading) {
    return (
      <div className="auth-loading">
        <span>Loading...</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (allowedRoles && !hasRole(...allowedRoles)) {
    return (
      fallback ?? (
        <div className="auth-forbidden">
          <h2>Access denied</h2>
          <p>You don't have permission to view this page.</p>
        </div>
      )
    );
  }

  return <>{children}</>;
};