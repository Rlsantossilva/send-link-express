import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { cpfLoginEmail, onlyDigits } from "@/lib/cpf";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar no Zap Tri — mensagens em tempo real" },
      {
        name: "description",
        content: "Crie sua conta ou entre no Zap Tri para conversar com textos, fotos, vídeos e áudios.",
      },
      { property: "og:title", content: "Entrar no Zap Tri" },
      { property: "og:description", content: "Acesse suas conversas, contatos e convites." },
    ],
  }),
  component: AuthPage,
});

const signUpSchema = z.object({
  fullName: z.string().trim().min(3, "Informe seu nome completo").max(120, "Nome muito longo"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data de nascimento"),
  email: z.string().trim().email("E-mail inválido").max(255),
  pin: z
    .string()
    .trim()
    .regex(/^\d{6,12}$/, "O PIN deve ter de 6 a 12 dígitos numéricos"),
});


const signInSchema = z.object({
  email: z.string().trim().email("E-mail inválido").max(255),
  password: z.string().min(1, "Informe sua senha").max(72),
});

function AuthPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/conversas", replace: true });
    });
  }, [navigate]);

  async function handleSignIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const identifier = String(form.get("identifier") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const digits = onlyDigits(identifier);
    const isCpf = !identifier.includes("@") && digits.length === 11;
    const email = isCpf ? cpfLoginEmail(digits) : identifier;

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      toast.error(isCpf ? "CPF ou PIN incorretos" : "E-mail ou senha incorretos");
      return;
    }
    navigate({ to: "/conversas", replace: true });
  }


  async function handleSignUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      fullName: String(form.get("fullName") ?? ""),
      birthDate: String(form.get("birthDate") ?? ""),
      email: String(form.get("email") ?? ""),
      pin: onlyDigits(String(form.get("pin") ?? "")),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      return;
    }

    setLoading(true);
    try {
      await createAccount({ data: parsed.data });
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.pin,
      });
      if (error) throw new Error("Conta criada. Faça login com seu e-mail e PIN.");
      toast.success("Conta criada com sucesso!");
      navigate({ to: "/conversas", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a conta");
    } finally {
      setLoading(false);
    }
  }


  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-brand-gradient p-10 text-primary-foreground lg:flex">
        <Link to="/" className="font-display text-2xl font-bold">
          Zap Tri
        </Link>
        <div className="space-y-4">
          <h1 className="font-display text-4xl font-bold leading-tight">
            Conversas com texto, foto, vídeo e áudio.
          </h1>
          <p className="max-w-sm text-primary-foreground/85">
            Convide quem quiser por e-mail ou telefone, monte grupos e receba mensagens em tempo real.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">Amarelo, vermelho e azul — do jeito que você pediu.</p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="font-display text-2xl font-bold">Bem-vindo</h2>
          <p className="mt-1 text-sm text-muted-foreground">Entre ou crie sua conta para começar.</p>

          {awaitingConfirm ? (
            <div className="mt-6 rounded-2xl border border-secondary bg-accent p-4 text-sm text-accent-foreground">
              Enviamos um link de confirmação para o seu e-mail. Depois de confirmar, volte aqui e faça login.
            </div>
          ) : null}

          <Tabs defaultValue="entrar" className="mt-6">
            <TabsList className="w-full">
              <TabsTrigger value="entrar" className="flex-1">
                Entrar
              </TabsTrigger>
              <TabsTrigger value="criar" className="flex-1">
                Criar conta
              </TabsTrigger>
            </TabsList>

            <TabsContent value="entrar">
              <form className="space-y-4" onSubmit={handleSignIn}>
                <div className="space-y-1.5">
                  <Label htmlFor="signin-identifier">CPF ou e-mail</Label>
                  <Input
                    id="signin-identifier"
                    name="identifier"
                    autoComplete="username"
                    placeholder="000.000.000-00 ou você@email.com"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signin-password">Senha ou PIN</Label>
                  <Input
                    id="signin-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  Entrar
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="criar">
              <form className="space-y-4" onSubmit={handleSignUp}>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-name">Nome completo</Label>
                  <Input id="signup-name" name="fullName" maxLength={120} required />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-cpf">CPF</Label>
                    <Input
                      id="signup-cpf"
                      name="cpf"
                      inputMode="numeric"
                      placeholder="000.000.000-00"
                      maxLength={14}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="signup-birth">Data de nascimento</Label>
                    <Input id="signup-birth" name="birthDate" type="date" required />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-phone">Telefone</Label>
                  <Input id="signup-phone" name="phone" inputMode="tel" placeholder="+55 11 99999-0000" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-email">E-mail</Label>
                  <Input id="signup-email" name="email" type="email" autoComplete="email" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="signup-password">Senha</Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  Criar conta
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
