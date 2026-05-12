import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type ActiveGameBannerProps = {
  onPress: () => void;
  subtitle?: string;
};

export function ActiveGameBanner({ onPress, subtitle }: ActiveGameBannerProps) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.textGroup}>
        <Text style={styles.title}>Partida activa</Text>
        <Text style={styles.subtitle}>{subtitle ?? 'Tienes una partida en curso.'}</Text>
      </View>
      <TouchableOpacity style={styles.button} onPress={onPress}>
        <Text style={styles.buttonText}>Volver</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: 'rgba(10, 25, 40, 0.96)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FCEEB5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  textGroup: {
    flex: 1,
  },
  title: {
    color: '#FCEEB5',
    fontSize: 16,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#d7dce2',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 18,
  },
  button: {
    backgroundColor: '#A8C8C0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
  },
  buttonText: {
    color: '#10212e',
    fontWeight: 'bold',
  },
});
