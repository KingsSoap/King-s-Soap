import React, { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

export default function RequestCancellation() {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [status, setStatus] = useState("idle"); // "idle" | "loading" | "success" | "error"
  const [message, setMessage] = useState("");

  const handleConfirmCancel = async () => {
    // Retrieve the cancellation token from the confirmation email URL
    const cancellationToken = new URLSearchParams(
      window.location.search
    ).get("token");

    if (!orderId || !cancellationToken) {
      setStatus("error");
      setMessage(
        "Invalid cancellation link. Please use the link provided in your order confirmation email."
      );
      return;
    }

    setStatus("loading");
    setMessage("");

    try {
      const API_BASE_URL =
        import.meta.env.VITE_API_URL || "http://localhost:3000";

      const response = await fetch(
        `${API_BASE_URL}/api/checkout/orders/${encodeURIComponent(orderId)}/request-cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cancellationToken,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to submit cancellation request.");
      }

      setStatus("success");
      setMessage(data.message || "Cancellation request received and sent to the store admin.");
    } catch (err) {
      console.error("Cancellation request error:", err);
      setStatus("error");
      setMessage(err.message || "An unexpected error occurred while requesting cancellation.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-[#cbb49d] rounded-2xl shadow-xl p-8 text-neutral-900 text-center">
        <h1 className="text-3xl font-serif font-bold mb-3">Order Cancellation</h1>
        
        {orderId ? (
          <p className="text-sm text-neutral-800 mb-6">
            Order Reference: <span className="font-mono font-semibold">{orderId}</span>
          </p>
        ) : (
          <p className="text-sm text-red-700 mb-6 font-medium">
            No Order ID specified in the link.
          </p>
        )}

        {status === "idle" && (
          <div>
            <p className="text-sm text-neutral-800 mb-6 leading-relaxed">
              Are you sure you want to request cancellation for this order?
              <br />
              If the order is still on hold and has not yet been accepted, the store owner will be notified to cancel it and release your payment authorization.
            </p>
            <button
              onClick={handleConfirmCancel}
              className="w-full py-3 px-6 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg shadow transition-colors cursor-pointer"
            >
              Confirm Cancellation Request
            </button>
          </div>
        )}

        {status === "loading" && (
          <div className="py-6">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-neutral-700 border-t-transparent mb-4"></div>
            <p className="text-sm font-medium text-neutral-800">
              Submitting your cancellation request...
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="py-4">
            <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              ✓
            </div>
            <h2 className="text-xl font-semibold mb-2">Request Submitted</h2>
            <p className="text-sm text-neutral-800 mb-6 leading-relaxed">
              {message}
            </p>
            <p className="text-xs text-neutral-700 mb-6">
              You will receive an email confirmation once the cancellation is approved by our team.
            </p>
            <Link
              to="/"
              className="inline-block py-2.5 px-6 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Return to Store
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="py-4">
            <div className="w-12 h-12 bg-red-100 text-red-700 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
              !
            </div>
            <h2 className="text-xl font-semibold text-red-900 mb-2">Unable to Cancel</h2>
            <p className="text-sm text-red-800 mb-6 leading-relaxed">
              {message}
            </p>
            <Link
              to="/"
              className="inline-block py-2.5 px-6 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Return to Store
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
