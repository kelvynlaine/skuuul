import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading, initialized } = useAuthStore();
  const location = useLocation();

  if (loading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ios-background-light dark:bg-ios-background-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-ios-blue-light dark:border-ios-blue-dark border-t-transparent rounded-full animate-spin"></div>
          <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-sm font-medium animate-pulse">
            Chargement de Skuuul...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};
