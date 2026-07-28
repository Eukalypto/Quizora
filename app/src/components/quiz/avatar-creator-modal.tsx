import { useRef, useState } from "react";
import type { ReactElement } from "react";
import { Button } from "@higgsfield/quanta/button";
import { Loader } from "@higgsfield/quanta/loader";
import { Modal } from "@higgsfield/quanta/modal";
import { toast } from "@higgsfield/quanta/sonner";
import { Tabs } from "@higgsfield/quanta/tabs";
import { Typography } from "@higgsfield/quanta/typography";
import {
  AVATAR_ACCESSORIES,
  AVATAR_BACKGROUNDS,
  AVATAR_FACES,
  AVATAR_HATS,
  DEFAULT_AVATAR_CONFIG,
  drawAvatarToCanvas,
  findAccessory,
  findBackground,
  findFace,
  findHat,
  type AvatarConfig,
} from "@/lib/quiz/avatar-pieces";
import { cn } from "@/lib/utils";

type Layer = "background" | "face" | "hat" | "accessory";

const PREVIEW_SIZE = 160;
const EXPORT_SIZE = 512;

function AvatarPreview({ config, size = PREVIEW_SIZE }: { config: AvatarConfig; size?: number }) {
  const bg = findBackground(config.background);
  const face = findFace(config.face);
  const hat = findHat(config.hat);
  const accessory = findAccessory(config.accessory);
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-q-full"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${bg.colors[0]}, ${bg.colors[1]})` }}
    >
      <div className="absolute inset-0 flex items-center justify-center" style={{ fontSize: size * 0.52 }}>
        {face.emoji}
      </div>
      {hat ? (
        <div className="absolute left-1/2 -translate-x-1/2" style={{ top: size * 0.06, fontSize: size * 0.3 }}>
          {hat.emoji}
        </div>
      ) : null}
      {accessory ? (
        <div className="absolute" style={{ left: size * 0.66, top: size * 0.66, fontSize: size * 0.24 }}>
          {accessory.emoji}
        </div>
      ) : null}
    </div>
  );
}

async function uploadAvatarBlob(blob: Blob): Promise<string> {
  const form = new FormData();
  form.append("file", blob, "avatar.png");
  const res = await fetch("/api/avatar-upload", { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok || !body.url) throw new Error(body.error ?? "upload_failed");
  return body.url as string;
}

export function AvatarCreatorModal({ trigger, onSaved }: { trigger: ReactElement; onSaved: (avatarUrl: string) => void }) {
  const [open, setOpen] = useState(false);
  const [layer, setLayer] = useState<Layer>("background");
  const [config, setConfig] = useState<AvatarConfig>(DEFAULT_AVATAR_CONFIG);
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setLayer("background");
      setConfig(DEFAULT_AVATAR_CONFIG);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("canvas_missing");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas_context_missing");
      canvas.width = EXPORT_SIZE;
      canvas.height = EXPORT_SIZE;
      drawAvatarToCanvas(ctx, EXPORT_SIZE, config);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("export_failed");

      const url = await uploadAvatarBlob(blob);
      onSaved(url);
      setOpen(false);
    } catch {
      toast.error("Couldn't save your avatar", { description: "Try again in a moment." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal.Root open={open} onOpenChange={handleOpenChange}>
      <Modal.Trigger render={trigger} />
      <Modal.Content size="md">
        <Modal.Header>
          <Modal.Title>Create your avatar</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <div className="flex flex-col items-center gap-4">
            <AvatarPreview config={config} />
            <canvas ref={canvasRef} className="hidden" aria-hidden />

            <Tabs.Root variant="segmented" value={layer} onValueChange={(v) => setLayer(v as Layer)} className="w-full">
              <Tabs.List>
                <Tabs.Tab value="background">Background</Tabs.Tab>
                <Tabs.Tab value="face">Face</Tabs.Tab>
                <Tabs.Tab value="hat">Hat</Tabs.Tab>
                <Tabs.Tab value="accessory">Accessory</Tabs.Tab>
              </Tabs.List>
            </Tabs.Root>

            {layer === "background" ? (
              <div className="grid w-full grid-cols-4 gap-3">
                {AVATAR_BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.id}
                    type="button"
                    aria-label={bg.label}
                    onClick={() => setConfig((c) => ({ ...c, background: bg.id }))}
                    className={cn(
                      "aspect-square rounded-q-full ring-offset-2 ring-offset-q-background-primary transition-shadow",
                      config.background === bg.id ? "ring-2 ring-q-border-focus" : "hover:ring-2 hover:ring-q-border-subtle",
                    )}
                    style={{ background: `linear-gradient(135deg, ${bg.colors[0]}, ${bg.colors[1]})` }}
                  />
                ))}
              </div>
            ) : null}

            {layer === "face" ? (
              <div className="grid w-full grid-cols-5 gap-2">
                {AVATAR_FACES.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    aria-label={f.label}
                    onClick={() => setConfig((c) => ({ ...c, face: f.id }))}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-q-400 border text-2xl transition-colors",
                      config.face === f.id
                        ? "border-q-border-focus bg-q-background-secondary"
                        : "border-q-border-subtle hover:bg-q-background-secondary",
                    )}
                  >
                    {f.emoji}
                  </button>
                ))}
              </div>
            ) : null}

            {layer === "hat" ? (
              <div className="grid w-full grid-cols-6 gap-2">
                <button
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, hat: null }))}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-q-400 border text-q-body-xs-medium transition-colors",
                    config.hat === null
                      ? "border-q-border-focus bg-q-background-secondary"
                      : "border-q-border-subtle hover:bg-q-background-secondary",
                  )}
                >
                  None
                </button>
                {AVATAR_HATS.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    aria-label={h.label}
                    onClick={() => setConfig((c) => ({ ...c, hat: h.id }))}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-q-400 border text-2xl transition-colors",
                      config.hat === h.id
                        ? "border-q-border-focus bg-q-background-secondary"
                        : "border-q-border-subtle hover:bg-q-background-secondary",
                    )}
                  >
                    {h.emoji}
                  </button>
                ))}
              </div>
            ) : null}

            {layer === "accessory" ? (
              <div className="grid w-full grid-cols-6 gap-2">
                <button
                  type="button"
                  onClick={() => setConfig((c) => ({ ...c, accessory: null }))}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-q-400 border text-q-body-xs-medium transition-colors",
                    config.accessory === null
                      ? "border-q-border-focus bg-q-background-secondary"
                      : "border-q-border-subtle hover:bg-q-background-secondary",
                  )}
                >
                  None
                </button>
                {AVATAR_ACCESSORIES.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    aria-label={a.label}
                    onClick={() => setConfig((c) => ({ ...c, accessory: a.id }))}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-q-400 border text-2xl transition-colors",
                      config.accessory === a.id
                        ? "border-q-border-focus bg-q-background-secondary"
                        : "border-q-border-subtle hover:bg-q-background-secondary",
                    )}
                  >
                    {a.emoji}
                  </button>
                ))}
              </div>
            ) : null}

            <Button variant="primary" size="md" className="w-full" disabled={saving} onClick={save}>
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader variant="stars" size="sm" />
                  <Typography as="span" variant="body-sm-medium">
                    Saving…
                  </Typography>
                </span>
              ) : (
                "Use this avatar"
              )}
            </Button>
          </div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
