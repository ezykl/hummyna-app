import { requestRecordingPermissionsAsync, setAudioModeAsync, useAudioStream } from "expo-audio";
import { useCallback, useMemo, useRef } from "react";
import type { FrameListener, MicRecorder, Take } from "./mic-recorder";

interface StreamBuffer {
  data: ArrayBuffer;
  sampleRate: number;
  channels: number;
  timestamp: number;
}

/**
 * Real `MicRecorder` over expo-audio's `AudioStream`: one native capture gives
 * real-time `float32` PCM frames (for the meter and future scoring) and a WAV
 * file (the take). Mic monitoring is never enabled.
 */
export function useExpoMicRecorder(): MicRecorder {
  const listeners = useRef(new Set<FrameListener>());
  const startedAt = useRef(0);
  const lastSampleRate = useRef(44100);

  const onBuffer = useCallback((buffer: StreamBuffer) => {
    lastSampleRate.current = buffer.sampleRate;
    const pcm = new Float32Array(buffer.data.slice(0));
    for (const listener of listeners.current) listener(pcm, buffer.sampleRate);
  }, []);

  const { stream } = useAudioStream({
    encoding: "float32",
    sampleRate: 44100,
    channels: 1,
    onBuffer,
  });

  return useMemo<MicRecorder>(
    () => ({
      async prepare() {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) throw new Error("HumMyna: microphone permission denied");
        // Monitoring off: nothing routes the mic input back to the output.
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      },

      start() {
        if (!stream || stream.isStreaming) return;
        startedAt.current = Date.now();
        void stream
          .start()
          .then(() => stream.startFileRecordingAsync({ directory: "document", format: "wav" }))
          .catch(() => undefined);
      },

      frames(cb: FrameListener) {
        listeners.current.add(cb);
        return () => listeners.current.delete(cb);
      },

      async stop(): Promise<Take> {
        try {
          const result = await stream.stopFileRecordingAsync();
          stream.stop();
          return {
            uri: result.uri,
            durationMs: Math.round(result.duration * 1000),
            sampleRate: result.sampleRate,
          };
        } catch {
          stream.stop();
          throw new Error("HumMyna: recording failed");
        }
      },

      dispose() {
        listeners.current.clear();
        try {
          stream.stop();
        } catch {
          // already stopped
        }
      },
    }),
    [stream, onBuffer],
  );
}
