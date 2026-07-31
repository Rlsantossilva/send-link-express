import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Users, UserRound, LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/conversas", label: "Conversas", icon: MessageSquare },
  { to: "/contatos", label: "Contatos", icon: Users },
  { to: "/perfil", label: "Perfil", icon: UserRound },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      <aside className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-sidebar px-4 py-3 md:w-60 md:flex-col md:items-stretch md:border-r md:border-b-0 md:px-4 md:py-6">
        <Link to="/conversas" className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-gradient text-lg font-bold text-primary-foreground">
            Z
          </span>
          <span className="font-display text-lg font-bold">Zap Tri</span>
        </Link>

        <nav className="flex gap-1 md:mt-8 md:flex-col md:gap-1">
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
        </nav>

        <Button variant="ghost" size="sm" className="md:mt-auto md:justify-start" onClick={signOut}>
          <LogOut className="size-4" />
          <span className="hidden sm:inline">Sair</span>
        </Button>
      </aside>

      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
