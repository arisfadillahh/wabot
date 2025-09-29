import { AppLayout } from '@/components/layout/app-layout-new';

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}