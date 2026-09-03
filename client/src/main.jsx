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
    {/* BASE_URL is "/" locally and "/<repo>/" on a GitHub Pages project site. */}
    <BrowserRouter basename={import.meta.env.BASE_URL} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <StoreProvider>
        <AuthProvider>
          <CartProvider>
            <App />
            <Toaster
              position="bottom-center"
              toastOptions={{
                duration: 3200,
                style: { background: '#111111', color: '#FFFFFF', fontSize: '14px', borderRadius: '10px' },
                success: { iconTheme: { primary: '#526B5A', secondary: '#FFFFFF' } },
                error: { iconTheme: { primary: '#f43f5e', secondary: '#fff' } },
              }}
            />
          </CartProvider>
        </AuthProvider>
      </StoreProvider>
    </BrowserRouter>
  </StrictMode>,
);
