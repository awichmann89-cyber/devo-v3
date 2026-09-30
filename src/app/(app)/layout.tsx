import { requireAuth } from "@/lib/auth-helpers";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { MobileNavProvider } from "@/components/layout/mobile-nav-context";
import { AnnouncementDialog } from "@/components/layout/announcement-dialog";
import { unseenAnnouncements } from "@/lib/announcements";
import { prisma } from "@/lib/prisma";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAuth();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { seenAnnouncementId: true },
  });
  // Veralteter Session-Token ohne User in der DB: dann keine Ankündigung.
  const announcements = user ? unseenAnnouncements(user.seenAnnouncementId) : [];

  return (
    <MobileNavProvider>
      <div className="flex min-h-screen">
        <Sidebar role={session.user.role} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={session.user} />
          <main className="flex-1 px-4 py-4 sm:px-5">{children}</main>
        </div>
      </div>
      <AnnouncementDialog announcements={announcements} />
    </MobileNavProvider>
  );
}
