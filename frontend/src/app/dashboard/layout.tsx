import { Header } from '@/components/layout/header';
import { DesktopSidebar } from '@/components/layout/desktop-sidebar';
import { MobileSidebarTrigger } from '@/components/layout/sidebar';
import { AuthGuard } from '@/components/auth/auth-guard';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard requireAuth={true}>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex">
          <div className="hidden lg:block">
            <DesktopSidebar />
          </div>
          <main className="flex-1 p-4 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}