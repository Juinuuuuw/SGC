// src/navigation/AppNavigator.js
import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { CardStyleInterpolators } from '@react-navigation/stack';

import { useAuth } from '../context/AuthContext';
import { useEmpresa } from '../context/EmpresaContext';

import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import PDVScreen from '../screens/PDVScreen';
import ConferenciaScreen from '../screens/ConferenciaScreen';
import MesasScreen from '../screens/MesasScreen';
import MesaPedidoScreen from '../screens/MesaPedidoScreen';

import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons';
import { colors, fontSize, shadow } from '../utils/theme';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

// ════════════════════════════════════════════════════════════
//  CONFIGURAÇÃO DE ANIMAÇÃO DAS TELAS
// ════════════════════════════════════════════════════════════
const screenOptions = {
  headerShown: false,
  gestureEnabled: true,
  cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
  transitionSpec: {
    open: {
      animation: 'timing',
      config: {
        duration: 350,
      },
    },
    close: {
      animation: 'timing',
      config: {
        duration: 300,
      },
    },
  },
};

// ── Stack interno para Mesas (grid → pedido) ──────────────
function MesasStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MesasGrid" component={MesasScreen} />
      <Stack.Screen
        name="MesaPedido"
        component={MesaPedidoScreen}
        options={{
          gestureEnabled: true,
          cardStyleInterpolator: CardStyleInterpolators.forHorizontalIOS,
        }}
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
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: Platform.OS === 'ios' ? 85 : 64,
          paddingBottom: Platform.OS === 'ios' ? 25 : 8,
          paddingTop: 8,
          ...shadow.md,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIcon: ({ focused, color, size }) => {
          const iconSize = focused ? 24 : 22;
          const iconColor = focused ? colors.primary : colors.textMuted;

          switch (route.name) {
            case 'Home':
              return (
                <View style={[tabStyles.iconContainer, focused && tabStyles.iconActive]}>
                  <Ionicons
                    name={focused ? 'home' : 'home-outline'}
                    size={iconSize}
                    color={iconColor}
                  />
                </View>
              );

            case 'PDV':
              return (
                <View style={[tabStyles.iconContainer, focused && tabStyles.iconActive]}>
                  <MaterialCommunityIcons
                    name={focused ? 'cart' : 'cart-outline'}
                    size={iconSize}
                    color={iconColor}
                  />
                </View>
              );

            case 'Mesas':
              return (
                <View style={[tabStyles.iconContainer, focused && tabStyles.iconActive]}>
                  <MaterialCommunityIcons
                    name={focused ? 'table-furniture' : 'table-furniture'}
                    size={iconSize}
                    color={iconColor}
                  />
                </View>
              );

            case 'Conferencia':
              return (
                <View style={[tabStyles.iconContainer, focused && tabStyles.iconActive]}>
                  <FontAwesome5
                    name="clipboard-check"
                    size={iconSize - 2}
                    color={iconColor}
                  />
                </View>
              );

            default:
              return (
                <Ionicons name="ellipse" size={iconSize} color={iconColor} />
              );
          }
        },
      })}
    >
      {/* Início */}
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: 'Início' }}
      />

      {/* PDV */}
      <Tab.Screen
        name="PDV"
        component={PDVScreen}
        options={{ tabBarLabel: isRestaurante ? 'Avulso' : 'PDV' }}
      />

      {/* Mesas (apenas Restaurante) */}
      {isRestaurante && (
        <Tab.Screen
          name="Mesas"
          component={MesasStack}
          options={{ tabBarLabel: 'Mesas' }}
        />
      )}

      {/* Conferência */}
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

  // Tela de loading enquanto verifica autenticação
  if (loading) {
    return (
      <View style={styles.loading}>
        <View style={styles.loadingLogo}>
          <Ionicons name="storefront" size={48} color={colors.white} />
        </View>
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 24 }} />
        <Text style={styles.loadingTitle}>SGC</Text>
        <Text style={styles.loadingSub}>Sistema de Gestão Comercial</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={screenOptions}>
        {user ? (
          <Stack.Screen
            name="Main"
            component={MainTabs}
            options={{
              cardStyleInterpolator: CardStyleInterpolators.forFadeFromCenter,
            }}
          />
        ) : (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{
              cardStyleInterpolator: CardStyleInterpolators.forFadeFromBottomAndroid,
            }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

// ── Styles ────────────────────────────────────────────────────
const tabStyles = StyleSheet.create({
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActive: {
    backgroundColor: colors.primary + '12',
  },
});

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  loadingLogo: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  loadingTitle: {
    color: colors.white,
    fontSize: 32,
    fontWeight: '800',
    marginTop: 16,
    letterSpacing: 3,
  },
  loadingSub: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.5,
  },
});