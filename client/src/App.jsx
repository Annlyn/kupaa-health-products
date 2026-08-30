import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import ShopLayout from './layouts/ShopLayout';
import AdminLayout from './layouts/AdminLayout';
import { PageLoader } from './components/ui';

import Home from './pages/shop/Home';
import Shop from './pages/shop/Shop';
import ProductDetail from './pages/shop/ProductDetail';
import Cart from './pages/shop/Cart';
import Login from './pages/Login';
import Register from './pages/Register';
import NotFound from './pages/NotFound';

// The checkout, account and admin bundles are only fetched when needed.
const Checkout = lazy(() => import('./pages/shop/Checkout'));
const OrderSuccess = lazy(() => import('./pages/shop/OrderSuccess'));
const TrackOrder = lazy(() => import('./pages/shop/TrackOrder'));
const Wishlist = lazy(() => import('./pages/shop/Wishlist'));
const Policies = lazy(() => import('./pages/shop/Policies'));
const Account = lazy(() => import('./pages/account/Account'));
const Orders = lazy(() => import('./pages/account/Orders'));
const OrderDetail = lazy(() => import('./pages/account/OrderDetail'));
const Addresses = lazy(() => import('./pages/account/Addresses'));

const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminProducts = lazy(() => import('./pages/admin/Products'));
const AdminProductForm = lazy(() => import('./pages/admin/ProductForm'));
const AdminCategories = lazy(() => import('./pages/admin/Categories'));
const AdminOrders = lazy(() => import('./pages/admin/Orders'));
const AdminOrderDetail = lazy(() => import('./pages/admin/OrderDetail'));
const AdminCustomers = lazy(() => import('./pages/admin/Customers'));
const AdminCoupons = lazy(() => import('./pages/admin/Coupons'));
const AdminReviews = lazy(() => import('./pages/admin/Reviews'));
const AdminSettings = lazy(() => import('./pages/admin/Settings'));
const AdminIntegrations = lazy(() => import('./pages/admin/Integrations'));

function RequireAuth({ children, adminOnly = false }) {
  const { isAuthenticated, isAdmin, booting } = useAuth();
  const location = useLocation();

  if (booting) return <PageLoader label="Checking your session" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return children;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<ShopLayout />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="product/:slug" element={<ProductDetail />} />
          <Route path="cart" element={<Cart />} />
          <Route path="track" element={<TrackOrder />} />
          <Route path="policies" element={<Policies />} />
          <Route path="login" element={<Login />} />
          <Route path="register" element={<Register />} />

          <Route
            path="checkout"
            element={
              <RequireAuth>
                <Checkout />
              </RequireAuth>
            }
          />
          <Route
            path="order/:id/success"
            element={
              <RequireAuth>
                <OrderSuccess />
              </RequireAuth>
            }
          />
          <Route
            path="wishlist"
            element={
              <RequireAuth>
                <Wishlist />
              </RequireAuth>
            }
          />
          <Route
            path="account"
            element={
              <RequireAuth>
                <Account />
              </RequireAuth>
            }
          />
          <Route
            path="account/orders"
            element={
              <RequireAuth>
                <Orders />
              </RequireAuth>
            }
          />
          <Route
            path="account/orders/:id"
            element={
              <RequireAuth>
                <OrderDetail />
              </RequireAuth>
            }
          />
          <Route
            path="account/addresses"
            element={
              <RequireAuth>
                <Addresses />
              </RequireAuth>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Route>

        <Route
          path="/admin"
          element={
            <RequireAuth adminOnly>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="orders" element={<AdminOrders />} />
          <Route path="orders/:id" element={<AdminOrderDetail />} />
          <Route path="products" element={<AdminProducts />} />
          <Route path="products/new" element={<AdminProductForm />} />
          <Route path="products/:id" element={<AdminProductForm />} />
          <Route path="categories" element={<AdminCategories />} />
          <Route path="coupons" element={<AdminCoupons />} />
          <Route path="customers" element={<AdminCustomers />} />
          <Route path="reviews" element={<AdminReviews />} />
          <Route path="settings" element={<AdminSettings />} />
          <Route path="integrations" element={<AdminIntegrations />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
