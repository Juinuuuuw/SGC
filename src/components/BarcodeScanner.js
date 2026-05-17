// src/components/BarcodeScanner.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  Animated, Dimensions, Vibration,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { colors, spacing, radius, fontSize } from '../utils/theme';

const { width } = Dimensions.get('window');
const SCAN_AREA = width * 0.7;

export default function BarcodeScanner({ visible, onScan, onClose, title = 'Aponte para o código de barras' }) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned] = useState(false);
  const lineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Camera.requestCameraPermissionsAsync().then(({ status }) => {
        setHasPermission(status === 'granted');
      });
      setScanned(false);
      startLineAnimation();
    }
  }, [visible]);

  const startLineAnimation = () => {
    lineAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(lineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(lineAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  };

  const handleBarCodeScanned = ({ type, data }) => {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(80);
    onScan(data);
  };

  const lineTranslateY = lineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCAN_AREA / 2 + 8, SCAN_AREA / 2 - 8],
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>📷 Scanner</Text>
          <View style={{ width: 40 }} />
        </View>

        {hasPermission === false && (
          <View style={styles.noPermission}>
            <Text style={styles.noPermText}>📵</Text>
            <Text style={styles.noPermTitle}>Sem permissão de câmera</Text>
            <Text style={styles.noPermSub}>Habilite nas configurações do dispositivo</Text>
          </View>
        )}

        {hasPermission === true && (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'] }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          >
            {/* Overlay escuro */}
            <View style={styles.overlay}>
              <View style={styles.overlayRow}>
                <View style={styles.overlaySide} />
                <View style={[styles.scanWindow, { width: SCAN_AREA, height: SCAN_AREA }]}>
                  {/* Cantos */}
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />
                  {/* Linha de scan */}
                  <Animated.View style={[styles.scanLine, { transform: [{ translateY: lineTranslateY }] }]} />
                </View>
                <View style={styles.overlaySide} />
              </View>
            </View>

            {/* Bottom hint */}
            <View style={styles.bottomHint}>
              <Text style={styles.hintText}>{title}</Text>
              {scanned && (
                <TouchableOpacity style={styles.rescanBtn} onPress={() => setScanned(false)}>
                  <Text style={styles.rescanTxt}>🔄 Escanear novamente</Text>
                </TouchableOpacity>
              )}
            </View>
          </CameraView>
        )}
      </View>
    </Modal>
  );
}

const CORNER = 24;
const BORDER = 3;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 10,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: colors.white, fontSize: 16, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },
  overlay: { flex: 1 },
  overlayRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  scanWindow: { backgroundColor: 'transparent', position: 'relative', overflow: 'hidden' },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  cornerTL: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER, borderColor: '#fff', borderTopLeftRadius: 4 },
  cornerTR: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER, borderColor: '#fff', borderTopRightRadius: 4 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER, borderColor: '#fff', borderBottomLeftRadius: 4 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER, borderColor: '#fff', borderBottomRightRadius: 4 },
  scanLine: {
    position: 'absolute',
    left: 8, right: 8,
    height: 2,
    backgroundColor: colors.accent,
    borderRadius: 2,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 5,
  },
  bottomHint: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  hintText: { color: colors.white, fontSize: fontSize.md, textAlign: 'center', opacity: 0.9 },
  rescanBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  rescanTxt: { color: colors.white, fontSize: fontSize.sm, fontWeight: '700' },
  noPermission: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  noPermText: { fontSize: 64, marginBottom: spacing.md },
  noPermTitle: { fontSize: fontSize.xl, color: colors.white, fontWeight: '700', marginBottom: spacing.xs },
  noPermSub: { fontSize: fontSize.md, color: 'rgba(255,255,255,0.6)', textAlign: 'center' },
});