import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Home } from 'lucide-react';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/ui';
import { TextField } from '@/components/ui/Fields';
import { ApiError } from '@/lib/api';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});
type FormValues = z.infer<typeof schema>;

export const Login = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = async ({ email, password }: FormValues) => {
    setServerError(null);
    try {
      await login(email, password);
      navigate('/', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : 'Unable to sign in. Try again.');
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-navy-900 to-brand-700 p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10">
            <Home className="h-7 w-7" />
          </div>
          <div>
            <div className="text-2xl font-bold">HRMS</div>
            <div className="text-xs text-white/70">House Rental Management System</div>
          </div>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="card space-y-4 p-8">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Welcome back</h1>
            <p className="text-sm text-slate-500">Sign in to manage your rentals.</p>
          </div>
          {serverError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {serverError}
            </div>
          )}
          <TextField label="Email" type="email" autoComplete="username" error={errors.email?.message} {...register('email')} />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            error={errors.password?.message}
            {...register('password')}
          />
          <Button type="submit" loading={isSubmitting} className="w-full">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
};
