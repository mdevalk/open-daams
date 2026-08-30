import { getTranslations } from 'next-intl/server';
import { APP_NAME } from '@/lib/branding';
import { SignInButton } from '@/components/SignInButton';

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { locale } = await params;
  const { callbackUrl } = await searchParams;
  const t = await getTranslations({ locale, namespace: 'auth' });

  return (
    <div className="max-w-sm mx-auto mt-16">
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">{t('welcomeEyebrow')}</p>
        <h1 className="text-2xl font-bold text-[#154273] mb-1">{APP_NAME}</h1>
        <p className="text-sm text-gray-500 mb-6">{t('welcomeSubtitle')}</p>
        <SignInButton callbackUrl={callbackUrl ?? `/${locale}`} label={t('signInCta')} />
      </div>
    </div>
  );
}
