import { requireAuth } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNavProvider } from "@/components/layout/mobile-nav-context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();

  return (
    <MobileNavProvider>
      <div className="flex min-h-screen">
        <Sidebar role={session.user.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={session.user} />
          <main className="flex-1 px-4 py-4 sm:px-5">{children}</main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
