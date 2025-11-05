import { useContext } from 'react';
import { StoreContext } from '../stores/StoreContext';

export const useStore = () => {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error('useStore must be used within a StoreProvider');
  }
  return store;
};

export const usePropertyStore = () => {
  const { propertyStore } = useStore();
  return propertyStore;
};

export const useCartStore = () => {
  const { cartStore } = useStore();
  return cartStore;
};
