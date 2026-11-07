import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { getLastResult } from "../../score/results-store";
import { ResultsView } from "../../ui/results-view";

export default function ResultsScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const router = useRouter();
  const stored = getLastResult();
  if (!stored) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text>No result.</Text>
      </View>
    );
  }
  if (stored.result.noteCount === 0) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text>No reference melody for this song.</Text>
      </View>
    );
  }
  return (
    <ResultsView
      result={stored.result}
      funMode={stored.funMode}
      onSingAgain={() => router.back()}
    />
  );
}
