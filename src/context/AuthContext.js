// src/context/AuthContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login as apiLogin, logout as apiLogout } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('@sgc:user');
        if (saved) setUser(JSON.parse(saved));
      } catch {}
      setLoading(false);
    })();
  }, []);

  const login = async (email, senha) => {
    const data = await apiLogin(email, senha);
    if (data.success) {
      const userData = data.usuario || { email, nome: data.nome || 'Usuário' };
      setUser(userData);
      await AsyncStorage.setItem('@sgc:user', JSON.stringify(userData));
    }
    return data;
  };

  const logout = async () => {
    try { await apiLogout(); } catch {}
    setUser(null);
    await AsyncStorage.removeItem('@sgc:user');
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
