// src/context/CartContext.js
import React, { createContext, useContext, useReducer } from 'react';

const CartContext = createContext(null);

const cartReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_ITEM': {
      const { produto, quantidade } = action.payload;
      const existing = state.itens.find(i => i.id === produto.id);
      if (existing) {
        return {
          ...state,
          itens: state.itens.map(i =>
            i.id === produto.id
              ? { ...i, quantidade: i.quantidade + quantidade }
              : i
          ),
        };
      }
      return {
        ...state,
        itens: [...state.itens, { ...produto, quantidade }],
      };
    }
    case 'REMOVE_ITEM':
      return { ...state, itens: state.itens.filter(i => i.id !== action.payload) };
    case 'UPDATE_QTD': {
      const { id, quantidade } = action.payload;
      if (quantidade <= 0) return { ...state, itens: state.itens.filter(i => i.id !== id) };
      return {
        ...state,
        itens: state.itens.map(i => i.id === id ? { ...i, quantidade } : i),
      };
    }
    case 'SET_DESCONTO':
      return { ...state, desconto: action.payload };
    case 'SET_CLIENTE':
      return { ...state, cliente: action.payload };
    case 'LIMPAR':
      return initialState;
    default:
      return state;
  }
};

const initialState = {
  itens: [],
  desconto: 0,
  cliente: null,
};

export function CartProvider({ children }) {
  const [cart, dispatch] = useReducer(cartReducer, initialState);

  const total = cart.itens.reduce(
    (acc, item) => acc + parseFloat(item.preco_venda) * item.quantidade,
    0
  );
  const totalComDesconto = Math.max(0, total - cart.desconto);
  const qtdItens = cart.itens.reduce((acc, i) => acc + i.quantidade, 0);

  return (
    <CartContext.Provider value={{ cart, dispatch, total, totalComDesconto, qtdItens }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
