import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import { font, useTheme, type Palette } from '@/ui/theme';

/**
 * A26: a long description clamped to `lines`, with Show more / Show less —
 * the Add confirm screen used to cut a blurb off at six lines with no way to
 * read the rest before deciding to add the track.
 *
 * Whether the text overflows is measured, not guessed from its length: an
 * invisible, unclamped copy reports its real line count at the real width
 * (`onTextLayout`). Where no layout event arrives (react-native-web, tests),
 * a character count stands in. The copy is hidden from accessibility, so a
 * screen reader — and a text query — sees the description once.
 */
export function ExpandableText({
  text,
  lines = 6,
  style,
}: {
  text: string;
  lines?: number;
  style?: StyleProp<TextStyle>;
}) {
  const c = useTheme();
  const styles = useMemo(() => createStyles(c), [c]);
  const [expanded, setExpanded] = useState(false);
  const [lineCount, setLineCount] = useState<number | null>(null);

  useEffect(() => {
    setExpanded(false);
    setLineCount(null);
  }, [text]);

  const overflows = lineCount !== null ? lineCount > lines : text.length > lines * 40;

  return (
    <View>
      <Text
        style={[style, styles.measure]}
        onTextLayout={(e) => setLineCount(e.nativeEvent.lines.length)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        aria-hidden
      >
        {text}
      </Text>
      <Text
        style={style}
        numberOfLines={expanded || !overflows ? undefined : lines}
        onPress={overflows ? () => setExpanded((v) => !v) : undefined}
      >
        {text}
      </Text>
      {overflows && (
        <Pressable
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          style={styles.moreButton}
          hitSlop={8}
        >
          <Text style={styles.moreText}>{expanded ? 'Show less' : 'Show more'}</Text>
        </Pressable>
      )}
    </View>
  );
}

function createStyles(c: Palette) {
  return StyleSheet.create({
    measure: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 },
    moreButton: { alignSelf: 'flex-start', paddingVertical: 4, marginTop: 2 },
    moreText: { ...font.labelLarge, color: c.primary, fontWeight: '700', textDecorationLine: 'underline' },
  });
}
