// File: components/ProtectedRoute.tsx
// Purpose: Client component that guards routes by checking auth state.
//          Redirects unauthenticated users to login, and unauthorized users
//          (wrong role or wrong evaluatorId) to the appropriate page.

'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  /** The required role to access this route */
  requiredRole: 'coordinator' | 'evaluator';
  /** For evaluator routes: the evaluatorId from the URL params to verify ownership */
  evaluatorId?: string;
  /** The child content to render if authorized */
  children: React.ReactNode;
}

export default function ProtectedRoute({
  requiredRole,
  evaluatorId,
  children,
}: ProtectedRouteProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    // Not logged in → redirect to login
    if (!isAuthenticated || !user) {
      router.replace('/');
      return;
    }

    // Wrong role → redirect to login
    if (user.role !== requiredRole) {
      router.replace('/');
      return;
    }

    // For evaluator routes: verify the URL evaluatorId matches the token's evaluatorId
    if (requiredRole === 'evaluator' && evaluatorId && user.evaluatorId !== evaluatorId) {
      router.replace('/');
      return;
    }
  }, [isLoading, isAuthenticated, user, requiredRole, evaluatorId, router]);

  // Show loading spinner while auth state is hydrating
  if (isLoading) {
    return (
      <div className="loading-page">
        <div className="spinner" />
        <p className="loading-page__text">Loading...</p>
      </div>
    );
  }

  // Don't render children until auth is verified
  if (!isAuthenticated || !user || user.role !== requiredRole) {
    return null;
  }

  // For evaluator routes: don't render if evaluatorId doesn't match
  if (requiredRole === 'evaluator' && evaluatorId && user.evaluatorId !== evaluatorId) {
    return null;
  }

  return <>{children}</>;
}
