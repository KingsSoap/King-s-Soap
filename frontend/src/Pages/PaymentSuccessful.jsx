import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { BsCheckCircle } from "react-icons/bs";
import supabase from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

const PaymentSuccessful = () => {
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  
  const sessionId = searchParams.get("session_id");

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchOrderWithRetry = async (retries = 5, delay = 1500) => {
      if (!sessionId) {
        if (isMounted) {
          setError("Unable to find checkout session.");
          setLoading(false);
        }
        return;
      }

      const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

      for (let i = 0; i < retries; i++) {
        try {
          // Fetch via the backend so guest orders (user_id = null) aren't blocked by RLS
          const response = await fetch(
            `${API_BASE_URL}/api/checkout/orders/by-session/${encodeURIComponent(sessionId)}`
          );

          if (response.ok) {
            const { order: fetchedOrder } = await response.json();

            if (isMounted) {
              setOrder(fetchedOrder);
              setLoading(false);

              // Clean up carts upon successful fetch
              localStorage.removeItem("guestCart");
              if (user?.id) {
                await supabase.from("cart").delete().eq("user_ID", user.id);
              }
            }
            return;
          }
        } catch (fetchErr) {
          console.error("Error fetching order:", fetchErr);
        }

        // If not found yet, wait before retrying (gives webhook time to finish)
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }

      // If all retries fail
      if (isMounted) {
        setError("Unable to load your order. Please check your email for confirmation.");
        setLoading(false);
      }
    };

    fetchOrderWithRetry();

    return () => {
      isMounted = false;
    };
  }, [sessionId, user]);

  // Add together the quantities of all products
  const totalQuantity =
    order?.order_items?.reduce(
      (total, item) => total + item.quantity,
      0
    ) || 0;

  if (loading) {
    return (
      <div className="min-h-screen pt-28 md:pt-40 pb-16 px-[22px] md:px-10 bg-[#C5AE98] flex items-center justify-center text-center text-white">
        Loading your order... (Confirming payment processing)
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen pt-28 md:pt-40 pb-16 px-[22px] md:px-10 bg-[#C5AE98] flex flex-col items-center justify-center text-center text-white gap-4">
        <p className="text-lg">{error || "Order not found."}</p>
        <Link
          to="/"
          className="w-[calc(50%-0.5rem)] lg:w-60 h-8 md:h-10 rounded-md bg-white/15 border border-white/30 shadow-sm text-white font-sans text-sm md:text-xl flex items-center justify-center gap-2 hover:scale-105 cursor-pointer transition"
        >
          Return to Shop
        </Link>
      </div>
    );
  }

  return (
    <div className="pt-28 md:pt-40 pb-0 md:pb-6 px-[22px] md:px-10 bg-[#C5AE98] text-white flex justify-center items-start">
      <div className="w-full max-w-[820px] bg-white/10 rounded-xl p-4 md:p-8 md:border md:border-white/30 md:shadow-lg flex flex-col items-center">

        {/* Success Icon */}
        <BsCheckCircle className="text-white text-4xl mb-4" />

        {/* Title */}
        <h1 className="text-4xl text-center md:text-5xl text-white font-bold">
          Payment Successful!
        </h1>

        {/* Confirmation */}
        <p className="text-white mt-2 text-center">
          Thank you for your purchase!
        </p>

        <p className="text-white text-center text-sm">
          An order confirmation will be sent to the email address provided at checkout.
        </p>

        {/* Order Summary */}
        <h2 className="text-white text-2xl font-semibold mt-8 mb-5">
          Order Summary
        </h2>

        <div className="w-full max-w-[520px] bg-white/10 rounded-xl p-4 md:p-8 md:border md:border-white/30">
          <div className="grid grid-cols-2 gap-y-8 text-white text-base">

            {/* Quantity */}
            <p>Quantity:</p>
            <p>{totalQuantity}</p>

            {/* Items */}
            <p>Items:</p>
            <div>
              {order.order_items?.map((item) => (
                <p key={item.id}>
                  {item.products?.name} x{item.quantity}
                </p>
              ))}
            </div>

            {/* Total */}
            <p>Total:</p>
            <p>
              ${Number(order.total_amount).toFixed(2)}
            </p>

          </div>
        </div>

        <Link
          to={user ? "/OrderHistory" : "/shop"}
          className="mt-6 w-[calc(50%-0.5rem)] lg:w-60 h-8 md:h-10 rounded-md bg-white/15 border border-white/30 shadow-sm text-white font-sans text-base md:text-xl flex items-center justify-center gap-2 hover:scale-105 cursor-pointer transition"
        >
          {user ? "View My Orders" : "Return to Shop"}
        </Link>

      </div>
    </div>
  );
};

export default PaymentSuccessful;