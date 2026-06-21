import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { useAuthStore } from './store/authStore';

export default function App() {
  const { initialize, loading, initialized } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (loading && !initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ios-background-light dark:bg-ios-background-dark">
        <div className="flex flex-col items-center gap-3">
          {/* Circular iOS-like glassmorphic loading spinner */}
          <div className="w-12 h-12 border-4 border-ios-blue-light dark:border-ios-blue-dark border-t-transparent rounded-full animate-spin"></div>
          <p className="text-ios-label-secondaryLight dark:text-ios-label-secondaryDark text-sm font-semibold animate-pulse">
            Initialisation de Skuuul...
          </p>
        </div>
      </div>
    );
  }

  return <RouterProvider router={router} />;
}
