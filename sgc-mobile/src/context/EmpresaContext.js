// src/context/EmpresaContext.js
// Busca os dados da empresa (incluindo segmento) assim que o usuário faz login
// e os disponibiliza para qualquer componente via useEmpresa().
import React, { createContext, useContext, useState, useEffect } from 'react';
import { getEmpresa } from '../services/api';
import { useAuth } from './AuthContext';

const EmpresaContext = createContext(null);

export function EmpresaProvider({ children }) {
  const { user } = useAuth();

  const [empresa, setEmpresa]   = useState(null);
  const [segmento, setSegmento] = useState('varejista'); // padrão seguro
  const [loading, setLoading]   = useState(false);

  // Recarrega sempre que o usuário logar/deslogar
  useEffect(() => {
    if (!user) {
      setEmpresa(null);
      setSegmento('varejista');
      return;
    }

    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const res = await getEmpresa();
        if (!cancelled && res?.success && res.empresa) {
          setEmpresa(res.empresa);
          setSegmento(res.empresa.segmento || 'varejista');
        }
      } catch {
        // Falha silenciosa — segmento padrão permanece varejista
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  /** Força recarga (ex: após alterar segmento no app) */
  const recarregarEmpresa = async () => {
    try {
      const res = await getEmpresa();
      if (res?.success && res.empresa) {
        setEmpresa(res.empresa);
        setSegmento(res.empresa.segmento || 'varejista');
      }
    } catch {}
  };

  return (
    <EmpresaContext.Provider value={{ empresa, segmento, loading, recarregarEmpresa }}>
      {children}
    </EmpresaContext.Provider>
  );
}

export const useEmpresa = () => useContext(EmpresaContext);
