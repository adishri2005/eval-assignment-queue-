// File: app/page.tsx
// Purpose: Login page — email + password form with Zod validation, loading state,
//          and role-based redirect after successful authentication.
//          ARIA: live region for form errors, proper label associations.

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { login as apiLogin } from '@/lib/api';
import type { ApiError } from '@/lib/api';

// ---------------------------------------------------------------------------
// Zod schema — mirrors the backend validation
// ---------------------------------------------------------------------------
const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, user, isLoading: authLoading } = useAuth();

  const [formData, setFormData] = useState<LoginFormData>({
    email: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // If already authenticated, redirect to the correct dashboard
  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated && user) {
      if (user.role === 'coordinator') {
        router.replace('/coordinator');
      } else if (user.role === 'evaluator' && user.evaluatorId) {
        router.replace(`/evaluator/${user.evaluatorId}`);
      }
    }
  }, [isAuthenticated, user, authLoading, router]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof LoginFormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
    if (formError) setFormError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setFormError(null);

    const result = loginSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginFormData, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof LoginFormData;
        if (!fieldErrors[field]) {
          fieldErrors[field] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await apiLogin(result.data.email, result.data.password);

      login(response.token, response.role, response.userId, response.evaluatorId);

      toast.success('Login successful!', {
        description: `Welcome back! Redirecting to your ${response.role} dashboard...`,
      });

      if (response.role === 'coordinator') {
        router.push('/coordinator');
      } else if (response.role === 'evaluator' && response.evaluatorId) {
        router.push(`/evaluator/${response.evaluatorId}`);
      }
    } catch (err) {
      const apiError = err as ApiError;
      const message = apiError.error || 'Please check your credentials and try again.';
      setFormError(message);
      toast.error('Login failed', { description: message });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Show loading while checking auth state
  if (authLoading) {
    return (
      <div className="loading-page" role="status" aria-label="Checking authentication">
        <div className="spinner" aria-hidden="true" />
        <p className="loading-page__text">Loading...</p>
      </div>
    );
  }

  return (
    <div className="page--centered">
      {/* Background decorative elements */}
      <div className="login-bg" aria-hidden="true">
        <div className="login-bg__orb login-bg__orb--1" />
        <div className="login-bg__orb login-bg__orb--2" />
        <div className="login-bg__orb login-bg__orb--3" />
      </div>

      <main className="login-wrapper anim-fade-in">
        {/* Logo / Header */}
        <header className="login-header">
          <div className="login-header__icon-wrap" aria-hidden="true">
            <svg
              className="login-header__icon"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h1 className="login-header__title">EAQ</h1>
          <p className="login-header__subtitle">
            Evaluator Assignment Queue
          </p>
        </header>

        {/* Login Card */}
        <section className="card--login" aria-labelledby="login-heading">
          <h2 id="login-heading" className="login-form-title">Sign in to your account</h2>

          {/* Form-level error (ARIA live region) */}
          <div aria-live="polite" aria-atomic="true">
            {formError && (
              <div className="form-error-banner" role="alert">
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{formError}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} id="login-form" noValidate>
            {/* Email Field */}
            <div className="form-group">
              <label htmlFor="email-input" className="input-label">
                Email address
              </label>
              <input
                id="email-input"
                name="email"
                type="email"
                autoComplete="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="you@xebia.com"
                className={`input ${errors.email ? 'input--error anim-shake' : ''}`}
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? 'email-error' : undefined}
              />
              {errors.email && (
                <p id="email-error" className="input-error" role="alert">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label htmlFor="password-input" className="input-label">
                Password
              </label>
              <input
                id="password-input"
                name="password"
                type="password"
                autoComplete="current-password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className={`input ${errors.password ? 'input--error anim-shake' : ''}`}
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? 'password-error' : undefined}
              />
              {errors.password && (
                <p id="password-error" className="input-error" role="alert">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Submit Button */}
            <button
              id="login-submit-btn"
              type="submit"
              disabled={isSubmitting}
              className={`btn btn--primary btn--full btn--lg ${isSubmitting ? 'btn--loading' : ''}`}
              aria-busy={isSubmitting}
            >
              <span className="btn__label">
                {isSubmitting ? (
                  <>
                    <span className="spinner spinner--sm" aria-hidden="true" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </span>
            </button>
          </form>

          {/* Demo credentials hint */}
          <aside className="card--hint" aria-label="Demo credentials">
            <p className="card--hint__title">Demo credentials:</p>
            <div>
              <p className="card--hint__item">
                <span className="card--hint__label">Coordinator:</span>{' '}
                coordinator@xebia.com / Coord@123
              </p>
              <p className="card--hint__item">
                <span className="card--hint__label">Evaluator:</span>{' '}
                evaluator1@xebia.com / Eval@123
              </p>
            </div>
          </aside>
        </section>

        {/* Footer */}
        <footer>
          <p className="login-footer">
            Xebia Summer Internship 2026 — Sprint 1
          </p>
        </footer>
      </main>
    </div>
  );
}
