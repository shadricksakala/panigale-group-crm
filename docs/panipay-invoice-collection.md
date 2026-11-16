# PaniPay invoice collection

The CRM keeps its invoice record and sends a matching PaniPay invoice for hosted customer checkout. PaniPay remains the payment processor and source of truth for collection; the CRM records only payments verified through PaniPay's API.

## Configure a merchant

1. Set the Cloudflare secret `CRM_INTEGRATION_ENCRYPTION_KEY` to a 32-byte hex key. This is also used by the CRM's Google integration. Never put it in Wrangler vars or source.
2. In PaniPay Developers, create a server API key for the merchant with `invoices:read`, `invoices:write`, and `payments:read` scopes.
3. In that same merchant account, create a webhook endpoint for `payment.succeeded`, using the CRM webhook URL shown under CRM → Invoices. Paste the PaniPay API key and the endpoint's complete `whsec_` signing secret into that unit's PaniPay connection card. Credentials are encrypted at rest and are not returned to the browser after saving.
4. Repeat for each business unit's merchant. CRM superadmins manage these connections; users who can see financial records in a unit can send invoices and refresh payment status.

## Send and reconcile

Send an existing ZMW CRM invoice from CRM → Invoices. The CRM maps its title to one PaniPay line item and uses the linked contact's email, falling back to the linked organization's email. A valid email and positive amount are required. If no due date was entered, the CRM uses 30 days after issue. PaniPay emails the customer its hosted invoice and checkout link.

The CRM imports a payment only after `GET /api/v1/payments?id=…` confirms `succeeded`, ZMW, the expected PaniPay invoice, and an amount no greater than the remaining balance. Signed webhooks provide timely reconciliation; **Refresh payment** checks PaniPay again to recover missed deliveries. Imports are deduplicated by PaniPay payment ID.

Card or mobile-money availability is governed by the merchant's PaniPay collection capabilities and provider configuration. A sent invoice or a customer redirect is not evidence that money was collected.
