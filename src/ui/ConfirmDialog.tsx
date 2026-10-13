import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, space, type } from './theme';

/** A yes/no confirmation, used instead of `Alert.alert` for anything destructive.
 *  `Alert.alert` is a documented no-op on react-native-web (confirmed from its source:
 *  `class Alert { static alert() {} }`) — any confirm dialog built on it silently does
 *  nothing on web, which is exactly what made "Delete this card" look broken when tested
 *  in the browser: the button worked, but the confirmation it was waiting on never
 *  appeared, so `onPress` for "Delete" never fired. `Modal` (unlike `Alert`) is actually
 *  implemented in react-native-web, so this renders identically on native and web. */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        {/* Swallow the tap so pressing the box itself doesn't fall through to the backdrop's onCancel. */}
        <Pressable style={styles.box} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.row}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelLabel}</Text>
            </Pressable>
            <Pressable style={[styles.confirmBtn, destructive && styles.confirmBtnDanger]} onPress={onConfirm}>
              <Text style={[styles.confirmText, destructive && styles.confirmTextDanger]}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(30,27,22,0.45)', alignItems: 'center', justifyContent: 'center', padding: space.lg },
  box: { width: '100%', maxWidth: 360, backgroundColor: colors.paperQuiet, borderRadius: radius.lg, padding: space.lg },
  title: { ...type.quietDisplay, fontSize: 19, marginBottom: space.xs },
  message: { fontFamily: 'Manrope_500Medium', fontSize: 14, color: colors.inkSoft, lineHeight: 20, marginBottom: space.lg },
  row: { flexDirection: 'row', gap: space.sm },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineQuiet,
    alignItems: 'center',
  },
  cancelText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: colors.inkSoft },
  confirmBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.md, backgroundColor: colors.ink, alignItems: 'center' },
  confirmBtnDanger: { backgroundColor: colors.danger },
  confirmText: { fontFamily: 'Manrope_700Bold', fontSize: 14, color: '#fff' },
  confirmTextDanger: { color: '#fff' },
});
