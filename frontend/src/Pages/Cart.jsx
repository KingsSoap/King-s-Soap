import { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import CartElement from "../components/CartElement";
import { useAuth } from "../context/AuthContext";

const Cart = ({ restoredBackgroundLocation = null }) => {
  const [total, setTotal] = useState(0);
  const { session, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const backgroundLocation =
    location.state?.backgroundLocation || restoredBackgroundLocation;

  const isOverlay = Boolean(backgroundLocation);
  const [searchParams] = useSearchParams();
  const isCanceled = searchParams.get("canceled") === "true";
  const [submittingType, setSubmittingType] = useState(null); // 'shipping' | 'pickup'
  const isSubmitting = Boolean(submittingType);
  const [error, setError] = useState(null);
  const [discountCode, setDiscountCode] = useState(""); // Code entered before checkout
  const [applyingDiscount, setApplyingDiscount] = useState(false); // Prevent repeat Apply requests.
  const [appliedDiscount, setAppliedDiscount] = useState(null); // Holds the validated discount preview.
  const [guestEmail, setGuestEmail] = useState("");

  // A cart change makes the previously calculated discount estimate outdated.
  useEffect(() => {
    if (appliedDiscount && Math.round(total * 100) !== Math.round(appliedDiscount.subtotal * 100)) {
      setAppliedDiscount(null);
    }
  }, [total, appliedDiscount]);

  const handleApplyDiscount = async () => {
    if (applyingDiscount) return;

    setApplyingDiscount(true);
    setAppliedDiscount(null);
    setError(null);

    try {
      const headers = {
        "Content-Type": "application/json",
      };
      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const guestCart = JSON.parse(localStorage.getItem("guestCart") || "[]");

      const response = await fetch(
      `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/checkout/preview-discount`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ 
          discountCode: discountCode.trim(),
          items: guestCart // <-- This ensures guests send their items for weight/price validation
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to check discount code.");
      }

      setAppliedDiscount(data);
    } catch (err) {
      console.error("Discount preview error:", err);
      setError(err.message);
    } finally {
      setApplyingDiscount(false);
    }
  };

  const handleCheckout = async (checkoutType = "shipping") => {

    if (total <= 0) {
      setError("Your cart is empty.");
      return;
    }

    //validate guest email if user is not logged in
    if (!user && (!guestEmail || !guestEmail.includes("@"))){
      setError("Please enter a valid email address for your confirmation receipt.");
      return;
    }

    setSubmittingType(checkoutType);
    setError(null);

    try {
      const guestCart = JSON.parse(localStorage.getItem("guestCart") || "[]");
      const headers = {
        "Content-Type": "application/json",
      };

      if (session?.access_token) {
        headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      let guestId = localStorage.getItem("guest_user_Id");
      if (!guestId && !user) {
        guestId = `guest_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem("guest_user_Id", guestId);
      }

      // FIXED: discountCode is now properly nested inside JSON.stringify
      const response = await fetch(
  `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/checkout/create-session`,
  {
    method: "POST",
        headers,
        body: JSON.stringify({
          userId: user?.id || guestId,
          email: user?.email || guestEmail,
          checkoutType,
          items: guestCart,
          discountCode: appliedDiscount?.code ?? "",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to create checkout session.");
      }

      if (data.url) {
        const backgroundLocation =
          location.state?.backgroundLocation || {
            pathname: "/shop",
            search: "",
            hash: "",
          };

        sessionStorage.setItem(
          "checkoutCartBackground",
          JSON.stringify(backgroundLocation)
        );

        window.location.href = data.url;
      } else {
        throw new Error("No checkout URL was provided by the server.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError(err.message);
    } finally {
      setSubmittingType(null);
    }
  };

  return (
    <div
      className={`flex min-h-screen w-full flex-col bg-[#C5AE98] ${
        isOverlay
          ? "pt-24 md:fixed md:inset-y-0 md:right-0 md:z-[60] md:w-[480px] md:overflow-y-auto md:pt-0 md:shadow-[0_0_0_100vmax_rgba(0,0,0,0.5)]"
          : "mx-auto max-w-5xl pt-28 md:pt-40"
      }`}
    >
      {isOverlay && (
        <button
          type="button"
          aria-label="Close cart"
          onClick={() => {
            navigate(
              {
                pathname: backgroundLocation?.pathname || "/shop",
                search: backgroundLocation?.search || "",
                hash: backgroundLocation?.hash || "",
              },
              { replace: true }
            );
          }}
          className="absolute right-4 top-7 z-10 hidden h-10 w-10 cursor-pointer items-center justify-center text-2xl text-white hover:scale-105 md:flex"
        >
          ×
        </button>
      )}
      <h1 className="px-8 pt-8 font-serif text-3xl text-white">
        Your Cart
      </h1>

      {/* Cart section */}
      <div className="flex-1 px-8 pt-6 overflow-x-auto">
        {isCanceled && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-300 text-amber-800 rounded-md">
            Your checkout was cancelled. Your items are still saved in your cart.
          </div>
        )}

        <div className="w-full">
          {/* Cart product rows handled by CartElement */}
          <CartElement onTotalChange={setTotal} />
        </div>
      </div>

      {/* Checkout section */}
      <div className="w-full shrink-0 px-8 pb-8">
        <div className="flex w-full flex-col items-center">
          <div className="h-px w-full bg-white/70" />
          
          {appliedDiscount && (
            <p className="mt-6 font-sans text-sm text-white md:text-base">
              Discount ({appliedDiscount.code}): -${appliedDiscount.discountAmount.toFixed(2)}
            </p>
          )}

          <h2 className={`${appliedDiscount ? "mt-2" : "mt-6"} font-serif text-xl text-white`}>
            Estimated Total: ${(appliedDiscount?.estimatedTotal ?? total).toFixed(2)}
          </h2>

          <p className="mt-1 text-xs sm:text-sm text-gray-600">
            Shipping and taxes calculated at checkout
          </p>

          {/* NEW: Guest Email Input Field (Only visible when user is not logged in) */}
          {!user && (
            <div className="mt-6 w-5/6">
              <label htmlFor="guest-email" className="block font-serif text-base text-white">
                Email Address <span className="text-red-300">*</span>
              </label>
              <p className="text-xs text-white/80 mb-1">Required for order confirmation & receipt</p>
              <input
                id="guest-email"
                type="email"
                value={guestEmail}
                onChange={(event) => {
                  setGuestEmail(event.target.value);
                  setError(null);
                }}
                disabled={isSubmitting || applyingDiscount}
                placeholder="your.email@example.com"
                className="min-w-0 w-full rounded-lg border border-white/30 bg-white px-3 py-2 font-sans text-sm text-gray-800 placeholder-gray-400 outline-none disabled:opacity-50 md:text-base"
              />
            </div>
          )}
          
          <div className="mt-6 w-5/6">
            <label htmlFor="discount-code" className="block font-serif text-base text-white">
              Discount Code
            </label>

            <div className="mt-2 flex gap-2">
              <input
                id="discount-code"
                type="text"
                value={discountCode}
                onChange={(event) => {
                  setDiscountCode(event.target.value);
                  setAppliedDiscount(null);
                  setError(null);
                }}
                disabled={isSubmitting || applyingDiscount}
                placeholder="Enter code"
                className="min-w-0 flex-1 rounded-lg border border-white/30 bg-white px-3 py-2 font-sans text-sm text-gray-800 placeholder-gray-400 outline-none disabled:opacity-50 md:text-base"
              />

              <button
                type="button"
                onClick={handleApplyDiscount}
                disabled={isSubmitting || applyingDiscount || !discountCode.trim()}
                className="rounded-lg border border-white/30 bg-[#8B6B4A] px-4 py-2 font-sans text-sm text-white transition hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 md:text-base"
              >
                {applyingDiscount ? "Checking..." : "Apply"}
              </button>
            </div>
          </div>

          {error && (
            <p className="mt-3 text-sm text-red-600 font-semibold">{error}</p>
          )}

          <button
            onClick={() => handleCheckout("shipping")}
            disabled={isSubmitting || total <= 0}
            className="mt-6 flex w-5/6 items-center justify-center rounded-lg border border-white/30 bg-white/30 py-2 text-center font-sans text-sm text-gray-800 transition duration-200 cursor-pointer hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 md:text-base"
          >
            {submittingType === "shipping" ? "Processing..." : "Shipping Checkout"}
          </button>

          <button 
            onClick={() => handleCheckout("pickup")}
            disabled={isSubmitting || total <= 0}
            className="mt-6 flex w-5/6 items-center justify-center rounded-lg border border-white/30 bg-white py-2 text-center font-sans text-sm text-gray-800 transition duration-200 cursor-pointer hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 md:text-base"
          >
            {submittingType === "pickup" ? "Processing..." : "Local Pickup Checkout"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Cart;