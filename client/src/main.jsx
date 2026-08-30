import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { CartProvider } from './context/CartContext';
import { StoreProvider } from './context/StoreContext';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <StoreProvider>
        <AuthProvider>
          <CartProvider>
            <App />
            <Toaster
              position="bottom-center"
              toastOptions={{
                duration: 3200,
                style: { background: '#1d2126', color: '#fff', fontSize: '14px', borderRadius: '10px' },
                success: { iconTheme: { primary: '#14b89d', secondary: '#fff' } },
                error: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } },
              }}
            />
          </CartProvider>
        </AuthProvider>
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
