import { useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

const OrderHistory = () => {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queryError, setQueryError] = useState(null);

  // Cancellation Modal & Request state (DT-645, DT-685, DT-686)
  const [selectedOrderForCancel, setSelectedOrderForCancel] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    async function fetchOrders() {
      if (authLoading) return;

      if (!user || (!user.email && !user.id)) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setQueryError(null);

        // 1. Fetch Orders
        let query = supabase
          .from("orders")
          .select("*")
          .neq("status", "pending")
          .order("created_at", { ascending: false });

        if (user.email && user.id) {
          query = query.or(`customer_email.eq.${user.email},user_id.eq.${user.id}`);
        } else if (user.email) {
          query = query.eq("customer_email", user.email);
        } else {
          query = query.eq("user_id", user.id);
        }

        const { data: ordersData, error: ordersError } = await query;

        if (ordersError) throw ordersError;

        if (!ordersData || ordersData.length === 0) {
          setOrders([]);
          setLoading(false);
          return;
        }

        // 2. Fetch order items, joining products AND product_images (matching your AdminProductTile logic)
        const orderIds = ordersData.map((order) => order.id);

        const { data: itemsData, error: itemsError } = await supabase
          .from("order_items")
          .select(`
            *,
            products (
              *,
              product_images (*)
            )
          `)
          .in("order_id", orderIds);

        if (itemsError) {
          console.warn("Error fetching order items with products/images:", itemsError.message);
        }

        // 3. Combine items into orders
        const combinedOrders = ordersData.map((order) => {
          const items = (itemsData || []).filter(
            (item) => item.order_id === order.id
          );
          return {
            ...order,
            order_items: items,
          };
        });

        setOrders(combinedOrders);
      } catch (err) {
        console.error("Error fetching orders:", err);
        setQueryError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchOrders();
  }, [user, authLoading]);

  // Handle ESC key to dismiss modal when open
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && selectedOrderForCancel && !isCancelling) {
        setSelectedOrderForCancel(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedOrderForCancel, isCancelling]);

  // Auto-dismiss notification banner after 6 seconds
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => {
        setNotification(null);
      }, 6000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const options = { month: "short", day: "numeric" };
    return new Date(dateString).toLocaleDateString("en-US", options);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "on_hold":
        return (
          <span className="inline-flex items-center rounded-full border border-amber-400/40 bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-200">
            On Hold
          </span>
        );
      case "cancel_requested":
        return (
          <span className="inline-flex items-center rounded-full border border-orange-400/50 bg-orange-600/30 px-3 py-1 text-xs font-bold text-orange-200 shadow-sm">
            Cancellation Requested
          </span>
        );
      case "accepted":
        return (
          <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-600/30 px-3 py-1 text-xs font-semibold text-emerald-200 shadow-sm">
            Accepted
          </span>
        );
      case "postage_ready":
        return (
          <span className="inline-flex items-center rounded-full border border-[#8B6B4A] bg-[#5C4033]/70 px-3 py-1 text-xs font-semibold text-amber-100">
            Postage Ready
          </span>
        );
      case "ready_to_ship":
        return (
          <span className="inline-flex items-center rounded-full border border-blue-400/40 bg-blue-600/30 px-3 py-1 text-xs font-semibold text-blue-200 shadow-sm">
            Ready to Ship
          </span>
        );
      case "ready_for_pickup":
        return (
          <span className="inline-flex items-center rounded-full border border-blue-400/40 bg-blue-600/30 px-3 py-1 text-xs font-semibold text-blue-200 shadow-sm">
            Ready for Pickup
          </span>
        );
      case "shipped":
        return (
          <span className="inline-flex items-center rounded-full border border-sky-400/40 bg-sky-600/30 px-3 py-1 text-xs font-semibold text-sky-200 shadow-sm">
            Shipped
          </span>
        );
      case "delivered":
        return (
          <span className="inline-flex items-center rounded-full border border-green-400/40 bg-green-600/30 px-3 py-1 text-xs font-semibold text-green-200 shadow-sm">
            Delivered
          </span>
        );
      case "cancelled":
      case "cancelled_no_refund":
        return (
          <span className="inline-flex items-center rounded-full border border-red-400/40 bg-red-600/30 px-3 py-1 text-xs font-semibold text-red-200 shadow-sm">
            Cancelled
          </span>
        );
      case "paid":
        return (
          <span className="inline-flex items-center rounded-full border border-blue-400/40 bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200">
            Paid
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 capitalize">
            {status ? status.replace(/_/g, " ") : "Unknown"}
          </span>
        );
    }
  };

  const handleConfirmCancellation = async () => {
    if (!selectedOrderForCancel) return;

    setIsCancelling(true);
    setCancelError(null);

    try {
      // Retrieve the signed-in customer's Supabase session
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError || !session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

      const response = await fetch(
        `${API_BASE_URL}/api/checkout/orders/${encodeURIComponent(selectedOrderForCancel.id)}/request-cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || "Failed to submit cancellation request.");
      }

      // Update local state dynamically so badge immediately displays 'cancel_requested'
      setOrders((prevOrders) =>
        prevOrders.map((ord) =>
          ord.id === selectedOrderForCancel.id
            ? { ...ord, status: "cancel_requested" }
            : ord
        )
      );

      setNotification({
        type: "success",
        message:
          data.message ||
          `Cancellation request for Order #${selectedOrderForCancel.id.slice(0, 8)} has been submitted. The store admin has been notified.`,
      });

      setSelectedOrderForCancel(null);
    } catch (err) {
      console.error("Cancellation error:", err);
      setCancelError(err.message || "An unexpected error occurred while requesting cancellation.");
    } finally {
      setIsCancelling(false);
    }
  };

  return (
    <div className="min-h-screen pt-28 md:pt-40 pb-16 bg-[#C5AE98] text-white">
      <div className="mt-8 mx-[25px] md:mx-10">
        <h1 className="text-3xl md:text-5xl font-serif">
          Your Order History
        </h1>

        <p className="text-base md:text-xl font-serif leading-relaxed">
          View your past orders
        </p>
      </div>

      <main className="mt-4 md:mt-8 ml-8 ml-[22px] mr-[22px] md:ml-10 md:mr-10">
        {/* Success / Error notification banner */}
        {notification && (
          <div
            className={`mb-6 p-4 rounded-xl flex items-center justify-between shadow-md transition ${
              notification.type === "success"
                ? "bg-emerald-600/30 border border-emerald-400 text-emerald-100"
                : "bg-red-600/30 border border-red-400 text-red-100"
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl font-bold">
                {notification.type === "success" ? "✓" : "!"}
              </span>
              <p className="text-sm font-medium">{notification.message}</p>
            </div>
            <button
              onClick={() => setNotification(null)}
              className="text-white/70 hover:text-white text-xl font-bold ml-4 cursor-pointer focus:outline-none"
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        )}
        {loading || authLoading ? (
          <p className="text-white/80">Loading your past orders...</p>
        ) : queryError ? (
          <div className="border border-red-400 bg-red-500/20 rounded-xl p-6 text-center text-white">
            <p className="font-semibold">Error loading orders:</p>
            <p className="text-sm mt-1">{queryError}</p>
          </div>
         ) : orders.length === 0 ? (
          <div className="p-8 md:p-12 text-center text-white/80 font-serif italic text-base md:text-xl md:border md:border-white/20 rounded-xl bg-black/10">
            No past orders found.
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => {
              const firstItem = order.order_items?.[0];
              const product = firstItem?.products;

              const images = firstItem?.product_image_url
                ? [{ image_url: firstItem.product_image_url }]
                : product?.product_images;
              // Check if image exists using the exact admin pattern
              const hasImage = images && images.length > 0 && images[0].image_url;

              return (
                <div
                  key={order.id}
                  className="w-full min-h-18 md:min-h-25 p-4 rounded-lg bg-white/15 md:border md:border-white/30 shadow-sm text-white flex flex-col md:flex-row md:items-start justify-between gap-4"
                >
                  <div className="min-w-0 flex-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-4 md:gap-y-1">
                    {/* Thumbnail */}
                    {hasImage ? (
                      <img
                        src={images[0].image_url}
                        alt={product?.name || "Order item"}
                        className="w-16 h-14 md:w-20 md:h-20 self-center md:row-span-2 object-cover rounded-sm"
                      />
                    ) : (
                      <div className="w-16 h-14 md:w-20 md:h-20 self-center md:row-span-2 bg-white/20 rounded-sm flex items-center justify-center text-xs text-white">
                        No Image
                      </div>
                    )}

                    {/* Order number beside the thumbnail */}
                    <h3 className="self-center md:self-end font-semibold text-lg text-white">
                      Order #{order.id?.slice(0, 8)}
                    </h3>

                    {/* Products below on mobile; beside thumbnail on desktop */}
                    <div className="col-span-2 md:col-span-1 md:col-start-2 space-y-1 text-sm md:text-base text-white/70 break-words">
                      {order.order_items?.map((item) => (
                        <p key={item.id}>
                          {item.product_name || item.products?.name || "Product unavailable"} × {item.quantity}
                        </p>
                      ))}
                    </div>
                  </div>

                  {/* Date, Price, Status & Action Button */}
                  <div className="flex flex-col md:items-end justify-center border-t border-white/10 pt-3 md:border-t-0 md:pt-0">
                    <div className="flex md:flex-col justify-between items-baseline md:items-end w-full md:w-auto">
                      <span className="text-base md:text-2xl font-serif font-medium">
                        {formatDate(order.created_at)}
                      </span>

                      {/* Display saved totals, including zero. Hide only missing values. */}
                      {order.total_amount != null && (
                        <span className="text-xs md:text-sm font-serif text-white/70">
                          Total: ${Number(order.total_amount).toFixed(2)}
                        </span>
                      )}
                    </div>

                    <div className="mt-3 self-start md:self-end">
                      {getStatusBadge(order.status)}
                    </div>

                    {/* Cancellation action button (only visible for on_hold status) */}
                    {order.status === "on_hold" && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedOrderForCancel(order);
                          setCancelError(null);
                        }}
                        className="mt-3 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-400/50 transition hover:border-red-300 cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400/50 self-start md:self-end"
                      >
                        Request Cancellation
                      </button>
                    )}

                    {/* Feedback if cancellation is already requested */}
                    {order.status === "cancel_requested" && (
                      <span className="text-xs text-orange-400 italic mt-2 self-start md:self-end">
                        Cancellation under review
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Confirmation Modal */}
      {selectedOrderForCancel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-order-modal-title"
          onClick={() => {
            if (!isCancelling) setSelectedOrderForCancel(null);
          }}
        >
          <div
            className="bg-[#2e2620] text-white rounded-2xl max-w-md w-full p-6 border border-white/20 shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close (X) icon */}
            <button
              onClick={() => {
                if (!isCancelling) setSelectedOrderForCancel(null);
              }}
              disabled={isCancelling}
              className="absolute top-4 right-4 text-white/60 hover:text-white text-xl font-bold disabled:opacity-50 cursor-pointer focus:outline-none"
              aria-label="Dismiss modal"
            >
              ×
            </button>

            <h2
              id="cancel-order-modal-title"
              className="text-2xl font-serif font-bold text-white mb-2"
            >
              Cancel Order
            </h2>

            <p className="text-xs text-white/70 font-mono mb-4">
              Order Reference: #{selectedOrderForCancel.id}
            </p>

            <div className="bg-white/5 border border-white/10 rounded-lg p-3 mb-4 text-sm text-white/90">
              <div className="flex justify-between py-1">
                <span className="text-white/70">Placed On:</span>
                <span>{formatDate(selectedOrderForCancel.created_at)}</span>
              </div>
              {selectedOrderForCancel.total_amount && (
                <div className="flex justify-between py-1 border-t border-white/10">
                  <span className="text-white/70">Order Total:</span>
                  <span className="font-semibold">
                    ${Number(selectedOrderForCancel.total_amount).toFixed(2)}
                  </span>
                </div>
              )}
            </div>

            <p className="text-sm text-white/80 mb-6 leading-relaxed">
              Are you sure you want to request cancellation for this order?
              Since your order is still on hold, our team will halt fulfillment and release the authorization hold on your payment.
            </p>

            {cancelError && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-400 rounded-lg text-sm text-red-200">
                <span className="font-bold">Error: </span>
                {cancelError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <button
                type="button"
                onClick={() => setSelectedOrderForCancel(null)}
                disabled={isCancelling}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-white/30 text-white/90 hover:bg-white/10 transition disabled:opacity-50 cursor-pointer"
              >
                Keep Order
              </button>
              <button
                type="button"
                onClick={handleConfirmCancellation}
                disabled={isCancelling}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {isCancelling ? (
                  <>
                    <span className="inline-block animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    Submitting...
                  </>
                ) : (
                  "Confirm Cancellation"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OrderHistory;