import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Play, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  BUILTIN_SOUNDS,
  CUSTOM_SOUND_ID,
  disablePushOnThisDevice,
  enablePushOnThisDevice,
  getNotificationSettings,
  playSoundUrl,
  pushSupported,
  resolveSoundUrl,
  saveNotificationSettings,
  uploadCustomSound,
} from "@/lib/notifications";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type SoundField = "message_sound" | "reaction_sound";

export function NotificationSettingsCard() {
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(pushSupported());
  }, []);

  const { data: settings } = useQuery({
    queryKey: ["notification-settings"],
    queryFn: getNotificationSettings,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["notification-settings"] });

  const patchMutation = useMutation({
    mutationFn: (patch: Parameters<typeof saveNotificationSettings>[0]) => saveNotificationSettings(patch),
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const permissionMutation = useMutation({
    mutationFn: async (enable: boolean) => {
      if (enable) await enablePushOnThisDevice();
      else await disablePushOnThisDevice();
    },
    onSuccess: (_data, enable) => {
      void invalidate();
      toast.success(enable ? "Notificações ativadas neste aparelho" : "Notificações desativadas");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { path, name } = await uploadCustomSound(file);
      await saveNotificationSettings({
        custom_sound_path: path,
        custom_sound_name: name,
        message_sound: CUSTOM_SOUND_ID,
      });
    },
    onSuccess: () => {
      void invalidate();
      toast.success("Som personalizado salvo");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const preview = async (kind: "message" | "reaction") => {
    playSoundUrl(await resolveSoundUrl(settings ?? null, kind));
  };

  const soundOptions = (field: SoundField) => (
    <div className="flex flex-wrap gap-2">
      {BUILTIN_SOUNDS.map((sound) => (
        <Button
          key={sound.id}
          type="button"
          size="sm"
          variant={settings?.[field] === sound.id ? "default" : "outline"}
          onClick={() => {
            playSoundUrl(sound.url);
            patchMutation.mutate({ [field]: sound.id });
          }}
        >
          {sound.label}
        </Button>
      ))}
      {settings?.custom_sound_path ? (
        <Button
          type="button"
          size="sm"
          variant={settings[field] === CUSTOM_SOUND_ID ? "default" : "outline"}
          onClick={() => patchMutation.mutate({ [field]: CUSTOM_SOUND_ID })}
        >
          {settings.custom_sound_name ?? "Meu som"}
        </Button>
      ) : null}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" /> Notificações e sons
        </CardTitle>
        <CardDescription>
          Receba avisos de mensagens e reações mesmo com a tela bloqueada ou o navegador fechado, com o som que você
          escolher.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!supported ? (
          <p className="text-sm text-muted-foreground">
            Este navegador não suporta notificações push. No iPhone, adicione o Zap Tri à tela de início para ativar.
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Notificações neste aparelho</Label>
            <p className="text-sm text-muted-foreground">
              Vamos pedir permissão do dispositivo para exibir avisos e tocar sons.
            </p>
          </div>
          <Button
            type="button"
            variant={settings?.push_enabled ? "outline" : "default"}
            disabled={!supported || permissionMutation.isPending}
            onClick={() => permissionMutation.mutate(!settings?.push_enabled)}
          >
            {settings?.push_enabled ? (
              <>
                <BellOff className="mr-2 h-4 w-4" /> Desativar
              </>
            ) : (
              <>
                <Bell className="mr-2 h-4 w-4" /> Permitir
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Tocar som</Label>
            <p className="text-sm text-muted-foreground">Som ao receber mensagens e reações.</p>
          </div>
          <Switch
            checked={settings?.sound_enabled ?? true}
            onCheckedChange={(checked) => patchMutation.mutate({ sound_enabled: checked })}
          />
        </div>


        <div className="flex items-center justify-between gap-4">
          <div>
            <Label>Avisar reações</Label>
            <p className="text-sm text-muted-foreground">Notificar quando alguém reagir às suas mensagens.</p>
          </div>
          <Switch
            checked={settings?.notify_reactions ?? true}
            onCheckedChange={(checked) => patchMutation.mutate({ notify_reactions: checked })}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Som das mensagens</Label>
            <Button type="button" size="sm" variant="ghost" onClick={() => void preview("message")}>
              <Play className="mr-2 h-4 w-4" /> Ouvir
            </Button>
          </div>
          {soundOptions("message_sound")}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Som das reações</Label>
            <Button type="button" size="sm" variant="ghost" onClick={() => void preview("reaction")}>
              <Play className="mr-2 h-4 w-4" /> Ouvir
            </Button>
          </div>
          {soundOptions("reaction_sound")}
        </div>

        <div className="space-y-2">
          <Label>Seu próprio som</Label>
          <p className="text-sm text-muted-foreground">Envie um áudio curto do seu dispositivo (até 2 MB).</p>
          <input
            ref={fileInput}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) uploadMutation.mutate(file);
              event.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={uploadMutation.isPending}
            onClick={() => fileInput.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploadMutation.isPending ? "Enviando..." : "Escolher áudio do dispositivo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
