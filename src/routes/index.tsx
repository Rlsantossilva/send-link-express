import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Image as ImageIcon, Mic, Users, Video } from "lucide-react";
import heroImage from "@/assets/hero-chat.jpg";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zap Tri — mensagens com texto, foto, vídeo e áudio" },
      {
        name: "description",
        content:
          "Converse em tempo real com textos, fotos, vídeos e áudios. Crie grupos e convide pessoas por e-mail ou telefone.",
      },
      { property: "og:title", content: "Zap Tri — mensagens com texto, foto, vídeo e áudio" },
      {
        property: "og:description",
        content: "Converse em tempo real com textos, fotos, vídeos e áudios. Crie grupos e convide pessoas por e-mail ou telefone.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  { icon: ImageIcon, title: "Fotos", text: "Envie imagens com legenda direto da galeria." },
  { icon: Video, title: "Vídeos", text: "Compartilhe clipes com player integrado." },
  { icon: Mic, title: "Áudios", text: "Grave mensagens de voz com um toque." },
  { icon: Users, title: "Grupos", text: "Reúna seus contatos em conversas coletivas." },
];

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (!cancelled && data.session) {
        void navigate({ to: "/conversas", search: {}, replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5">
        <span className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-gradient text-lg font-bold text-primary-foreground">
            Z
          </span>
          <span className="font-display text-lg font-bold">Zap Tri</span>
        </span>
        <Link
          to="/auth"
          className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Entrar
        </Link>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-10 lg:grid-cols-2 lg:py-16">
          <div>
            <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground">
              Amarelo, vermelho e azul
            </span>
            <h1 className="mt-4 font-display text-4xl font-bold leading-[1.05] sm:text-5xl">
              Suas conversas com{" "}
              <span className="bg-brand-gradient bg-clip-text text-transparent">tudo dentro</span>
            </h1>
            <p className="mt-4 max-w-md text-muted-foreground">
              Texto, foto, vídeo e áudio no mesmo chat. Cadastre-se, monte sua lista de contatos e convide quem
              você quiser por e-mail ou número de telefone.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/auth"
                className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Criar minha conta
              </Link>
              <Link
                to="/conversas"
                className="rounded-xl border border-border px-5 py-3 text-sm font-semibold transition-colors hover:bg-muted"
              >
                Abrir conversas
              </Link>
            </div>
          </div>

          <img
            src={heroImage}
            alt="Telas do aplicativo Zap Tri com mensagens de texto, foto, vídeo e áudio"
            width={1280}
            height={960}
            className="w-full rounded-3xl border border-border shadow-bubble"
          />
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-border bg-card p-5">
                <Icon className="size-6 text-primary" />
                <h2 className="mt-3 font-display text-base font-bold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
