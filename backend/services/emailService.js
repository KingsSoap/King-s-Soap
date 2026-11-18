/**
 * Email service using Brevo REST API
 */

export const sendBrevoEmail = async ({ to, subject, htmlContent, textContent }) => {
  const brevoApiKey = process.env.BREVO_API_KEY;
  const brevoSenderEmail = process.env.BREVO_SENDER_EMAIL || "info@kingssoap.com";
  const brevoSenderName = process.env.BREVO_SENDER_NAME || "King's Soap";

  if (!brevoApiKey) {
    console.warn("BREVO_API_KEY is not configured; skipping email dispatch.");
    return { success: false, reason: "BREVO_API_KEY missing" };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "api-key": brevoApiKey,
      },
      body: JSON.stringify({
        sender: {
          name: brevoSenderName,
          email: brevoSenderEmail,
        },
        to: Array.isArray(to) ? to : [{ email: to }],
        subject,
        ...(htmlContent ? { htmlContent } : {}),
        ...(textContent ? { textContent } : {}),
      }),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("Brevo API error:", result);
      return { success: false, error: result };
    }

    return { success: true, messageId: result.messageId };
  } catch (err) {
    console.error("Failed to connect to Brevo API:", err.message || err);
    return { success: false, error:  "Email service temporarily unavailable.", };
  }
};

/**
 * Send order confirmation to customer with a cancellation request link
 */
export const sendOrderConfirmationEmail = async ({
  customerEmail,
  customerName = "Customer",
  orderId,
  totalAmount,
  isPickup = false,
  cancellationToken,
}) => {
  if (!customerEmail) return;

  // Require a cancellation token before generating the email
  if (!cancellationToken) {
    throw new Error("Cancellation token is required.");
  }

const clientUrl = process.env.CLIENT_URL?.replace(/\/+$/, "");

if (!clientUrl) {
  throw new Error("CLIENT_URL is not configured.");
}
  // Include the order ID and secure cancellation token in the link
  const cancellationUrl =
    `${clientUrl}/request-cancellation` +
    `?orderId=${encodeURIComponent(orderId)}` +
    `&token=${encodeURIComponent(cancellationToken)}`;

  const subject = `King's Soap: Order Confirmation (#${orderId.slice(0, 8)})`;
  const textContent = `Hello ${customerName},

Thank you for your order with King's Soap!

Order ID: ${orderId}
Total: $${Number(totalAmount || 0).toFixed(2)}
Fulfillment: ${isPickup ? "Local Pickup" : "Standard Shipping"}

Your order is currently ON HOLD pending review by our team. Your payment authorization is secured and you will receive an official payment receipt once your order is accepted.

Need to cancel your order?
If you would like to request cancellation before your order is processed, please visit:
${cancellationUrl}

Thank you,
King's Soap`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px;">
      <h2 style="color: #2b2d42; border-bottom: 2px solid #eaeaea; padding-bottom: 8px;">Order Received!</h2>
      <p>Hello <strong>${customerName}</strong>,</p>
      <p>Thank you for shopping with King's Soap! We have received your order details.</p>
      
      <div style="background-color: #f7fafc; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Order ID:</strong> ${orderId}</p>
        <p style="margin: 4px 0;"><strong>Total:</strong> $${Number(totalAmount || 0).toFixed(2)}</p>
        <p style="margin: 4px 0;"><strong>Fulfillment:</strong> ${isPickup ? "Local Pickup" : "Standard Shipping"}</p>
        <p style="margin: 4px 0;"><strong>Status:</strong> <span style="display: inline-block; background-color: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 12px;">ON HOLD</span></p>
      </div>

      <p style="font-size: 14px; color: #4a5568;">
        Your order is on hold pending review by our team. Your payment has been authorized, and you will receive an official payment receipt once your order is accepted for fulfillment.
      </p>

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0;">
        <h4 style="margin-bottom: 8px; color: #4a5568;">Need to make a change or cancel?</h4>
        <p style="font-size: 13px; color: #718096; margin-bottom: 12px;">
          You can request a cancellation at any time before your order is accepted:
        </p>
        <a href="${cancellationUrl}" style="display: inline-block; background-color: #e53e3e; color: #ffffff; text-decoration: none; padding: 8px 16px; border-radius: 4px; font-size: 13px; font-weight: bold;">
          Request Cancellation
        </a>
      </div>
    </div>
  `;

  return sendBrevoEmail({
    to: [{ email: customerEmail, name: customerName }],
    subject,
    htmlContent,
    textContent,
  });
};


/**
 * Send cancellation request notification to the store administrator
 */
export const sendCancellationRequestToAdmin = async ({ orderId, customerEmail }) => {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.BREVO_SENDER_EMAIL || "kingssoaptesting01@gmail.com";

  const subject = `Action Required: Customer Requested Cancellation for Order #${orderId.slice(0, 8)}`;
  const textContent = `Hello Admin,

A customer has requested cancellation for an order that is currently ON HOLD:

Order ID: ${orderId}
Customer Email: ${customerEmail}

Please review this order in your Admin Orders dashboard and approve or cancel the order accordingly.`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h3 style="color: #c53030;">Cancellation Requested by Customer</h3>
      <p>A customer has requested to cancel their order before approval:</p>
      <ul>
        <li><strong>Order ID:</strong> ${orderId}</li>
        <li><strong>Customer Email:</strong> ${customerEmail}</li>
      </ul>
      <p>Please log in to the Admin Dashboard to review and cancel or accept the order.</p>
    </div>
  `;

  return sendBrevoEmail({
    to: [{ email: adminEmail }],
    subject,
    htmlContent,
    textContent,
  });
};

/**
 * Send cancellation notice to the customer
 */
export const sendOrderCancelledEmail = async ({ customerEmail, customerName = "Customer", orderId }) => {
  if (!customerEmail) return;

  const subject = `King's Soap: Order Cancelled (#${orderId.slice(0, 8)})`;
  const textContent = `Hello ${customerName},

Your order #${orderId} with King's Soap has been cancelled. Any pre-authorization hold on your payment method has been released and you will not be charged.

Thank you,
King's Soap`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2>Order Cancelled</h2>
      <p>Hello <strong>${customerName}</strong>,</p>
      <p>Your order <strong>#${orderId}</strong> has been cancelled. Any pre-authorization hold on your payment method has been released and you will not be charged.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="font-size: 12px; color: #888;">King's Soap</p>
    </div>
  `;

  return sendBrevoEmail({
    to: [{ email: customerEmail, name: customerName }],
    subject,
    htmlContent,
    textContent,
  });
};
