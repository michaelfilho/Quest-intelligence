// Captura e reprodução de áudio (APIs do navegador simuladas SOMENTE neste teste).
import { afterEach, describe, expect, it, vi } from "vitest";
import { base64ToBlob, pickVoice, recordSegment, SEGMENT_MAX_BYTES, SEGMENT_MAX_MS } from "./audio";

class FakeRecorder {
  static isTypeSupported = (t: string) => t.startsWith("audio/webm");
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType = "audio/webm;codecs=opus";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  pause() {
    this.state = "paused";
  }
  resume() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(100)]) });
    this.onstop?.();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("captura em segmentos", () => {
  it("limites dentro do aceito pelo backend (≤ 60 s, ≤ 2 MB)", () => {
    expect(SEGMENT_MAX_MS).toBeLessThanOrEqual(60000);
    expect(SEGMENT_MAX_BYTES).toBeLessThanOrEqual(2 * 1024 * 1024);
  });

  it("encerra sozinho na duração máxima e gera um arquivo independente", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const seg = recordSegment({} as MediaStream, 5000);
    vi.advanceTimersByTime(5000);
    const out = await seg.done;
    expect(out.mimeType).toBe("audio/webm"); // sem parâmetros de codec no Content-Type
    expect(out.blob.size).toBe(100);
    expect(out.durationMs).toBeLessThanOrEqual(5000);
  });

  it("pausa não conta como duração; parar antes do limite funciona", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("MediaRecorder", FakeRecorder);
    const seg = recordSegment({} as MediaStream, 30000);
    vi.advanceTimersByTime(1000);
    seg.pause();
    expect(seg.state).toBe("paused");
    vi.advanceTimersByTime(4000);
    seg.resume();
    vi.advanceTimersByTime(1000);
    seg.stop();
    const out = await seg.done;
    expect(out.durationMs).toBe(2000);
  });
});

describe("reprodução", () => {
  it("base64 → Blob com o tipo informado (tocado via blob:, permitido pela CSP)", async () => {
    const b = base64ToBlob(btoa("abc"), "audio/mpeg");
    expect(b.type).toBe("audio/mpeg");
    expect(await b.text()).toBe("abc");
  });

  it("voz nativa: prefere pt-BR masculina; sem vozes pt, não escolhe outra língua", () => {
    const voices = [
      { name: "Google US English", lang: "en-US" },
      { name: "Microsoft Maria - Portuguese (Brazil)", lang: "pt-BR" },
      { name: "Microsoft Daniel - Portuguese (Brazil)", lang: "pt-BR" },
    ];
    vi.stubGlobal("speechSynthesis", { getVoices: () => voices });
    expect(pickVoice()?.name).toBe("Microsoft Daniel - Portuguese (Brazil)");
    vi.stubGlobal("speechSynthesis", { getVoices: () => [voices[1]] });
    expect(pickVoice()?.name).toBe("Microsoft Maria - Portuguese (Brazil)");
    vi.stubGlobal("speechSynthesis", { getVoices: () => [voices[0]] });
    expect(pickVoice()).toBeNull();
  });
});
