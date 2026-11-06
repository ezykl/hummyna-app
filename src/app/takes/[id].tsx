import { useAudioPlayer } from "expo-audio";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { File } from "expo-file-system";
import type { TakeRecord } from "../../library/takes";
import { openTakesStore } from "../../library/db";
import { TakesView } from "../../ui/takes-view";

export default function TakesScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const libraryId = Number(id);
  const songNumber = Number(number);
  const [takes, setTakes] = useState<TakeRecord[]>([]);
  const [playingPath, setPlayingPath] = useState<string | null>(null);
  const player = useAudioPlayer();

  const refresh = useCallback(async () => {
    const store = await openTakesStore();
    setTakes(await store.listTakes(libraryId, songNumber));
  }, [libraryId, songNumber]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => () => player.remove(), [player]);

  const onPlay = (take: TakeRecord) => {
    player.replace(take.path);
    player.play();
    setPlayingPath(take.path);
  };

  const onDelete = async (take: TakeRecord) => {
    if (take.path === playingPath) {
      player.pause();
      setPlayingPath(null);
    }
    const store = await openTakesStore();
    await store.deleteTake(take.id);
    try {
      const file = new File(take.path);
      if (file.exists) file.delete();
    } catch {
      // best effort — the row is already gone
    }
    await refresh();
  };

  return (
    <View style={{ flex: 1 }}>
      <TakesView takes={takes} onPlay={onPlay} onDelete={(take) => void onDelete(take)} />
    </View>
  );
}
