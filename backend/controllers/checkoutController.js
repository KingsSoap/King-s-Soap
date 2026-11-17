import supabase, { getSupabaseClient } from "../supabaseClient.js";
import Stripe from "stripe";
import easypost from "../easypostClient.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { purchaseEasyPostLabelFromStripe } from "./webhookController.js";
import {
  sendCancellationRequestToAdmin,
  sendOrderCancelledEmail,
} from "../services/emailService.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Verify a cancellation token against its stored SHA-256 hash
const verifyCancellationToken = (token, storedHash) => {
  if (
    typeof token !== "string" ||
    !/^[a-f0-9]{64}$/.test(token) ||
    typeof storedHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(storedHash)
  ) {
    return false;
  }

  const submittedHash = createHash("sha256")
    .update(token)
    .digest();

  const expectedHash = Buffer.from(storedHash, "hex");

  return timingSafeEqual(submittedHash, expectedHash);
};


/**
 * Sanitizes and validates an image URL for use in Stripe checkout.
 * Strips whitespace/newlines and ensures URL is a valid http/https URL.
 * Returns null if the URL is missing or malformed, preventing Stripe "Not a valid URL" errors.
 *
 * @param {string} url - The candidate image URL
 * @returns {string|null} - The validated URL or null
 */
export const sanitizeImageUrl = (url) => {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return null;
  }
  return null;
};

/**
 * Pure validator & compiler for cart items into dynamic Stripe price_data line items.
 */
export const validateAndFormatCartItems = (cartItems) => {
  if (!cartItems || cartItems.length === 0) {
    return { isValid: false, error: "Your cart is empty." };
  }

  // Validate stock, availability, and price for each item
  for (const item of cartItems) {
    // Handle both Supabase structure (item.products) and localStorage structure (item.product or flat item properties)
    const product = item.products || item.product || item;

    if (!product) {
      return {
        isValid: false,
        error: "A product in your cart is no longer available in the store.",
      };
    }

    // 1. Availability check (if property exists)
    if (product.Availability === false) {
      return {
        isValid: false,
        error: `"${product.name}" is currently unavailable.`,
      };
    }

    // 2. Stock check
    const currentStock = product.stock ?? 100; // fallback high stock for guests if stock isn't attached
    if (item.quantity > currentStock) {
      return {
        isValid: false,
        error: `Insufficient stock for "${product.name}". Only ${currentStock} unit(s) available, but ${item.quantity} requested.`,
      };
    }

    // 3. Price check
    const priceNum = Number(product.price);
    if (isNaN(priceNum) || priceNum < 0) {
      return {
        isValid: false,
        error: `Invalid price configured for "${product.name}".`,
      };
    }
  }

  // Compile dynamic Stripe price_data line items
  const lineItems = cartItems.map((item) => {
    const product = item.products || item.product || item;
    const firstImage = product.product_images?.[0]?.image_url || product.image;
    const rawImage = product.product_images?.[0]?.image_url;
    const validImage = sanitizeImageUrl(rawImage);

    return {
      price_data: {
        currency: "usd",
        unit_amount: Math.round(Number(product.price) * 100),
        product_data: {
          name: product.name,
          ...(validImage ? { images: [validImage] } : {}),
        },
      },
      quantity: item.quantity,
    };
  });

  // Calculate order totals
  const totalAmount = cartItems.reduce(
    (sum, item) => {
      const product = item.products || item.product || item;
      return sum + Number(product.price) * item.quantity;
    },
    0
  );
  const totalAmountCents = Math.round(totalAmount * 100);
  const itemCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  return {
    isValid: true,
    cartItems,
    lineItems,
    totalAmount: Number(totalAmount.toFixed(2)),
    totalAmountCents,
    itemCount,
  };
};

/**
 * Fetches the user's cart from Supabase OR parses guest items passed from localStorage.
 */
export const validateUserCart = async (userId, authToken = null, guestItems = []) => {
  // If no userId is present, validate the guest items passed from localStorage
  if (!userId) {
    if (!guestItems || guestItems.length === 0) {
      return { isValid: false, error: "Your cart is empty." };
    }

    // Guests only send product IDs and quantities; prices, stock, names, and
    // images are re-fetched from the database so tampered localStorage data
    // (e.g. edited prices) is never trusted.
    const productIds = [
      ...new Set(
        guestItems
          .map((item) => item.id || item.product_ID || item.product_id)
          .filter(Boolean)
      ),
    ];

    if (productIds.length === 0) {
      return { isValid: false, error: "Your cart is empty." };
    }

    const { data: dbProducts, error: productsError } = await supabase
      .from("products")
      .select(`
        id,
        name,
        price,
        stock,
        weight,
        Availability,
        product_images (
          id,
          image_url
        )
      `)
      .in("id", productIds);

    if (productsError) {
      console.error("Database query error fetching guest products:", productsError);
      throw new Error(`Failed to fetch products: ${productsError.message}`);
    }

    const productsById = new Map((dbProducts || []).map((p) => [p.id, p]));

    const normalizedItems = [];
    for (const item of guestItems) {
      const productId = item.id || item.product_ID || item.product_id;
      const product = productsById.get(productId);

      if (!product) {
        return {
          isValid: false,
          error: "A product in your cart is no longer available in the store.",
        };
      }

      const quantity = Math.floor(Number(item.quantity));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return {
          isValid: false,
          error: `Invalid quantity for "${product.name}".`,
        };
      }

      normalizedItems.push({ products: product, quantity });
    }

    return validateAndFormatCartItems(normalizedItems);
  }

  // Use service-role client if configured, otherwise scoped client using user's auth token
  const client = authToken ? getSupabaseClient(authToken) : supabase;

  // Query public.cart joined with public.products and public.product_images
  const { data: cartItems, error } = await client
    .from("cart")
    .select(`
      id,
      quantity,
      product_ID,
      products (
        id,
        name,
        price,
        stock,
        weight,
        Availability,
        product_images (
          id,
          image_url
        )
      )
    `)
    .eq("user_ID", userId);

  if (error) {
    console.error("Database query error fetching cart:", error);
    throw new Error(`Failed to fetch cart: ${error.message}`);
  }

  return validateAndFormatCartItems(cartItems);
};

export const validateCartHandler = async (req, res) => {
  try {
    const userId = req.user?.id;
    const guestItems = req.body?.items || [];
    const result = await validateUserCart(userId, req.authToken, guestItems);

    if (!result.isValid) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        lineItems: result.lineItems,
        totalAmount: result.totalAmount,
        totalAmountCents: result.totalAmountCents,
        itemCount: result.itemCount,
        items: result.cartItems.map((item) => {
          const product = item.products || item.product || item;
          return {
            cartId: item.id || product.id,
            productId: item.product_ID || product.id,
            name: product.name,
            unitPrice: Number(product.price),
            quantity: item.quantity,
            subtotal: Number((Number(product.price) * item.quantity).toFixed(2)),
            image: product.product_images?.[0]?.image_url || product.image || null,
          };
        }),
      },
    });
  } catch (error) {
    console.error("Cart validation handler error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to validate cart. Please try again.",
    });
  }
};



// Validate a discount against the current cart and return a subtotal preview (specifically for apply button)
export const previewDiscount = async (req, res) => {
  try {
    const code = req.body?.discountCode?.trim().toUpperCase();
    const guestItems = req.body?.items || []; 

    if (!code) {
      return res.status(400).json({ message: "Enter a discount code." });
    }

    const cart = await validateUserCart(req.user?.id, req.authToken, guestItems);

    if (!cart.isValid) {
      return res.status(400).json({ message: cart.error });
    }

    const { data: discount, error } = await supabase
      .from("discounts")
      .select("type, value, starts_at, expires_at")
      .eq("code", code)
      .eq("is_active", true)
      .eq("is_archived", false)
      .maybeSingle();

    if (error) throw error;

    const now = Date.now();
    if (
      !discount ||
      (discount.starts_at && new Date(discount.starts_at).getTime() > now) ||
      (discount.expires_at && new Date(discount.expires_at).getTime() <= now)
    ) {
      return res.status(400).json({ message: "This discount code is not available." });
    }

    // Calculate in cents so the displayed amount matches currency rounding.
    const subtotalCents = cart.totalAmountCents;
    const discountCents = discount.type === "percentage"
      ? Math.round(subtotalCents * Number(discount.value) / 100)
      : Math.round(Number(discount.value) * 100);

    return res.status(200).json({
      code,
      subtotal: subtotalCents / 100,
      discountAmount: Math.min(discountCents, subtotalCents) / 100,
      estimatedTotal: Math.max(0, subtotalCents - discountCents) / 100,
    });
  } catch (error) {
    console.error("Could not preview discount:", error);
    return res.status(500).json({ message: "Failed to check this discount code." });
  }
};


export const createCheckoutSession = async (req, res) => {
  try {
    let userId = req.user?.id || null;
    if (userId && userId.startsWith("guest_")) {
      userId = null; // Treat guest users as null
    }

    const userEmail = req.user?.email || req.body?.email || null;
    const guestItems = req.body?.items || [];
    const checkoutType = req.body?.checkoutType || "shipping";
    
    // Normalize an optional discount code before looking it up.
    const discountCode =
      typeof req.body?.discountCode === "string"
        ? req.body.discountCode.trim().toUpperCase()
        : "";
    
    const isPickup = checkoutType === "pickup" || checkoutType === "local_pickup";

    // Allow checkout if we have either a logged-in user ID OR guest items from localStorage
    if (!userId && (!guestItems || guestItems.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Your cart is empty or authentication is required.",
      });
    }

    // 1. Validate the cart (handles both database users and guests seamlessly)
    const result = await validateUserCart(userId, req.authToken, guestItems);

    if (!result.isValid) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }



    //2. Look up an entered discount before creating an order or Stripe session.
    let discount = null;

    if (discountCode) {
      const { data, error: discountError } = await supabase
        .from("discounts")
        .select("id, code, starts_at, expires_at, stripe_promotion_code_id")
        .eq("code", discountCode)
        .eq("is_active", true)
        .eq("is_archived", false)
        .maybeSingle();

      if (discountError) {
        console.error("Could not load checkout discount:", discountError);
        return res.status(500).json({ message: "Could not validate discount code." });
      }

      if (!data) {
        return res.status(400).json({ message: "Discount code is invalid or inactive." });
      }

      discount = data;
    }
    

    // Reject codes outside their scheduled availability window.
    if (discount) {
      const now = Date.now();

      if (discount.starts_at && now < new Date(discount.starts_at).getTime()) {
        return res.status(400).json({ message: "This discount code is not active yet." });
      }

      if (discount.expires_at && now >= new Date(discount.expires_at).getTime()) {
        return res.status(400).json({ message: "This discount code has expired." });
      }
    }


    // A saved discount must have a Stripe promotion code to use at checkout.
    if (discount && !discount.stripe_promotion_code_id) {
      console.error("Checkout discount has no Stripe promotion code:", discount.id);
      return res.status(500).json({ message: "This discount cannot be applied right now." });
    }


  // 3. Calculate total parcel weight (in ounces)
  let totalWeightOz = 0;
  result.cartItems.forEach((item) => {
   const product = item.products || item.product || item;
   const unitWeight = Number(product.weight) || 4; // fallback 4 oz
   totalWeightOz += unitWeight * item.quantity;
  });
  const finalWeightOz = Math.max(totalWeightOz + 2, 1); // 2 oz packaging weight included (tare)


    // 4. Insert Pending Order into Supabase
    const shippingFee = isPickup ? 0 : 7.0;
    const initialTotal = Number((result.totalAmount + shippingFee).toFixed(2));

    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId, // will be null for guest orders if column is nullable
        status: "pending",
        total_amount: initialTotal,
        customer_email: userEmail,
        fulfillment_type: isPickup ? "pickup" : "shipping",
      })
      .select()
      .single();

    if (orderError || !newOrder) {
      console.error("Order creation error:", orderError);
      throw new Error(`Failed to create order: ${orderError?.message || "Unknown error"}`);
    }

    // 4. Insert Order Items into Supabase
    const orderItems = result.cartItems.map((item) => {
      const product = item.products || item.product || item;

      return {
        order_id: newOrder.id,
        product_id: item.product_ID || product.id || item.id,
        quantity: item.quantity,
        unit_price: Number(product.price),
        product_name: product.name,
        product_image_url:
          product.product_images?.[0]?.image_url ||
          product.image ||
          null,
      };
    });

    const { error: itemsError } = await supabase
      .from("order_items")
      .insert(orderItems);

    if (itemsError) {
      console.error("Order items creation error:", itemsError);
      throw new Error(`Failed to save order items: ${itemsError.message}`);
    }
    
    // 6. Create Stripe Session configured for Shipping or Local Pickup
    const clientUrl = process.env.CLIENT_URL?.replace(/\/+$/, "");

    if (!clientUrl || !/^https?:\/\/[^/]+$/.test(clientUrl)) {
      throw new Error("CLIENT_URL is missing or invalid.");
    }

    if (
      process.env.NODE_ENV === "production" &&
      !clientUrl.startsWith("https://")
    ) {
      throw new Error("CLIENT_URL must use HTTPS in production.");
    }

    const sessionConfig = {
      payment_method_types: ["card"],
      line_items: result.lineItems,
      ...(discount && {
        discounts: [{ promotion_code: discount.stripe_promotion_code_id }],
      }),
      mode: "payment",
      payment_intent_data: {
        capture_method: "manual",
      },
      customer_email: userEmail || undefined,
      submit_type: "auto",
      billing_address_collection: isPickup ? "auto" : "required",
      ...(isPickup
        ? {
            integration_identifier: "custom_embedded_web_0002",
          }
        : {
            shipping_address_collection: { allowed_countries: ["US"] },
            integration_identifier: "custom_embedded_web_0001",
            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  fixed_amount: {
                    amount: 700,
                    currency: "usd",
                  },
                  display_name: "Standard Ground Shipping",
                  delivery_estimate: {
                    minimum: {
                      unit: "business_day",
                      value: 3,
                    },
                    maximum: {
                      unit: "business_day",
                      value: 5,
                    },
                  },
                },
              },
            ],
          }),
      success_url: `${clientUrl}/PaymentSuccessful?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/cart?canceled=true`,
      metadata: {
        order_id: newOrder.id,
        user_id: userId || "guest",
        fulfillment_type: isPickup ? "pickup" : "shipping",
        total_weight_oz: String(totalWeightOz),
      },
    };

    const session = await stripe.checkout.sessions.create(sessionConfig);

    // 7. Update the Pending Order with the Stripe Session ID
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        stripe_session_id: session.id,
        total_amount: session.amount_total / 100, // Stripe returns the discounted total in cents
      })
      .eq("id", newOrder.id);

    if (updateError) {
      console.error("Failed to update order with Stripe session ID:", updateError);
    }

    return res.status(200).json({
      success: true,
      url: session.url,
      sessionId: session.id,
      orderId: newOrder.id,
      fulfillmentType: isPickup ? "pickup" : "shipping",
    
    });
  } catch (error) {
    console.error(
      "Checkout session creation failed:",
      error?.code || error?.type || "Unknown error"
    );
    return res.status(500).json({
      success: false,
      message: "Failed to create checkout session. Please try again.",
    });
  }
};


/**
 * DT-543: Accept an on_hold order, capture payment in Stripe, purchase EasyPost label,
 * store tracking & label metadata, and transition status to 'accepted'.
 */
export const acceptOrder = async (req, res) => {
  try {
    const { id: orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required.",
      });
    }

    // 1. Fetch order from Supabase
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // 2. Validate order status
    if (!["on_hold", "cancel_requested"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be accepted because it has status '${order.status}'. Only 'on_hold' or 'cancel_requested' orders can be accepted.`,
      });
    }

    // 3. Capture Payment in Stripe if payment intent exists
    if (order.stripe_payment_intent_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
        if (paymentIntent.status === "requires_capture") {
          await stripe.paymentIntents.capture(order.stripe_payment_intent_id);
          console.log(`Payment captured for order ${orderId}: ${order.stripe_payment_intent_id}`);
        }
      } catch (stripeErr) {
        if (process.env.NODE_ENV === "test" && order.stripe_payment_intent_id?.startsWith("pi_test_mock")) {
          console.log(`[TEST MODE] Mock payment intent ${order.stripe_payment_intent_id} bypass capture.`);
        } else {
          console.error(`Failed to capture Stripe payment for order ${orderId}:`, stripeErr);
          return res.status(500).json({
            success: false,
            message: `Stripe payment capture failed: ${stripeErr.message}`,
          });
        }
      }
    }

    // 4. Purchase EasyPost Label if shipping (skip for local pickup)
    let shippingResult = null;
    const isPickup = (order.fulfillment_type || "shipping") === "pickup";

    if (!isPickup) {
      try {
        let totalWeightOz = "16";
        let shippingDetails = null;

        if (order.stripe_session_id) {
          try {
            const session = await stripe.checkout.sessions.retrieve(order.stripe_session_id);
            if (session.metadata?.total_weight_oz) {
              totalWeightOz = session.metadata.total_weight_oz;
            }
            shippingDetails = session.shipping_details || session.customer_details;
          } catch (sessionErr) {
            console.warn(
            "Could not retrieve Stripe session for weight or shipping details."
            );
          }
        }

        if (shippingDetails) {
          shippingResult = await purchaseEasyPostLabelFromStripe(
            orderId,
            shippingDetails,
            order.customer_email,
            totalWeightOz
          );
        } else {
          console.warn(`No shipping details found for order ${orderId}, skipping EasyPost label purchase.`);
        }
      } catch (labelErr) {
        console.error(`Postage purchase failed for order ${orderId}:`, labelErr);
        return res.status(500).json({
          success: false,
          message: `Order payment captured, but EasyPost label purchase failed: ${labelErr.message}`,
        });
      }
    }

    // 5. Update order status to 'accepted'
    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: "accepted" })
      .eq("id", orderId);

    if (updateError) {
      console.error(`Failed to update order status to accepted:`, updateError);
      return res.status(500).json({
        success: false,
        message: "Failed to update order status to accepted.",
      });
    }

    console.log(`Order ${orderId} successfully accepted.`);
    return res.status(200).json({
      success: true,
      message: "Order accepted successfully.",
      orderId,
      status: "accepted",
      trackingNumber: shippingResult?.trackingNumber || order.tracking_number || null,
      labelUrl: shippingResult?.labelUrl || order.label_url || null,
    });
  } catch (err) {
    console.error("Error in acceptOrder:", err);
    return res.status(500).json({
      success: false,
      message:"Failed to accept order. Please try again.",
    });
  }
};

/**
 * Decline an on_hold order: release Stripe payment hold, transition status to 'cancelled',
 * and notify the customer.
 */
export const declineOrder = async (req, res) => {
  try {
    const { id: orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required.",
      });
    }

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    if (!["on_hold", "cancel_requested", "accepted"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because it has status '${order.status}'.`,
      });
    }


    // 1. Cancel Stripe PaymentIntent authorization hold (or refund if already captured)
    if (order.stripe_payment_intent_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.retrieve(order.stripe_payment_intent_id);
        if (paymentIntent.status === "requires_capture") {
          await stripe.paymentIntents.cancel(order.stripe_payment_intent_id);
          console.log(`Payment authorization hold cancelled for order ${orderId}`);
        } else if (paymentIntent.status === "succeeded") {
          await stripe.refunds.create({ payment_intent: order.stripe_payment_intent_id });
          console.log(`Stripe refund issued for order ${orderId}`);
        }
      } catch (stripeErr) {
        if (process.env.NODE_ENV === "test" && order.stripe_payment_intent_id?.startsWith("pi_test_mock")) {
          console.log(`[TEST MODE] Mock payment intent ${order.stripe_payment_intent_id} bypass cancel.`);
        } else {
          console.error(`Failed to cancel/refund Stripe payment for order ${orderId}:`, stripeErr);
        }
      }
    }

        // 2. Void EasyPost label if one was purchased (DT-36 / DT-546)
    if (order.easypost_shipment_id) {
      try {
        await easypost.Shipment.refund(order.easypost_shipment_id);
        console.log(`EasyPost shipment ${order.easypost_shipment_id} refunded/voided for order ${orderId}.`);
      } catch (easypostErr) {
        console.error(`Failed to void EasyPost label for order ${orderId}:`, easypostErr.message || easypostErr);
      }
    }


    // 3. Update order status to 'cancelled'
    const { error: cancelError } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", orderId);

    if (cancelError) {
      console.error(`Failed to mark order as cancelled:`, cancelError);
      return res.status(500).json({
        success: false,
        message: "Failed to mark order as cancelled.",
      });
    }

    // 4. Notify customer of cancellation
    if (order.customer_email) {
      sendOrderCancelledEmail({
        customerEmail: order.customer_email,
        orderId,
      }).catch((mailErr) => {
        console.error("Failed to send cancellation email:", mailErr);
      });
    }

    console.log(`Order ${orderId} successfully declined/cancelled.`);
    return res.status(200).json({
      success: true,
      message: "Order declined and payment hold released.",
      orderId,
      status: "cancelled",
    });
  } catch (err) {
    console.error("Error in declineOrder:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to decline order. Please try again.",
    });
  }
};

/**
 * Customer requests cancellation while order is on_hold.
 * Verifies status and emails the admin.
 */
export const requestCancelOrder = async (req, res) => {
  try {
    const { id: orderId } = req.params;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required.",
      });
    }

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("*")
      .eq("id", orderId)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // Check whether the authenticated customer owns this order
    const isOrderOwner =
      req.user?.id &&
      order.user_id &&
      req.user.id === order.user_id;

    // Check the cancellation token provided in the request
    const cancellationToken = req.body?.cancellationToken;

    const hasValidToken = verifyCancellationToken(
      cancellationToken,
      order.cancellation_token_hash
    );

    // Require either verified ownership or a valid cancellation token
    if (!isOrderOwner && !hasValidToken) {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to request cancellation of this order.",
      });
    }

    if (order.status === "cancel_requested") {
      return res.status(200).json({
        success: true,
        message: "Cancellation request was already submitted and the store admin has been notified.",
        orderId,
      });
    }

    if (order.status !== "on_hold") {
      return res.status(400).json({
        success: false,
        message: `Order cannot be cancelled because it is no longer on hold (status is '${order.status}').`,
      });
    }

    const { error: updateErr } = await supabase
      .from("orders")
      .update({ status: "cancel_requested" })
      .eq("id", orderId);

    if (updateErr) {
      console.error("Failed to update status to cancel_requested:", updateErr);
      return res.status(500).json({
        success: false,
        message: "Failed to record cancellation request in database.",
      });
    }

    if (order.customer_email) {
      sendCancellationRequestToAdmin({
        orderId,
        customerEmail: order.customer_email,
      }).catch((mailErr) => {
        console.error("Failed to send cancellation request email to admin:", mailErr);
      });
    }

    return res.status(200).json({
      success: true,
      message: "Cancellation request received and sent to the store admin.",
      orderId,
    });
  } catch (err) {
    console.error("Error in requestCancelOrder:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to submit cancellation request. Please try again.",
    });
  }
};

/**
 * Fetch an order by its Stripe checkout session ID for the payment success page.
 * Public endpoint (no auth) so guest checkouts can view their order; the Stripe
 * session ID acts as the secret since it only appears in the payer's success URL.
 * Uses the service-role client to bypass RLS, returning only the fields the
 * success page needs.
 */
export const getOrderBySession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId || !sessionId.startsWith("cs_")) {
      return res.status(400).json({
        success: false,
        message: "A valid checkout session ID is required.",
      });
    }

    const { data: order, error } = await supabase
      .from("orders")
      .select(`
        id,
        status,
        total_amount,
        order_items (
          id,
          quantity,
          unit_price,
          product_id,
          products (
            name
          )
        )
      `)
      .eq("stripe_session_id", sessionId)
      .single();

    if (error || !order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.status(200).json({ success: true, order });
  } catch (err) {
    console.error("Error in getOrderBySession:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to load order. Please try again.",
    });
  }
};

