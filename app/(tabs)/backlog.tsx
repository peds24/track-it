import { Text, View } from 'react-native';
import { theme } from '@/ui/theme';

export default function BacklogScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: theme.color.bg, padding: theme.space.lg }}>
      <Text style={{ ...theme.font.title, color: theme.color.text }}>Backlog</Text>
    </View>
  );
}
