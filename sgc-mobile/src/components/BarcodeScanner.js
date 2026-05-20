// src/components/BarcodeScanner.js
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Modal, Animated, Dimensions, Vibration,
} from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import { colors, spacing, radius, fontSize } from '../utils/theme';

const { width } = Dimensions.get('window');
const SCAN_AREA = width * 0.72;

// Cooldown entre scans no modo contínuo (ms)
const CONTINUOUS_COOLDOWN = 1400;

/**
 * BarcodeScanner
 *
 * Props:
 *  visible          {boolean}  – controla exibição
 *  onScan           {fn}       – chamado com (barcode: string) em modo normal
 *  onClose          {fn}       – botão fechar
 *  title            {string}   – texto de instrução
 *
 *  continuous       {boolean}  – modo leitura contínua (padrão: false)
 *  onContinuousScan {fn}       – chamado com (barcode: string) a cada leitura;
 *                                o scanner NÃO fecha após o scan
 *  lastScanned      {Array}    – lista dos últimos itens [{ barcode, nome, preco_venda }]
 *                                para exibição no modo contínuo
 */
export default function BarcodeScanner({
  visible,
  onScan,
  onClose,
  title = 'Aponte para o código de barras',
  continuous = false,
  onContinuousScan,
  lastScanned = [],
}) {
  const [hasPermission, setHasPermission] = useState(null);
  const [scanned, setScanned]             = useState(false);
  const [flashFeedback, setFlashFeedback] = useState(null); // { ok, texto }

  const lineAnim    = useRef(new Animated.Value(0)).current;
  const flashAnim   = useRef(new Animated.Value(0)).current;
  const cooldownRef = useRef(null);

  // ── Permissões + reset ao abrir ──────────────────────────
  useEffect(() => {
    if (!visible) return;
    Camera.requestCameraPermissionsAsync().then(({ status }) =>
      setHasPermission(status === 'granted')
    );
    setScanned(false);
    setFlashFeedback(null);
    startLineAnimation();

    return () => { clearTimeout(cooldownRef.current); };
  }, [visible]);

  // ── Animação da linha ────────────────────────────────────
  const startLineAnimation = () => {
    lineAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(lineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(lineAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    ).start();
  };

  // ── Flash de feedback (modo contínuo) ────────────────────
  const showFlash = useCallback((ok, texto) => {
    setFlashFeedback({ ok, texto });
    flashAnim.setValue(1);
    Animated.timing(flashAnim, {
      toValue: 0,
      duration: 900,
      useNativeDriver: true,
    }).start(() => setFlashFeedback(null));
  }, [flashAnim]);

  // ── Handler de leitura ───────────────────────────────────
  const handleBarCodeScanned = useCallback(({ data }) => {
    if (scanned) return;
    setScanned(true);
    Vibration.vibrate(60);

    if (continuous && onContinuousScan) {
      // Modo contínuo: notifica e re-habilita após cooldown
      onContinuousScan(data);
      cooldownRef.current = setTimeout(() => setScanned(false), CONTINUOUS_COOLDOWN);
    } else {
      // Modo normal: fecha/passa o código ao pai
      onScan?.(data);
    }
  }, [scanned, continuous, onContinuousScan, onScan]);

  // Callback externo para exibir feedback no modo contínuo
  // O pai chama scanner.showFeedback(ok, texto) via ref se quiser
  // Ou o pai simplesmente atualiza lastScanned e os chips aparecem

  const lineTranslateY = lineAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [-(SCAN_AREA / 2 - 8), (SCAN_AREA / 2 - 8)],
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {continuous ? '🔁 Modo Contínuo' : '📷 Scanner'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {hasPermission === false && (
          <View style={styles.noPermission}>
            <Text style={{ fontSize: 64 }}>📵</Text>
            <Text style={styles.noPermTitle}>Sem permissão de câmera</Text>
            <Text style={styles.noPermSub}>Habilite nas configurações do dispositivo.</Text>
          </View>
        )}

        {hasPermission === true && (
          <CameraView
            style={StyleSheet.absoluteFill}
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e', 'itf14'],
            }}
            onBarcodeScanned={scanned && !continuous ? undefined : handleBarCodeScanned}
          >
            {/* Overlay escuro ao redor da janela */}
            <View style={styles.overlay}>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              <View style={{ flexDirection: 'row' }}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
                <View style={[styles.scanWindow, { width: SCAN_AREA, height: SCAN_AREA }]}>
                  {/* Cantos */}
                  <View style={[styles.corner, styles.cTL]} />
                  <View style={[styles.corner, styles.cTR]} />
                  <View style={[styles.corner, styles.cBL]} />
                  <View style={[styles.corner, styles.cBR]} />
                  {/* Linha animada */}
                  <Animated.View
                    style={[styles.scanLine, { transform: [{ translateY: lineTranslateY }] }]}
                  />
                </View>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
              </View>
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
            </View>

            {/* Flash de feedback (modo contínuo) */}
            {flashFeedback && (
              <Animated.View
                style={[
                  styles.flashOverlay,
                  { opacity: flashAnim },
                  { borderColor: flashFeedback.ok ? colors.success : colors.danger },
                ]}
                pointerEvents="none"
              >
                <Text style={styles.flashIcon}>{flashFeedback.ok ? '✅' : '❌'}</Text>
                <Text style={styles.flashTxt} numberOfLines={2}>{flashFeedback.texto}</Text>
              </Animated.View>
            )}

            {/* Bottom panel */}
            <View style={styles.bottom}>
              <Text style={styles.hintTxt}>{title}</Text>

              {/* Últimos 3 escaneados (modo contínuo) */}
              {continuous && lastScanned.length > 0 && (
                <View style={styles.lastScanned}>
                  <Text style={styles.lastScannedLabel}>Últimos lidos:</Text>
                  {[...lastScanned].reverse().slice(0, 3).map((item, i) => (
                    <View
                      key={i}
                      style={[
                        styles.lastItem,
                        i === 0 && styles.lastItemFirst,
                      ]}
                    >
                      <Text style={styles.lastItemNome} numberOfLines={1}>
                        {item.nome || item.barcode}
                      </Text>
                      {item.preco_venda != null && (
                        <Text style={styles.lastItemPreco}>
                          R$ {parseFloat(item.preco_venda).toFixed(2).replace('.', ',')}
                        </Text>
                      )}
                      {item.notFound && (
                        <Text style={styles.lastItemNotFound}>Não encontrado</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}

              {/* Botão re-scan (modo normal, após scan) */}
              {!continuous && scanned && (
                <TouchableOpacity
                  style={styles.rescanBtn}
                  onPress={() => setScanned(false)}
                >
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

const C = 24, B = 3; // corner size, border width

const styles = StyleSheet.create({
  root:     { flex: 1, backgroundColor: '#000' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 52,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.75)',
    zIndex: 10,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  closeTxt: { color: colors.white, fontSize: 16, fontWeight: '700' },
  headerTitle: { color: colors.white, fontSize: fontSize.lg, fontWeight: '700' },

  overlay: { ...StyleSheet.absoluteFillObject },

  scanWindow: { backgroundColor: 'transparent', position: 'relative', overflow: 'hidden' },

  corner:  { position: 'absolute', width: C, height: C },
  cTL: { top: 0, left: 0,  borderTopWidth: B,    borderLeftWidth: B,  borderColor: '#fff', borderTopLeftRadius: 4 },
  cTR: { top: 0, right: 0, borderTopWidth: B,    borderRightWidth: B, borderColor: '#fff', borderTopRightRadius: 4 },
  cBL: { bottom: 0, left: 0,  borderBottomWidth: B, borderLeftWidth: B,  borderColor: '#fff', borderBottomLeftRadius: 4 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: B, borderRightWidth: B, borderColor: '#fff', borderBottomRightRadius: 4 },

  scanLine: {
    position: 'absolute',
    left: 8, right: 8, height: 2,
    backgroundColor: colors.accent,
    borderRadius: 2,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9, shadowRadius: 6, elevation: 5,
  },

  // Flash overlay (contínuo)
  flashOverlay: {
    position: 'absolute',
    bottom: 160,
    left: spacing.xl,
    right: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.82)',
    borderRadius: radius.lg,
    borderWidth: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  flashIcon: { fontSize: 24 },
  flashTxt:  { flex: 1, color: colors.white, fontSize: fontSize.md, fontWeight: '600' },

  bottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.78)',
    paddingTop: spacing.md,
    paddingBottom: 36,
    paddingHorizontal: spacing.lg,
  },
  hintTxt: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  // Últimos escaneados
  lastScanned: { marginTop: spacing.xs },
  lastScannedLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  lastItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.sm,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 5,
  },
  lastItemFirst: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  lastItemNome: {
    flex: 1,
    color: colors.white,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginRight: spacing.sm,
  },
  lastItemPreco: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
  lastItemNotFound: {
    color: colors.danger,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },

  rescanBtn: {
    alignSelf: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    marginTop: spacing.sm,
  },
  rescanTxt: { color: colors.white, fontSize: fontSize.sm, fontWeight: '700' },

  noPermission: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  noPermTitle: { fontSize: fontSize.xl, color: colors.white, fontWeight: '700', marginBottom: 6 },
  noPermSub:   { fontSize: fontSize.md, color: 'rgba(255,255,255,0.55)', textAlign: 'center' },
});
