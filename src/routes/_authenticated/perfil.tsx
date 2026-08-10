import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Save } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { getMyProfile, requireUserId, updateMyProfile } from "@/lib/chat";
import { AppShell } from "@/components/app-shell";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NotificationSettingsCard } from "@/components/notification-settings-card";


export const Route = createFileRoute("/_authenticated/perfil")({
  head: () => ({
    meta: [
      { title: "Seu perfil — Zap Tri" },
      { name: "description", content: "Atualize nome, telefone, foto e recado do seu perfil no Zap Tri." },
      { property: "og:title", content: "Seu perfil — Zap Tri" },
      { property: "og:description", content: "Personalize como seus contatos te veem." },
    ],
  }),
  component: ProfilePage,
});

const profileSchema = z.object({
  display_name: z.string().trim().min(2, "Informe seu nome").max(60, "Nome muito longo"),
  phone: z
    .string()
    .trim()
    .max(20, "Telefone muito longo")
    .regex(/^[\d+\s()-]*$/, "Telefone inválido"),
  status_text: z.string().trim().max(140, "Recado muito longo"),
});

function ProfilePage() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({ display_name: "", phone: "", status_text: "" });

  const { data: profile } = useQuery({ queryKey: ["my-profile"], queryFn: getMyProfile });

  useEffect(() => {
    if (profile) {
      setForm({
        display_name: profile.display_name ?? "",
        phone: profile.phone ?? "",
        status_text: profile.status_text ?? "",
      });
    }
  }, [profile]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const parsed = profileSchema.safeParse(form);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
      await updateMyProfile({
        display_name: parsed.data.display_name,
        phone: parsed.data.phone || null,
        status_text: parsed.data.status_text || null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Perfil atualizado");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > 5 * 1024 * 1024) throw new Error("A imagem deve ter no máximo 5 MB");
      const userId = await requireUserId();
      const extension = file.name.split(".").pop() ?? "jpg";
      const path = `${userId}/avatar-${Date.now()}.${extension}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        contentType: file.type || "image/jpeg",
        upsert: true,
      });
      if (error) throw error;
      await updateMyProfile({ avatar_url: path });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-profile"] });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      toast.success("Foto atualizada");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-xl space-y-6 p-4 md:p-8">
        <header>
          <h1 className="font-display text-2xl font-bold">Seu perfil</h1>
          <p className="text-sm text-muted-foreground">É assim que seus contatos te veem.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Foto de perfil</CardTitle>
            <CardDescription>PNG ou JPG de até 5 MB.</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center gap-4">
            <UserAvatar path={profile?.avatar_url} name={profile?.display_name} className="size-20" />
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) avatarMutation.mutate(file);
                event.target.value = "";
              }}
            />
            <Button variant="outline" disabled={avatarMutation.isPending} onClick={() => fileInput.current?.click()}>
              <Camera className="size-4" /> Trocar foto
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="display-name">Nome de exibição</Label>
              <Input
                id="display-name"
                value={form.display_name}
                maxLength={60}
                onChange={(event) => setForm((prev) => ({ ...prev, display_name: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={form.phone}
                maxLength={20}
                inputMode="tel"
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Recado</Label>
              <Textarea
                id="status"
                value={form.status_text}
                maxLength={140}
                rows={2}
                placeholder="Disponível para conversar"
                onChange={(event) => setForm((prev) => ({ ...prev, status_text: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input value={profile?.email ?? ""} disabled />
            </div>
            <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              <Save className="size-4" /> Salvar
            </Button>
          </CardContent>
        </Card>

        <NotificationSettingsCard />
      </div>

    </AppShell>
  );
}
