// App.js
import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider }    from './src/context/AuthContext';
import { CartProvider }    from './src/context/CartContext';
import { EmpresaProvider } from './src/context/EmpresaContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {/* AuthProvider deve ser o mais externo (EmpresaProvider depende dele) */}
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
