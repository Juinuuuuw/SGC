import 'react-native-gesture-handler';
import React, { useEffect } from 'react';   // ← importe useEffect
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider }    from './src/context/AuthContext';
import { CartProvider }    from './src/context/CartContext';
import { EmpresaProvider } from './src/context/EmpresaContext';
import { initPrinter } from './src/services/printer';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  // Inicializa a fila de impressão ao montar o app
  useEffect(() => {
    initPrinter();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <EmpresaProvider>
            <CartProvider>
              <StatusBar style="light" />
              <AppNavigator />
            </CartProvider>
          </EmpresaProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}