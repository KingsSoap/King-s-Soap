import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import CheckAdminPerm from "./components/CheckAdminPerm";
import AdminHeader from "./components/AdminHeader";
import supabase from "./supabaseClient";

import { useAuth } from "./context/AuthContext";

import Home from "./Pages/Home";
import Shop from "./Pages/Shop";
import About from "./Pages/About";
import Cart from "./Pages/Cart";
import Login from "./Pages/Login";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import VerifyAccount from "./Pages/VerifyAccount";
import CreateAccount from "./Pages/CreateAccount";
import EmailToPWReset from "./Pages/EmailToPWReset";
import UserChangePassword from "./Pages/UserChangePassword";
import PaymentSuccessful from "./Pages/PaymentSuccessful";
import RequestCancellation from "./Pages/RequestCancellation.jsx";
import ProductPage from "./Pages/ProductPage.jsx";
import AdminProducts from "./Pages/AdminProducts.jsx";
import AdminInbox from "./Pages/AdminInbox.jsx";
import AdminDiscounts from "./Pages/AdminDiscounts";
import CoconutOilShop from "./Pages/CoconutOilShop.jsx";
import OrganicShop from "./Pages/OrganicShop.jsx";
import AllNaturalShop from "./Pages/AllNaturalShop.jsx";
import SoapDishShop from "./Pages/SoapDishShop.jsx";
import AdminOrders from "./Pages/AdminOrders.jsx";
import AdminArchivedOrders from "./Pages/AdminArchivedOrders.jsx";
import AdminPostagePage from "./Pages/AdminShipping.jsx";
import OrderHistory from "./components/OrderHistory.jsx";
import AdminArchive from "./Pages/AdminArchive.jsx";
import AdminOrderDetails from "./Pages/AdminOrderDetails.jsx";

function AppContent({ children }) {
  const location = useLocation();
  const isAdminPage = location.pathname
    .toLowerCase()
    .startsWith("/admin");

  return isAdminPage ? null : children;
}

function CartRouteLayer({ children }) {
  const location = useLocation();
  const isCartRoute = location.pathname.toLowerCase() === "/cart";

  let backgroundLocation = isCartRoute
    ? location.state?.backgroundLocation
    : null;

  // Restore the background when returning from checkout.
  if (isCartRoute && !backgroundLocation) {
    try {
      const savedLocation = JSON.parse(
        sessionStorage.getItem("checkoutCartBackground") || "null"
      );

      if (
        typeof savedLocation?.pathname === "string" &&
        savedLocation.pathname.startsWith("/") &&
        savedLocation.pathname.toLowerCase() !== "/cart"
      ) {
        backgroundLocation = savedLocation;
      }
    } catch {
      backgroundLocation = null;
    }

    // Use Shop if no previous background was saved.
    backgroundLocation = backgroundLocation || {
      pathname: "/shop",
      search: "",
      hash: "",
    };
  }

  return (
    <>
      <div className={backgroundLocation ? "hidden md:block" : ""}>
        {children(backgroundLocation || location)}
      </div>

      {isCartRoute && backgroundLocation && (
        <Cart restoredBackgroundLocation={backgroundLocation} />
      )}
    </>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <p>Loading...</p>;
  }

  return user ? children : <Navigate to="/login" replace />;
}


function PageLayout({ children }) {
  const location = useLocation();
  const isLoginPage = location.pathname.toLowerCase() === "/login";

  const { data } = supabase.storage
    .from("Product Images")
    .getPublicUrl("images/login-background-image.jpg");

  return (
    <div className="relative flex min-h-screen flex-col">
      {isLoginPage && (
        <>
          <img
            src={data.publicUrl}
            alt=""
            className="absolute inset-0 h-full w-full object-cover z-0"
          />
          <div
            className="absolute inset-0 z-0 bg-black/25"
            aria-hidden="true"
          />
        </>
      )}

      <div className="relative z-10 flex flex-1 flex-col">
        {children}
      </div>
    </div>
  );
}


function App() {
  return (
    <BrowserRouter>
      <AppContent>
        <Navbar />
      </AppContent>

    <PageLayout>
          <div className="flex-grow">
          <CartRouteLayer>
            {(routeLocation) => (
              <Routes location={routeLocation}>
                <Route path="/" element={<Home />} />
                <Route path="/shop" element={<Shop />} />
                <Route path="/about" element={<About />} />
                <Route path="/login" element={<Login />} />
                <Route path="/cart" element={<Cart />} />
                <Route
                  path="/orderHistory"
                  element={
                    <ProtectedRoute>
                      <OrderHistory />
                    </ProtectedRoute>
                      }
                    />    
                <Route
                  path="/userChangePassword"
                  element={
                    <ProtectedRoute>
                      <UserChangePassword />
                    </ProtectedRoute>
                  }
                />
                <Route path="/verifyaccount" element={<VerifyAccount />} />
                <Route path="/createaccount" element={<CreateAccount />} />
                <Route path="/emailToPWReset" element={<EmailToPWReset />} />
                <Route
                  path="/paymentSuccessful"
                  element={<PaymentSuccessful />}
                />
                <Route
                  path="/request-cancellation"
                  element={<RequestCancellation />}
                />
                <Route path="/product/:id" element={<ProductPage />} />

                <Route path="/coconutOilShop" element={<CoconutOilShop />} />
                <Route path="/organicShop" element={<OrganicShop />} />
                <Route path="/allNaturalShop" element={<AllNaturalShop />} />
                <Route path="/soapDishShop" element={<SoapDishShop />} />

                <Route element={<CheckAdminPerm />}>
                  <Route path="/admin" element={<AdminProducts />} />
                  <Route path="/adminInbox" element={<AdminInbox />} />
                  <Route
                    path="/adminChangePassword"
                    element={
                      <>
                        <div className="absolute inset-x-0 top-0 z-40">
                          <AdminHeader />
                        </div>
                        <UserChangePassword returnTo="/admin" />
                      </>
                    }
                  />
                  <Route path="/adminProducts" element={<AdminProducts />} />
                  
                  <Route
                    path="/adminDiscounts"
                    element={<AdminDiscounts />}
                  />
                  <Route path="/adminOrders" element={<AdminOrders />} />
                  <Route
                    path="/adminArchivedOrders"
                    element={<AdminArchivedOrders />}
                  />
                  <Route path="/adminArchive" element={<AdminArchive />} />
                  <Route
                    path="/admin/shipping"
                    element={<AdminPostagePage />}
                  />
                  <Route
                    path="/adminShipping"
                    element={<AdminPostagePage />}
                  />
                  <Route
                    path="/adminPostage"
                    element={<AdminPostagePage />}
                  />
                  <Route
                    path="/adminOrders/:id"
                    element={<AdminOrderDetails />}
                  />
                </Route>
              </Routes>
            )}
          </CartRouteLayer>
        </div>

        <AppContent>
          <Footer />
        </AppContent>
      </PageLayout>
    </BrowserRouter>
  );
}

export default App;