import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Users, UserRound, LogOut, Images, ShieldCheck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile } from "@/lib/chat";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useNotifications } from "@/hooks/use-notifications";
import { Button } from "@/components/ui/button";
import { AvatarGalleryDialog } from "@/components/avatar-gallery-dialog";
import { useServerFn } from "@tanstack/react-start";
import { amIAdmin } from "@/lib/admin.functions";

const NAV = [
  { to: "/conversas", label: "Conversas", icon: MessageSquare },
  { to: "/contatos", label: "Contatos", icon: Users },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [galleryOpen, setGalleryOpen] = useState(false);
  useRealtimeSync();
  useNotifications();

  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: getMyProfile });
  const checkAdmin = useServerFn(amIAdmin);
  const { data: isAdmin } = useQuery({ queryKey: ["am-i-admin"], queryFn: () => checkAdmin(), retry: false });
  const myName = profile?.display_name || profile?.email || "Você";

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-dvh flex-col overflow-hidden bg-background md:h-dvh md:flex-row">
      <aside className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-sidebar px-4 py-3 md:w-60 md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-4 md:py-6">
        <Link to="/conversas" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-gradient text-lg font-bold text-primary-foreground">
            Z
          </span>
          <span className="font-display text-lg font-bold">Zap Tri</span>
        </Link>

        <nav className="flex items-center gap-1 md:mt-8 md:flex-col md:items-stretch md:gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{label}</span>
            </Link>
          ))}

          <Link
            to="/perfil"
            className="flex flex-col items-center gap-0.5 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground"
          >
            <UserRound className="size-4" />
            <span className="max-w-28 truncate text-xs font-semibold">{myName}</span>
            {profile?.email ? (
              <span className="max-w-28 truncate text-[10px] text-muted-foreground">{profile.email}</span>
            ) : null}
          </Link>

          <Button
            variant="outline"
            size="sm"
            className="gap-2 md:mt-2 md:justify-start"
            disabled={!profile?.id}
            onClick={() => setGalleryOpen(true)}
          >
            <Images className="size-4" />
            <span className="hidden sm:inline">Adicionar fotos</span>
          </Button>

          {isAdmin ? (
            <Link
              to="/admin"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[status=active]:bg-primary data-[status=active]:text-primary-foreground md:mt-2"
            >
              <ShieldCheck className="size-4" />
              <span className="hidden sm:inline">Administração</span>
            </Link>
          ) : null}
        </nav>

        <Button variant="ghost" size="sm" className="md:mt-auto md:justify-start" onClick={signOut}>
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </aside>

      {galleryOpen && profile?.id ? (
        <AvatarGalleryDialog
          ownerId={profile.id}
          name={profile.display_name}
          canManage
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <EnableNotificationsBanner />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
