import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useExpoMicRecorder } from "../../audio/expo-mic-recorder";
import { loadSong } from "../../audio/load-song";
import { soundFontBytes } from "../../audio/sf2";
import { loadSynthSources } from "../../audio/synth-assets";
import { useRecorder } from "../../audio/use-recorder";
import { SynthHost, WebViewSynthEngine } from "../../audio/webview-synth-engine";
import { openTakesStore } from "../../library/db";
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

  useEffect(() => {
    let active = true;
    (async () => {
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
      const engine = new WebViewSynthEngine({ libraryJs, processorJs, sf2 });
      await engine.init().catch(() => {});
      await engine.load(loaded.midi).catch(() => {});
      if (!active) return;
      setTitle(loaded.ref.title);
      setSinger(loaded.ref.singer);
      setBacking(engine);
    })();
    return () => {
      active = false;
    };
  }, [libraryId, songNumber]);

  useEffect(() => () => backing?.dispose(), [backing]);

  const onStart = () => {
    void controller.start();
    backing?.play();
  };

  const onStop = async () => {
    backing?.stop();
    const take = await controller.stop();
    if (!take || !take.uri) return;
    const takes = await openTakesStore();
    await takes.addTake({ libraryId, number: songNumber, path: take.uri, durationMs: take.durationMs });
    router.replace({ pathname: "/takes/[id]", params: { id, number } });
  };

  if (!backing && message !== "Loading...") {
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
        onStart={onStart}
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
