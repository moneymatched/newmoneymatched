import React from 'react';
import { RootStore, rootStore } from './RootStore';
import { StoreContext } from './StoreContext';

interface StoreProviderProps {
    children: React.ReactNode;
    store?: RootStore;
  }
  
  export const StoreProvider: React.FC<StoreProviderProps> = ({ 
    children, 
    store = rootStore 
  }) => {
    return (
      <StoreContext.Provider value={store}>
        {children}
      </StoreContext.Provider>
    );
  };
  