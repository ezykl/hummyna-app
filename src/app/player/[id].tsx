import { useLocalSearchParams } from "expo-router";
import { useKeepAwake } from "expo-keep-awake";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import type { LyricLine } from "@hummyna/hmp";
import { openHmp, parseLyrics } from "@hummyna/hmp";
import { soundFontBytes } from "../../audio/sf2";
import { loadSynthSources } from "../../audio/synth-assets";
import { usePlayer } from "../../audio/use-player";
import { SynthHost, WebViewSynthEngine } from "../../audio/webview-synth-engine";
import { openLibraryDb } from "../../library/db";
import { libraryKeys } from "../../library/keys";
import { fileByteSource } from "../../platform/file-byte-source";
import { rnCryptoAdapter } from "../../platform/rn-crypto";
import { rnInflateAdapter } from "../../platform/rn-inflate";
import { PlayerView } from "../../ui/player-view";

interface Loaded {
  engine: WebViewSynthEngine;
  title: string;
  singer: string;
  lines: LyricLine[];
  midi: Uint8Array;
}

export default function PlayerScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const store = await openLibraryDb();
        const library = await store.getLibrary(Number(id));
        if (!active) return;
        if (!library) {
          setMessage("Library not found.");
          return;
        }
        // Read the song with the ByteSource held open only as long as needed.
        const source = await fileByteSource(library.path);
        let midi: Uint8Array;
        let title: string;
        let singer: string;
        try {
          const hmp = await openHmp(source, libraryKeys(), {
            crypto: rnCryptoAdapter,
            inflate: rnInflateAdapter,
          });
          const ref = hmp.songs().find((s) => s.number === Number(number));
          if (!ref) {
            setMessage("Song not found in this library.");
            return;
          }
          midi = await hmp.midiFor(ref);
          title = ref.title;
          singer = ref.singer;
        } finally {
          source.close();
        }

        // Surface a missing SoundFont instead of silently playing nothing.
        let sf2: Uint8Array;
        try {
          sf2 = await soundFontBytes();
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "No SoundFont configured.");
          return;
        }

        const { libraryJs, processorJs } = await loadSynthSources();
        const engine = new WebViewSynthEngine({ libraryJs, processorJs, sf2 });
        if (active) {
          setLoaded({ engine, title, singer, lines: parseLyrics(midi), midi });
        }
      } catch (err) {
        if (active) setMessage(err instanceof Error ? err.message : "Couldn't open this song.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id, number]);

  if (!loaded) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text>{message}</Text>
      </View>
    );
  }
  return <PlayerScreenInner {...loaded} />;
}

function PlayerScreenInner({ engine, title, singer, lines, midi }: Loaded) {
  const controller = usePlayer(engine);
  const { load } = controller;
  useKeepAwake();

  // Boot the synth and load the song once the WebView host has mounted
  // (the engine waits for the page's `onLoadEnd` before sending anything).
  useEffect(() => {
    void load(midi);
  }, [load, midi]);

  useEffect(() => {
    return () => engine.dispose();
  }, [engine]);

  return (
    <View style={{ flex: 1 }}>
      <PlayerView title={title} singer={singer} lines={lines} controller={controller} />
      <View style={{ height: 1 }}>
        <SynthHost engine={engine} />
      </View>
    </View>
  );
}
