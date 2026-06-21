import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { user, profile, loading, initialized } = useAuthStore();

  if (loading || !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ios-background-light dark:bg-ios-background-dark">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-ios-blue-light dark:border-ios-blue-dark border-t-transparent rounded-full animate-spin"></div>
          <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-sm font-medium animate-pulse">
            Vérification des droits administrateur...
          </p>
        </div>
      </div>
    );
  }

  if (!user || (profile?.role !== 'admin' && profile?.role !== 'creator')) {
    // Redirect non-privileged users to community feed
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
