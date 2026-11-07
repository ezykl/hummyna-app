import { extractMelody, parseLyrics } from "@hummyna/hmp";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { useExpoMicRecorder } from "../../audio/expo-mic-recorder";
import { loadSong } from "../../audio/load-song";
import { soundFontBytes } from "../../audio/sf2";
import { loadSynthSources } from "../../audio/synth-assets";
import { useRecorder } from "../../audio/use-recorder";
import { SynthHost, WebViewSynthEngine } from "../../audio/webview-synth-engine";
import { openTakesStore } from "../../library/db";
import { FrameCollector } from "../../score/frames";
import { detectFrames } from "../../score/pitch";
import { setLastResult } from "../../score/results-store";
import { scorePerformance } from "../../score/score";
import { RecordView } from "../../ui/record-view";

export default function RecordScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const router = useRouter();
  const libraryId = Number(id);
  const songNumber = Number(number);
  const recorder = useExpoMicRecorder();
  const controller = useRecorder(recorder);
  const [backing, setBacking] = useState<WebViewSynthEngine | null>(null);
  const [message, setMessage] = useState("Loading...");
  const [title, setTitle] = useState("");
  const [singer, setSinger] = useState("");
  const [midi, setMidi] = useState<Uint8Array | null>(null);
  const [ready, setReady] = useState(false);
  const [scoring, setScoring] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const loaded = await loadSong(libraryId, songNumber).catch(() => null);
        if (!active) return;
        if (!loaded) {
          setMessage("Couldn't open this song.");
          return;
        }
        let sf2: Uint8Array;
        try {
          sf2 = await soundFontBytes();
        } catch (err) {
          if (active) setMessage(err instanceof Error ? err.message : "No SoundFont configured.");
          return;
        }
        const { libraryJs, processorJs } = await loadSynthSources();
        if (!active) return;
        const engine = new WebViewSynthEngine({ libraryJs, processorJs, sf2 });
        setTitle(loaded.ref.title);
        setSinger(loaded.ref.singer);
        setBacking(engine);
        setMidi(loaded.midi);
      } catch (err) {
        if (active) setMessage(err instanceof Error ? err.message : "Couldn't open this song.");
      }
    })();
    return () => {
      active = false;
    };
  }, [libraryId, songNumber]);

  useEffect(() => {
    if (!backing || !midi) return;
    let cancelled = false;
    (async () => {
      try {
        await backing.init();
        await backing.load(midi);
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setMessage(err instanceof Error ? err.message : "Couldn't prepare playback.");
          setBacking(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backing, midi]);

  useEffect(() => () => backing?.dispose(), [backing]);

  const collectorRef = useRef<FrameCollector | null>(null);
  useEffect(
    () =>
      recorder.frames((pcm, sampleRate) => {
        if (!collectorRef.current) collectorRef.current = new FrameCollector(sampleRate);
        collectorRef.current.push(pcm);
      }),
    [recorder],
  );

  const onStart = async () => {
    collectorRef.current = null;
    const started = await controller.start();
    if (started) backing?.play();
    else backing?.stop();
  };

  const onStop = async () => {
    backing?.stop();
    const take = await controller.stop();
    if (!take || !take.uri) return;
    const takes = await openTakesStore();
    await takes.addTake({ libraryId, number: songNumber, path: take.uri, durationMs: take.durationMs });
    setScoring(true);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const collector = collectorRef.current;
    if (collector && midi) {
      const reference = extractMelody(midi);
      const detected = detectFrames(collector.frames(), collector.sampleRate);
      setLastResult(scorePerformance(reference, detected, { lines: parseLyrics(midi) }));
    }
    router.replace({ pathname: "/results/[id]", params: { id, number } });
  };

  if (scoring) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Text>Scoring…</Text>
      </View>
    );
  }
  if (!backing || !ready) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text>{message}</Text>
      </View>
    );
  }
  return (
    <View style={{ flex: 1 }}>
      <RecordView
        title={title}
        singer={singer}
        status={controller.status}
        elapsedSec={controller.elapsedSec}
        level={controller.level}
        error={controller.error}
        onStart={() => void onStart()}
        onStop={() => void onStop()}
      />
      {backing ? (
        <View style={{ height: 1 }}>
          <SynthHost engine={backing} />
        </View>
      ) : null}
    </View>
  );
}
