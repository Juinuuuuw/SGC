// src/services/printer.js
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@sgc:print_queue';
// URL do endpoint que recebe os comandos e imprime
const PRINT_SERVER_URL = 'http://192.168.0.7/sgc/api/imprimir.php';  // ajuste para o IP real do servidor

let filaLocal = [];

export async function initPrinter() {
  try {
    const data = await AsyncStorage.getItem(STORAGE_KEY);
    filaLocal = data ? JSON.parse(data) : [];
  } catch (e) {
    console.warn('Erro ao carregar fila de impressão:', e);
  }
}

async function persistirFila() {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filaLocal));
}

export async function imprimir(comando) {
  filaLocal.push(comando);
  await persistirFila();
  await processarFila();
}

export async function processarFila() {
  while (filaLocal.length > 0) {
    const cmd = filaLocal[0];
    try {
      await enviarComandoHTTP(cmd);
      filaLocal.shift();
      await persistirFila();
    } catch (e) {
      console.warn('Impressora offline, nova tentativa em 10s...');
      setTimeout(processarFila, 10000);
      break;
    }
  }
}

async function enviarComandoHTTP(comando) {
  const response = await fetch(PRINT_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: base64Encode(comando) }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || 'Erro na impressão');
  }
}

function base64Encode(str) {
  // Polyfill simples para base64 (funciona no React Native)
  return btoa(unescape(encodeURIComponent(str)));
}