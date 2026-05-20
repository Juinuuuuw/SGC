// src/navigation/AppNavigator.js
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator }     from '@react-navigation/stack';

import { useAuth }    from '../context/AuthContext';
import { useEmpresa } from '../context/EmpresaContext';

import LoginScreen      from '../screens/LoginScreen';
import HomeScreen       from '../screens/HomeScreen';
import PDVScreen        from '../screens/PDVScreen';
import ConferenciaScreen from '../screens/ConferenciaScreen';
import MesasScreen      from '../screens/MesasScreen';
import MesaPedidoScreen from '../screens/MesaPedidoScreen';

import { colors, fontSize } from '../utils/theme';

const Tab   = createBottomTabNavigator();
const Stack = createStackNavigator();

// ── Ícones de abas ────────────────────────────────────────
const TAB_ICONS = {
  Home:       '🏠',
  PDV:        '🏪',
  Mesas:      '🍽️',
  Conferencia:'📦',
};

// ── Stack interno para Mesas (grid → pedido) ──────────────
function MesasStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MesasGrid"  component={MesasScreen} />
      <Stack.Screen
        name="MesaPedido"
        component={MesaPedidoScreen}
        options={{ gestureEnabled: true }}
      />
    </Stack.Navigator>
  );
}

// ── Abas principais ───────────────────────────────────────
function MainTabs() {
  const { segmento } = useEmpresa();
  const isRestaurante = segmento === 'restaurante';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.white,
          borderTopColor:  colors.border,
          borderTopWidth:  1,
          height:          64,
          paddingBottom:   8,
          paddingTop:      6,
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: focused ? 26 : 22 }}>
            {TAB_ICONS[route.name] || '●'}
          </Text>
        ),
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Início' }}
      />

      {/* PDV: para varejista é a aba principal de vendas;
          para restaurante fica como "PDV Avulso" */}
      <Tab.Screen
        name="PDV"
        component={PDVScreen}
        options={{ tabBarLabel: isRestaurante ? 'Avulso' : 'PDV' }}
      />

      {/* Aba de Mesas: aparece somente para restaurante */}
      {isRestaurante && (
        <Tab.Screen
          name="Mesas"
          component={MesasStack}
          options={{ tabBarLabel: 'Mesas' }}
        />
      )}

      <Tab.Screen
        name="Conferencia"
        component={ConferenciaScreen}
        options={{ tabBarLabel: 'Conferência' }}
      />
    </Tab.Navigator>
  );
}

// ── Navigator raiz ────────────────────────────────────────
export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={colors.white} />
        <Text style={styles.loadingTxt}>SGC Mobile</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  loadingTxt: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    marginTop: 16,
  },
});
