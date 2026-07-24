import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactElement } from "react";
import { Mic, Square } from "lucide-react";
import { Button } from "@higgsfield/quanta/button";
import { Loader } from "@higgsfield/quanta/loader";
import { Media } from "@higgsfield/quanta/media";
import { Modal } from "@higgsfield/quanta/modal";
import { toast } from "@higgsfield/quanta/sonner";
import { Tabs } from "@higgsfield/quanta/tabs";
import { Typography } from "@higgsfield/quanta/typography";
import { PromptBox } from "@/components/prompt-box";
import { generateAvatar, getAvatarCost } from "@/lib/api/avatar.functions";

type Mode = "text" | "photo" | "voice";

// Minimal ambient shape for the Web Speech API — not in TS's default DOM lib,
// and only Chrome/Edge/Safari ship it (as `webkitSpeechRecognition`); Firefox
// has no implementation, hence the `supported` feature-check throughout.
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

function useSpeechToText(onTranscript: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const start = () => {
    if (!supported) return;
    const Ctor = ((window as unknown as Record<string, unknown>).SpeechRecognition ??
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as new () => SpeechRecognitionLike;
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
      onTranscript(text);
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setRecording(true);
  };

  const stop = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  useEffect(() => () => recognitionRef.current?.stop(), []);

  return { supported, recording, start, stop };
}

async function uploadReferencePhoto(file: File): Promise<{ id: string; type: string; url?: string; role?: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/avatar-upload", { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok || !body.ref) throw new Error(body.error ?? "upload_failed");
  return body.ref;
}

export function AvatarCreatorModal({ trigger, onSaved }: { trigger: ReactElement; onSaved: (avatarUrl: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("text");
  const [prompt, setPrompt] = useState("");
  const [cost, setCost] = useState<number | null>(null);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "generating" | "result">("idle");
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const speech = useSpeechToText(setPrompt);

  useEffect(() => {
    if (!open) return;
    getAvatarCost()
      .then((res) => setCost(res.credits))
      .catch(() => setCost(null));
  }, [open]);

  const reset = () => {
    setMode("text");
    setPrompt("");
    setReferenceFile(null);
    setReferencePreview(null);
    setPhase("idle");
    setResultUrl(null);
    if (speech.recording) speech.stop();
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReferenceFile(file);
    setReferencePreview(URL.createObjectURL(file));
  };

  const canGenerate = prompt.trim().length >= 2 && (mode !== "photo" || referenceFile != null);

  const generate = async () => {
    if (!canGenerate) return;
    setPhase("generating");
    try {
      let referenceImage;
      if (mode === "photo" && referenceFile) {
        referenceImage = await uploadReferencePhoto(referenceFile);
      }
      const result = await generateAvatar({ data: { prompt: prompt.trim(), referenceImage } });
      if (!result.ok) {
        toast.error("Couldn't generate that avatar", { description: "Try again in a moment." });
        setPhase("idle");
        return;
      }
      setResultUrl(result.avatarUrl);
      setPhase("result");
    } catch {
      toast.error("Couldn't generate that avatar", { description: "Try again in a moment." });
      setPhase("idle");
    }
  };

  const useResult = () => {
    if (resultUrl) onSaved(resultUrl);
    setOpen(false);
    reset();
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
          {phase === "result" && resultUrl ? (
            <div className="flex flex-col items-center gap-4">
              <Media.Root ratio="square" rounded="full" className="w-40">
                <Media.Image src={resultUrl} alt="Your new avatar" fit="cover" />
              </Media.Root>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPhase("idle")}>
                  Try again
                </Button>
                <Button variant="primary" size="sm" onClick={useResult}>
                  Use this avatar
                </Button>
              </div>
            </div>
          ) : phase === "generating" ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader variant="stars" size="lg" />
              <Typography as="span" variant="caption-sm-regular" color="secondary">
                Painting your avatar…
              </Typography>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <Tabs.Root variant="segmented" value={mode} onValueChange={(v) => setMode(v as Mode)}>
                <Tabs.List>
                  <Tabs.Tab value="text">Text</Tabs.Tab>
                  <Tabs.Tab value="photo">Photo</Tabs.Tab>
                  <Tabs.Tab value="voice">Voice</Tabs.Tab>
                </Tabs.List>
              </Tabs.Root>

              <PromptBox.Root>
                <PromptBox.Body>
                  <PromptBox.Field
                    placeholder={
                      mode === "photo"
                        ? "Describe the style — e.g. \"as a watercolor painting\""
                        : mode === "voice"
                          ? "Tap record and describe your avatar…"
                          : "Describe your avatar — e.g. \"a fox wearing a wizard hat, cartoon style\""
                    }
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                  {mode === "voice" ? (
                    <PromptBox.Actions>
                      {speech.supported ? (
                        <PromptBox.Pill
                          start={speech.recording ? <Square className="size-4" aria-hidden /> : <Mic className="size-4" aria-hidden />}
                          onClick={speech.recording ? speech.stop : speech.start}
                        >
                          {speech.recording ? "Stop recording" : "Record"}
                        </PromptBox.Pill>
                      ) : (
                        <Typography as="span" variant="caption-xs-regular" color="tertiary">
                          Voice input isn't supported in this browser — type your prompt instead.
                        </Typography>
                      )}
                    </PromptBox.Actions>
                  ) : null}
                </PromptBox.Body>

                {mode === "photo" ? (
                  <PromptBox.Uploads>
                    <PromptBox.Upload label="Reference photo" src={referencePreview ?? undefined} render={<label />}>
                      <input type="file" accept="image/*" className="sr-only" onChange={handleFileChange} />
                    </PromptBox.Upload>
                  </PromptBox.Uploads>
                ) : null}

                <PromptBox.Generate
                  cost={cost != null ? `${cost} credit${cost === 1 ? "" : "s"}` : undefined}
                  disabled={!canGenerate}
                  onClick={generate}
                >
                  Generate
                </PromptBox.Generate>
              </PromptBox.Root>
            </div>
          )}
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}
