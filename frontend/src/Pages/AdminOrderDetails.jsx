import { useEffect, useState } from "react";
import {
  Link,
  useParams,
} from "react-router-dom";
import AdminHeader from "../components/AdminHeader";
import supabase from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

// Statuses that allow cancellation
const cancellableStatuses = [
  "accepted",
  "postage_ready",
  "ready_to_ship",
  "ready_for_pickup",
  "cancel_requested",
];

function AdminOrderDetails() {
  // Get the order ID from /adminOrders/:id
  const { id } = useParams();

  // Get the logged-in user's access token
  const { session } = useAuth();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] =
    useState(true);
  const [updatingStatus, setUpdatingStatus] =
    useState(false);
  const [selectedStatus, setSelectedStatus] =
    useState("");
  const [error, setError] = useState("");

  // Determine which status may come next
  const getAvailableStatuses = () => {
    if (!order) {
      return [];
    }

    const isPickup =
      order.fulfillment_type === "pickup";

    const hasTrackingNumber =
      Boolean(
        order.tracking_number?.trim()
      );

    // Pickup orders move directly from
    // accepted to ready for pickup
    if (
      order.status === "accepted" &&
      isPickup
    ) {
      return [
        {
          value: "ready_for_pickup",
          label: "Ready for Pickup",
        },
      ];
    }

    // Shipping orders require a tracking
    // number before becoming postage ready
    if (
      order.status === "accepted" &&
      !isPickup &&
      hasTrackingNumber
    ) {
      return [
        {
          value: "postage_ready",
          label: "Postage Ready",
        },
      ];
    }
    // Shipped orders are marked delivered
    if (
      order.status === "ready_to_ship"
    ) {
      return [
        {
          value: "delivered",
          label: "Delivered",
        },
      ];
    }

    // Pickup orders are marked fulfilled
    // after the customer collects them
    if (
      order.status === "ready_for_pickup"
    ) {
      return [
        {
          value: "fulfilled",
          label: "Fulfilled",
        },
      ];
    }

    // Postage-ready orders may move
    // to ready to ship
    if (
      order.status === "postage_ready"
    ) {
      return [
        {
          value: "ready_to_ship",
          label: "Ready to Ship",
        },
      ];
    }

    return [];
  };

  const availableStatuses =
    getAvailableStatuses();

  // Load the selected order
  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true);
      setError("");

      const { data, error: fetchError } =
        await supabase
          .from("active_orders")
          .select("*")
          .eq("order_id", id)
          .single();

      if (fetchError) {
        console.error(
          "Error fetching order:",
          fetchError
        );

        setError(
          "Could not load this order."
        );
        setLoading(false);
        return;
      }

      setOrder(data);
      setLoading(false);
    };

    fetchOrder();
  }, [id]);

  // Accept, decline, or cancel with refund
  // through the backend
  const handleOrderAction = async (
    action
  ) => {
    if (!order) {
      setError(
        "This order could not be found."
      );
      return;
    }

    const isApprovalAction =
      action === "accept" ||
      action === "decline";

    const isCancellationAction =
      action === "cancel-refund";

    if (
      isApprovalAction &&
      order.status !== "on_hold"
    ) {
      setError(
        "This order is no longer awaiting approval."
      );
      return;
    }

    if (
      isCancellationAction &&
      !cancellableStatuses.includes(
        order.status
      )
    ) {
      setError(
        "This order cannot be cancelled from its current status."
      );
      return;
    }

    if (!session?.access_token) {
      setError(
        "You must be logged in to update an order."
      );
      return;
    }

    let confirmationMessage = "";

    if (action === "decline") {
      confirmationMessage =
        "Deny this order and return the customer's payment?";
    }

    if (action === "cancel-refund") {
      confirmationMessage =
        "Cancel this order and issue a refund to the customer?";
    }

    if (
      confirmationMessage &&
      !window.confirm(
        confirmationMessage
      )
    ) {
      return;
    }

    setUpdatingStatus(true);
    setError("");

    try {
      // Cancel with refund uses the existing
      // decline/refund backend endpoint
      const endpointAction =
        action === "cancel-refund"
          ? "decline"
          : action;

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/checkout/orders/${order.order_id}/${endpointAction}`,
        {
          method: "POST",
          headers: {
            Authorization:
              `Bearer ${session.access_token}`,
          },
        }
      );

      // Safely handle both JSON and
      // non-JSON backend responses
      const contentType =
        response.headers.get(
          "content-type"
        );

      const result =
        contentType?.includes(
          "application/json"
        )
          ? await response.json()
          : {
              message:
                `Backend returned ${response.status}.`,
            };

      if (!response.ok) {
        const errorMessage =
          result.message ||
          "The order could not be updated.";

        window.alert(errorMessage);
        setError(errorMessage);
        return;
      }

      // Provide cancelled as a fallback
      // if decline does not return a status
      let updatedStatus = result.status;

      if (
        !updatedStatus &&
        (action === "decline" ||
          action === "cancel-refund")
      ) {
        updatedStatus = "cancelled";
      }

      setOrder((currentOrder) => ({
        ...currentOrder,
        status:
          updatedStatus ??
          currentOrder.status,
        tracking_number:
          result.trackingNumber ??
          currentOrder.tracking_number,
      }));

      setSelectedStatus("");
    } catch (actionError) {
      console.error(
        "Order action error:",
        actionError
      );

      const errorMessage =
        actionError.message ||
        "The order could not be updated.";

      window.alert(errorMessage);
      setError(errorMessage);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Change only the status.
  // Do not call Stripe or issue a refund.
  const handleCancelWithoutRefund =
    async () => {
      if (
        !order ||
        !cancellableStatuses.includes(
          order.status
        )
      ) {
        setError(
          "This order cannot be cancelled from its current status."
        );
        return;
      }

      const confirmed = window.confirm(
        "Cancel this order without issuing a refund?"
      );

      if (!confirmed) {
        return;
      }

      setUpdatingStatus(true);
      setError("");

      try {
        const {
          data,
          error: updateError,
        } = await supabase
          .from("orders")
          .update({
            status:
              "cancelled_no_refund",
          })
          .eq("id", order.order_id)
          .in(
            "status",
            cancellableStatuses
          )
          .select("status")
          .single();

        if (updateError) {
          throw updateError;
        }

        setOrder((currentOrder) => ({
          ...currentOrder,
          status: data.status,
        }));

        setSelectedStatus("");
      } catch (updateError) {
        console.error(
          "Error cancelling order:",
          updateError
        );

        const errorMessage =
          updateError.message ||
          "The order status could not be updated.";

        window.alert(errorMessage);
        setError(errorMessage);
      } finally {
        setUpdatingStatus(false);
      }
    };

  // Update an order to its next valid status
  const handleStatusUpdate = async () => {
    if (!order || !selectedStatus) {
      return;
    }

    // Ensure the selected status came
    // from the allowed options
    const selectedStatusIsAllowed =
      availableStatuses.some(
        (statusOption) =>
          statusOption.value ===
          selectedStatus
      );

    if (!selectedStatusIsAllowed) {
      setError(
        "That status change is not allowed."
      );
      return;
    }

    setUpdatingStatus(true);
    setError("");

    try {
      const {
        data,
        error: updateError,
      } = await supabase
        .from("orders")
        .update({
          status: selectedStatus,
        })
        .eq("id", order.order_id)
        // Prevent overwriting a status that
        // changed after the page loaded
        .eq("status", order.status)
        .select("status")
        .single();

      if (updateError) {
        throw updateError;
      }

      setOrder((currentOrder) => ({
        ...currentOrder,
        status: data.status,
      }));

      setSelectedStatus("");
    } catch (updateError) {
      console.error(
        "Error updating order status:",
        updateError
      );

      const errorMessage =
        updateError.message ||
        "The order status could not be updated.";

      window.alert(errorMessage);
      setError(errorMessage);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Loading display
  if (loading) {
    return (
      <div className="min-h-screen text-white">
        <AdminHeader />

        <p className="p-8 text-center">
          Loading order...
        </p>
      </div>
    );
  }

  // Error display when the order
  // could not load
  if (error && !order) {
    return (
      <div className="min-h-screen text-white">
        <AdminHeader />

        <div className="p-8 text-center">
          <p className="text-red-300">
            {error}
          </p>

          <Link
            to="/adminOrders"
            className="mt-4 md:mt-8 mx-auto w-[calc(50%-0.5rem)] lg:w-60 h-8 md:h-10 rounded-full bg-white/15 border border-white/30 shadow-sm text-white font-sans text-sm md:text-2xl flex items-center justify-center gap-2 hover:scale-105 cursor-pointer transition"
          >
            Return to Orders
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-16 text-white">
      <AdminHeader />

      <main className="mx-8 mt-8 md:mx-13">
        {/* Page heading */}
        <div className="flex flex-col">
          <div>
            <h1 className="font-serif text-3xl md:text-5xl">
              Order Details
            </h1>

            <p className="break-all font-serif text-base text-white/80 md:text-xl leading-relaxed">
              Order {order.order_id}
            </p>
          </div>

          <Link
            to="/adminOrders"
            className="mt-4 md:mt-8 w-[calc(50%-0.5rem)] lg:w-60 h-8 md:h-10 rounded-full bg-white/15 border border-white/30 shadow-sm text-white font-sans text-sm md:text-2xl flex items-center justify-center gap-2 hover:scale-105 cursor-pointer transition"
          >
            Return to Orders
          </Link>
        </div>

        {/* Order information container */}
        <section className="mt-6 rounded-xl border border-white/30 bg-white/10 p-4 md:p-8">
          {/* Current status */}
          <div className="mb-6">
            <p className="text-sm uppercase tracking-wide text-white/70">
              Current Status
            </p>

            <span className="mt-2 inline-flex rounded-full border border-white/30 bg-[#8B6B4A]/40 px-4 py-2 font-serif capitalize">
              {order.status?.replaceAll(
                "_",
                " "
              )}
            </span>
          </div>

          {/* Customer and order details */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <p className="text-sm uppercase tracking-wide text-white/70">
                Customer
              </p>

              <p className="mt-1 break-words font-serif text-lg">
                {order.customer_email ||
                  ""}
              </p>
            </div>

            <div>
              <p className="text-sm uppercase tracking-wide text-white/70">
                Order Date
              </p>

              <p className="mt-1 font-serif text-lg">
                {order.order_date
                  ? new Date(
                      order.order_date
                    ).toLocaleDateString()
                  : ""}
              </p>
            </div>

            <div>
              <p className="text-sm uppercase tracking-wide text-white/70">
                Total
              </p>

              <p className="mt-1 font-serif text-lg">
                $
                {Number(
                  order.total ?? 0
                ).toFixed(2)}
              </p>
            </div>

            <div>
              <p className="text-sm uppercase tracking-wide text-white/70">
                Tracking Number
              </p>

              <p className="mt-1 break-all font-mono">
                {order.tracking_number ??
                  ""}
              </p>
            </div>
          </div>

          {/* Ordered items */}
          <div className="mt-8">
            <h2 className="font-serif text-2xl italic">
              Items
            </h2>

            <div className="mt-4 space-y-3">
              {order.items?.length > 0 ? (
                order.items.map(
                  (item) => (
                    <div
                      key={
                        item.order_item_id
                      }
                      className="flex flex-col gap-2 rounded-lg border border-white/20 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <p className="font-serif">
                        {item.product_name ||
                          "Product"}
                      </p>

                      <p className="font-sans">
                        Quantity:{" "}
                        {item.quantity}
                      </p>
                    </div>
                  )
                )
              ) : (
                <p className="text-white/70">
                  No items found for this
                  order.
                </p>
              )}
            </div>
          </div>

          {/* Approval controls for on_hold orders */}
          {order.status === "on_hold" && (
            <div className="mt-8 border-t border-white/20 pt-6">
              <h2 className="font-serif text-2xl italic">
                Review Order
              </h2>

              <p className="mt-1 text-white/80">
                Accept or deny this customer
                order.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                {/* Accept captures Stripe payment */}
                <button
                  type="button"
                  onClick={() =>
                    handleOrderAction(
                      "accept"
                    )
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-lg bg-[#8B6B4A] px-6 py-3 font-serif text-white transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updatingStatus
                    ? "Updating..."
                    : "Accept Order"}
                </button>

                {/* Deny releases or refunds payment */}
                <button
                  type="button"
                  onClick={() =>
                    handleOrderAction(
                      "decline"
                    )
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-lg border border-red-300 bg-red-900/30 px-6 py-3 font-serif text-white transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updatingStatus
                    ? "Updating..."
                    : "Deny Order"}
                </button>
              </div>
            </div>
          )}

          {/* Status progression controls */}
          {availableStatuses.length > 0 && (
            <div className="mt-8 border-t border-white/20 pt-6">
              <h2 className="font-serif text-2xl italic">
                Update Order Status
              </h2>

              <p className="mt-1 text-white/80">
                Select the next stage for this
                order.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <select
                  value={selectedStatus}
                  onChange={(event) =>
                    setSelectedStatus(
                      event.target.value
                    )
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-lg border border-white/40 bg-[#8B6B4A] px-4 py-3 text-white outline-none disabled:opacity-50"
                >
                  <option value="">
                    Select status
                  </option>

                  {availableStatuses.map(
                    (statusOption) => (
                      <option
                        key={
                          statusOption.value
                        }
                        value={
                          statusOption.value
                        }
                        className="text-black"
                      >
                        {
                          statusOption.label
                        }
                      </option>
                    )
                  )}
                </select>

                <button
                  type="button"
                  onClick={
                    handleStatusUpdate
                  }
                  disabled={
                    updatingStatus ||
                    !selectedStatus
                  }
                  className="rounded-lg bg-[#8B6B4A] px-6 py-3 font-serif text-white transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updatingStatus
                    ? "Updating..."
                    : "Update Status"}
                </button>
              </div>
            </div>
          )}

          {/* Cancellation controls */}
          {cancellableStatuses.includes(
            order.status
          ) && (
            <div className="mt-8 border-t border-white/20 pt-6">
              <h2 className="font-serif text-2xl italic">
                Cancel Order
              </h2>

              <p className="mt-1 text-white/80">
                Choose whether the customer
                should receive a refund.
              </p>

              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                {/* Uses existing decline/refund endpoint */}
                <button
                  type="button"
                  onClick={() =>
                    handleOrderAction(
                      "cancel-refund"
                    )
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-lg bg-red-700 px-6 py-3 font-serif text-white transition hover:scale-105 hover:bg-red-800 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updatingStatus
                    ? "Updating..."
                    : "Cancel and Refund"}
                </button>

                {/* Changes only the database status */}
                <button
                  type="button"
                  onClick={
                    handleCancelWithoutRefund
                  }
                  disabled={
                    updatingStatus
                  }
                  className="rounded-lg border border-red-300 bg-red-900 px-6 py-3 font-serif text-white transition hover:scale-105 hover:bg-red-900/80 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {updatingStatus
                    ? "Updating..."
                    : "Cancel Without Refund"}
                </button>
              </div>
            </div>
          )}

          {/* Backend action error */}
          {error && order && (
            <p className="mt-6 text-red-300">
              {error}
            </p>
          )}
        </section>
      </main>

    </div>
  );
}

export default AdminOrderDetails;