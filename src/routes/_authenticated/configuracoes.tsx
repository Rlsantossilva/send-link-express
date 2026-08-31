import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { NotificationSettingsCard } from "@/components/notification-settings-card";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações de notificações — Zap Tri" },
      {
        name: "description",
        content: "Ative ou desative avisos na tela e sons de mensagens e reações no Zap Tri.",
      },
      { property: "og:title", content: "Configurações de notificações — Zap Tri" },
      { property: "og:description", content: "Escolha como e quando o Zap Tri avisa você." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-2xl space-y-6 p-4 sm:p-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Configurações</h1>
          <p className="text-sm text-muted-foreground">
            Escolha os avisos na tela e os sons para mensagens e reações.
          </p>
        </header>

        <NotificationSettingsCard />
      </div>
    </AppShell>
  );
}
