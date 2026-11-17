import Stripe from "stripe";
import supabase from "../supabaseClient.js";
import easypost from "../easypostClient.js";
import { sendOrderConfirmationEmail } from "../services/emailService.js";
import { randomBytes, createHash } from "node:crypto";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Generate a secure cancellation token and its SHA-256 hash
const generateCancellationToken = () => {
  const token = randomBytes(32).toString("hex");

  const tokenHash = createHash("sha256")
    .update(token)
    .digest("hex");

  return { token, tokenHash };
};

const SENDER_ADDRESS = {
  street1: "6000 J St",
  city: "Sacramento",
  state: "CA",
  zip: "95819",
  country: "US",
  company: "King's Soap",
  phone: "(916) 856-9659"
};

/**
 * Creates and purchases postage using the shipping address returned by Stripe.
 */
export const purchaseEasyPostLabelFromStripe = async (orderId, shippingDetails, customerEmail, totalWeightOz) => {
  try {
    const address = shippingDetails?.address || shippingDetails || {};

    // 1. Build EasyPost to_address from Stripe payload
    const toAddress = {
      name: shippingDetails?.name || "Customer",
      street1: address.line1 || address.street1,
      street2: address.line2 || address.street2 || "",
      city: address.city,
      state: address.state,
      zip: address.postal_code || address.zip || address.postalCode,
      country: address.country || "US",
      email: customerEmail || undefined,
    };

    // 2. Stage shipment with the weight passed in metadata
    const shipment = await easypost.Shipment.create({
      from_address: SENDER_ADDRESS,
      to_address: toAddress,
      parcel: {
        weight: Number(totalWeightOz) || 16,
      },
    });

    // 3. Select cheapest rate (preferring USPS Ground Advantage)
    const selectedRate =
      shipment.lowestRate(["USPS"], ["GroundAdvantage"]) || shipment.lowestRate();

    if (!selectedRate) {
      throw new Error(`No viable shipping rates found for order ${orderId}`);
    }

    // 4. Purchase the label
    const boughtShipment = await easypost.Shipment.buy(shipment.id, selectedRate.id);

    // 5. Update public.orders with EasyPost shipment metadata
    const updateData = {
      easypost_shipment_id: boughtShipment.id,
      carrier: selectedRate.carrier,
      shipping_service: selectedRate.service,
      shipping_cost: parseFloat(selectedRate.rate),
      tracking_number: boughtShipment.tracking_code,
      label_url: boughtShipment.postage_label?.label_url || null,
    };
    if (boughtShipment.tracker?.id) {
      updateData.easypost_tracker_id = boughtShipment.tracker.id;
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId);

    if (updateError) {
      console.error(`Failed to persist shipment details for order ${orderId}:`, updateError);
    } else {
      console.log(`EasyPost label purchased and saved for order ${orderId}: tracking=${boughtShipment.tracking_code}, label=${boughtShipment.postage_label?.label_url}`);
    }

    return {
      success: true,
      shipment: boughtShipment,
      trackingNumber: boughtShipment.tracking_code,
      labelUrl: boughtShipment.postage_label?.label_url || null,
      carrier: selectedRate.carrier,
      service: selectedRate.service,
      rate: selectedRate.rate,
    };
  } catch (shippingErr) {
    console.error(`EasyPost creation/purchase failed for order ${orderId}:`, shippingErr.message || shippingErr);
    if (shippingErr.errors) {
      console.error(`EasyPost error details:`, JSON.stringify(shippingErr.errors, null, 2));
    }
    await supabase
      .from("orders")
      .update({ status: "payment_cleared_label_failed" })
      .eq("id", orderId);
    throw shippingErr;
  }
};


/**
 * Express Raw-Body Stripe Webhook Listener (DT-490 & DT-491)
 */
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig) {
    return res.status(400).send("Webhook Error: Missing stripe-signature header.");
  }

  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured in environment.");
    return res.status(500).send("Webhook Error: Webhook secret not configured.");
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      // =========================================================================
      // DT-491 Acceptance Criteria 1-4: checkout.session.completed
      // =========================================================================
      case "checkout.session.completed": {
        const session = event.data.object;

        // 1. Extract order_id and user_id from metadata
        const orderId = session.metadata?.order_id;
        const userId = session.metadata?.user_id;
        const fulfillmentType = session.metadata?.fulfillment_type;
        const easypostShipmentId = session.metadata?.easypost_shipment_id;
        const easypostRateId = session.metadata?.easypost_rate_id;

        const paymentIntentId =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id || null;

        const customerEmail =
          session.customer_details?.email ||
          session.customer_email ||
          null;

        const finalTotal = session.amount_total != null
          ? Number((session.amount_total / 100).toFixed(2))
          : undefined;

        // 2. Update public.orders: status = 'on_hold', stripe_payment_intent_id
        const updatePayload = {
          status: "on_hold",
          stripe_payment_intent_id: paymentIntentId,
          ...(finalTotal !== undefined ? { total_amount: finalTotal } : {}),
          ...(fulfillmentType ? { fulfillment_type: fulfillmentType } : {}),
          ...(customerEmail ? { customer_email: customerEmail } : {}),
        };

        // Only transition orders that are still pending
        let updateQuery = supabase
          .from("orders")
          .update(updatePayload)
          .eq("status", "pending");

        if (orderId) {
          updateQuery = updateQuery.eq("id", orderId);
        } else {
          updateQuery = updateQuery.eq("stripe_session_id", session.id);
        }

        // Return the updated row so we can verify this request claimed the order
        const { data: updatedOrders, error: orderUpdateError } =
          await updateQuery.select("id");

        if (orderUpdateError) {
          console.error("Failed to update order status in Supabase:", orderUpdateError);
          throw orderUpdateError;
        }

          // Determine which order was updated
          let processedOrderId = updatedOrders?.[0]?.id;

          // Track whether this is a retry of an existing order
          const isWebhookRetry = !processedOrderId;

          // If the order was not pending, check whether inventory processing needs recovery
          if (!processedOrderId) {
            const { data: existingOrder, error: lookupError } = await supabase
              .from("orders")
              .select("id, status, inventory_processed_at")
              .eq("stripe_session_id", session.id)
              .maybeSingle();

          if (lookupError) {
            throw lookupError;
          }

          // Only resume orders still on hold with unfinished inventory processing
          if (
            !existingOrder ||
            existingOrder.status !== "on_hold" ||
            existingOrder.inventory_processed_at !== null
          ) {
            console.log("Stripe checkout event already processed or not eligible. Skipping.");
            break;
          }

          processedOrderId = existingOrder.id;
        }

        console.log(`Processing checkout for order ${processedOrderId}.`);



        // 3. EasyPost label purchase is decoupled here (DT-542).
        // Label will be purchased when an admin explicitly accepts the order (DT-543).


        // 4. Process inventory and cancellation token atomically through Supabase
        if (!processedOrderId) {
          throw new Error("Cannot process inventory without a valid order ID.");
        }

        // Generate a secure cancellation token before processing inventory
        const { token: cancellationToken, tokenHash } = generateCancellationToken();

        // Process inventory and store the token hash in one database transaction
        const { data: inventoryProcessed, error: inventoryError } =
          await supabase.rpc("process_order_inventory", {
            p_order_id: processedOrderId,
            p_token_hash: tokenHash,
          });

        if (inventoryError) {
          console.error("Failed to process order inventory:", inventoryError);
          throw inventoryError;
        }

        if (!inventoryProcessed) {
          console.log(`Inventory already processed for order ${processedOrderId}. Skipping.`);
          break;
        }

        console.log(`Inventory and cancellation token processed for order ${processedOrderId}.`);

        // 5. Clear cart: DELETE FROM public.cart WHERE user_ID = metadata.user_id
       try {
          const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

          if (userId && uuidRegex.test(userId)) {
            const { error: cartClearError } = await supabase
              .from("cart")
              .delete()
              .eq("user_ID", userId);

            if (cartClearError) {
              console.error("Failed to clear cart after successful payment:", cartClearError);
            } else {
              console.log(`Cart cleared for user ${userId}.`);
            }
          } else {
            console.log(`Skipping database cart clear for guest/non-UUID identifier: ${userId}`);
          }
        } catch (cartErr) {
          console.error("Error during cart clearing execution:", cartErr);
        }

        // 6. Send order confirmation email with cancellation request option
        if (customerEmail && processedOrderId && cancellationToken) {
          const customerName =
            session.customer_details?.name ||
            session.shipping_details?.name ||
            "Customer";

          let emailResult;

          try {
            emailResult = await sendOrderConfirmationEmail({
              customerEmail,
              customerName,
              orderId: processedOrderId,
              totalAmount: finalTotal,
              isPickup: fulfillmentType === "pickup",
              cancellationToken,
            });
          } catch (emailError) {
            console.error("Confirmation email request failed:", emailError);
            emailResult = { success: false };
          }

          const emailAccepted = emailResult?.success === true;

          if (!emailAccepted) {
            console.error(
              `Brevo did not accept the confirmation email for order ${processedOrderId}.`
            );
          }
        }

        break;
      }

      // =========================================================================
      // DT-491 Acceptance Criterion 5: checkout.session.expired
      // =========================================================================
      case "checkout.session.expired": {
        const session = event.data.object;
        const orderId = session.metadata?.order_id;

        // Update order status to 'cancelled'. Leave cart untouched.
        let updateQuery = supabase
          .from("orders")
          .update({ status: "cancelled" });

        if (orderId) {
          updateQuery = updateQuery.eq("id", orderId);
        } else {
          updateQuery = updateQuery.eq("stripe_session_id", session.id);
        }

        const { error: cancelError } = await updateQuery;
        if (cancelError) {
          console.error("Failed to mark order as cancelled:", cancelError);
        } else {
          console.log(`Order ${orderId || session.id} marked as cancelled due to expired session.`);
        }

        break;
      }

      default:
        console.log(`Unhandled Stripe event type: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Error processing webhook event:", err);
    return res.status(500).json({
      error: "Error processing webhook event.",
    });
  }
};


