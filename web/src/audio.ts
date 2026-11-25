// Áudio no navegador para RINNE Voz e Modo Reunião.
// - Microfone só com consentimento explícito + clique; trilhas encerradas ao sair da tela.
// - Gravação em SEGMENTOS independentes (cada um é um arquivo válido), com duração e tamanho controlados.
// - Nenhum provedor externo: transcrição/síntese inteligentes são do n8n. A síntese nativa do navegador é
//   apenas alternativa local opcional (pode depender do sistema operacional/serviços do navegador).
import { useEffect, useRef, useState } from "react";

export const SEGMENT_MAX_MS = 30000; // 30 s por segmento (backend aceita até 60 s / 2 MB)
export const SEGMENT_MAX_BYTES = 2 * 1024 * 1024;

export type MicState = "idle" | "active" | "denied" | "unsupported" | "blocked";

export function micPolicyAllows() {
  const fp = (document as unknown as { featurePolicy?: { allowsFeature: (f: string) => boolean } }).featurePolicy;
  return fp ? fp.allowsFeature("microphone") : true;
}

export function preferredMime() {
  for (const t of ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/** Microfone com medidor de nível local. Nada é gravado até `recordSegment`. */
export function useMicrophone() {
  const [state, setState] = useState<MicState>("idle");
  const [level, setLevel] = useState(0);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const raf = useRef(0);

  function stop() {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop()); // libera o microfone de fato
    ctx.current?.close().catch(() => null);
    stream.current = null;
    ctx.current = null;
    setLevel(0);
    setState((s) => (s === "active" ? "idle" : s));
  }

  async function start() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return setState("unsupported");
    if (!micPolicyAllows()) return setState("blocked");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      ctx.current = new AudioContext();
      const analyser = ctx.current.createAnalyser();
      analyser.fftSize = 512;
      ctx.current.createMediaStreamSource(stream.current).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      const tick = () => {
        analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
      setState("active");
    } catch {
      stop();
      setState("denied");
    }
  }

  useEffect(() => stop, []);
  return { state, level, start, stop, stream };
}

export interface Segment {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

/**
 * Grava UM segmento independente. Encerra em `maxMs` ou quando `controller.stop()` for chamado.
 * Suporta pausa/retomada. O áudio fica só na memória até ser enviado.
 */
export function recordSegment(stream: MediaStream, maxMs = SEGMENT_MAX_MS) {
  const mimeType = preferredMime();
  const rec = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : undefined);
  const chunks: Blob[] = [];
  let started = Date.now();
  let pausedAt = 0;
  let pausedTotal = 0;
  const done = new Promise<Segment>((resolve) => {
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => resolve({ blob: new Blob(chunks, { type: (rec.mimeType || mimeType || "audio/webm").split(";")[0] }), mimeType: (rec.mimeType || mimeType || "audio/webm").split(";")[0], durationMs: Math.min(maxMs, Date.now() - started - pausedTotal) });
  });
  rec.start();
  started = Date.now();
  const timer = setTimeout(() => rec.state !== "inactive" && rec.stop(), maxMs);
  return {
    done,
    stop: () => (clearTimeout(timer), rec.state !== "inactive" && rec.stop()),
    pause: () => rec.state === "recording" && (rec.pause(), (pausedAt = Date.now())),
    resume: () => rec.state === "paused" && (rec.resume(), (pausedTotal += Date.now() - pausedAt)),
    get state() {
      return rec.state;
    },
  };
}

// ---------------- Reprodução ----------------
export function base64ToBlob(data: string, mimeType: string) {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/** Voz pt-BR do navegador. Preferência: masculina (nomes conhecidos), tom grave e ritmo firme. */
export function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === "undefined") return null;
  const voices = speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("pt"));
  const male = /daniel|antonio|ant[oô]nio|ricardo|felipe|fabio|f[aá]bio|julio|j[uú]lio|thiago|male|masculin/i;
  return voices.find((v) => v.lang.toLowerCase() === "pt-br" && male.test(v.name)) ?? voices.find((v) => male.test(v.name)) ?? voices.find((v) => v.lang.toLowerCase() === "pt-br") ?? voices[0] ?? null;
}

export function speak(text: string, volume: number, onEnd: () => void) {
  if (typeof speechSynthesis === "undefined") return onEnd();
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 3000));
  const v = pickVoice();
  if (v) u.voice = v;
  u.lang = "pt-BR";
  u.pitch = 0.75; // mais grave
  u.rate = 0.95; // firme, sem pressa
  u.volume = volume;
  u.onend = onEnd;
  u.onerror = onEnd;
  speechSynthesis.speak(u);
}
