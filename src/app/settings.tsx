import { useCallback, useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { clearImportedSoundFont, describeSoundFont, importSoundFont } from "../audio/sf2";
import { SettingsView } from "../ui/settings-view";

export default function SettingsScreen() {
  const [name, setName] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setName((await describeSoundFont()).name);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onSelect = async () => {
    try {
      const picked = await importSoundFont();
      if (picked) await refresh();
    } catch (err) {
      Alert.alert("SoundFont", err instanceof Error ? err.message : "Couldn't import the SoundFont.");
    }
  };

  const onClear = async () => {
    await clearImportedSoundFont();
    await refresh();
  };

  return (
    <View style={{ flex: 1 }}>
      <SettingsView soundFontName={name} onSelect={() => void onSelect()} onClear={() => void onClear()} />
    </View>
  );
}
