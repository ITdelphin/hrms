import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/auth/AuthContext';
import { useChangePassword, useSettings, useUpdateProfile, useUpdateSettings } from '@/api';
import { Button, Card, CardHeader, ErrorState, Spinner } from '@/components/ui';
import { TextField } from '@/components/ui/Fields';
import { setCurrency } from '@/lib/format';

const settingsSchema = z.object({
  currency: z.string().trim().regex(/^[A-Z]{3}$/, 'Currency must be a 3-letter code'),
  reminderDays: z.coerce.number().int().min(0).max(30),
});

const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Name is too short'),
  phone: z.string().trim().regex(/^\+?[0-9 \-()]{7,20}$/, 'Enter a valid phone number').or(z.literal('')),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(10, 'Use at least 10 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export const Settings = () => {
  const { owner, refreshOwner, logout } = useAuth();
  const navigate = useNavigate();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const updateProfile = useUpdateProfile();
  const changePassword = useChangePassword();
  const [notice, setNotice] = useState<string | null>(null);

  const settingsForm = useForm<z.infer<typeof settingsSchema>>({ resolver: zodResolver(settingsSchema) });
  const profileForm = useForm<z.infer<typeof profileSchema>>({ resolver: zodResolver(profileSchema) });
  const passwordForm = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    if (settings.data) {
      settingsForm.reset({ currency: settings.data.currency, reminderDays: settings.data.reminderDays });
    }
  }, [settings.data, settingsForm]);

  useEffect(() => {
    if (owner) profileForm.reset({ fullName: owner.fullName, phone: owner.phone ?? '' });
  }, [owner, profileForm]);

  const saveSettings = settingsForm.handleSubmit(async (values) => {
    const res = await updateSettings.mutateAsync(values);
    setCurrency(res.currency);
    setNotice('Settings saved.');
  });

  const saveProfile = profileForm.handleSubmit(async (values) => {
    await updateProfile.mutateAsync({ fullName: values.fullName, phone: values.phone || null });
    await refreshOwner();
    setNotice('Profile updated.');
  });

  const savePassword = passwordForm.handleSubmit(async (values) => {
    await changePassword.mutateAsync({ currentPassword: values.currentPassword, newPassword: values.newPassword });
    await logout();
    navigate('/login');
  });

  if (settings.isLoading) return <Spinner />;

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">Settings</h1>
      {notice && <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

      <Card>
        <CardHeader title="General" />
        <form className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <TextField label="Currency (3-letter code)" error={settingsForm.formState.errors.currency?.message} {...settingsForm.register('currency')} />
          <TextField label="Reminder days before due" type="number" error={settingsForm.formState.errors.reminderDays?.message} {...settingsForm.register('reminderDays')} />
          <div className="sm:col-span-2">
            <Button onClick={saveSettings} loading={updateSettings.isPending}>
              Save settings
            </Button>
          </div>
          {updateSettings.error && <div className="sm:col-span-2"><ErrorState message={(updateSettings.error as Error).message} /></div>}
        </form>
      </Card>

      <Card>
        <CardHeader title="Profile" />
        <form className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <TextField label="Full name" error={profileForm.formState.errors.fullName?.message} {...profileForm.register('fullName')} />
          <TextField label="Phone" error={profileForm.formState.errors.phone?.message} {...profileForm.register('phone')} />
          <div className="sm:col-span-2">
            <TextField label="Email" value={owner?.email ?? ''} disabled />
          </div>
          <div className="sm:col-span-2">
            <Button onClick={saveProfile} loading={updateProfile.isPending}>
              Save profile
            </Button>
          </div>
          {updateProfile.error && <div className="sm:col-span-2"><ErrorState message={(updateProfile.error as Error).message} /></div>}
        </form>
      </Card>

      <Card>
        <CardHeader title="Change password" />
        <form className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()}>
          <div className="sm:col-span-2">
            <TextField label="Current password" type="password" error={passwordForm.formState.errors.currentPassword?.message} {...passwordForm.register('currentPassword')} />
          </div>
          <TextField label="New password" type="password" error={passwordForm.formState.errors.newPassword?.message} {...passwordForm.register('newPassword')} />
          <TextField label="Confirm new password" type="password" error={passwordForm.formState.errors.confirm?.message} {...passwordForm.register('confirm')} />
          <div className="sm:col-span-2">
            <Button variant="danger" onClick={savePassword} loading={changePassword.isPending}>
              Update password
            </Button>
            <p className="mt-2 text-xs text-slate-400">You will be signed out and must log in again.</p>
          </div>
          {changePassword.error && <div className="sm:col-span-2"><ErrorState message={(changePassword.error as Error).message} /></div>}
        </form>
      </Card>
    </div>
  );
};
