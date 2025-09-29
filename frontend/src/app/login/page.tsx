import { LoginForm } from '@/components/auth/login-form';
import { AuthGuard } from '@/components/auth/auth-guard';

export default function LoginPage() {
  return (
    <AuthGuard requireAuth={false}>
      <LoginForm />
    </AuthGuard>
  );
}