# Panigale CRM support API

Each app sends requests to its business unit's configured support integration. Integration keys are generated in CRM under **Support → Connect an app**. The secret is shown once, stored as a SHA-256 hash in CRM, and must stay in an app server's secret store.

## Create a ticket

`POST https://crm.panigale.tech/api/support/v1/tickets`

```http
Authorization: Bearer pg_support_<secret>
Content-Type: application/json
```

```json
{
  "sourceTicketId": "app-case-123",
  "customerName": "Amina Banda",
  "customerEmail": "amina@example.com",
  "companyName": "Banda Logistics",
  "subject": "Payment received but invoice is still pending",
  "category": "Payment or invoice",
  "priority": "high",
  "sourceStatus": "open",
  "reference": "INV-0194",
  "message": "The payment is shown as received, but the invoice is still pending."
}
```

The key determines the app and business unit. `sourceTicketId` makes retries idempotent. Public product forms can use the CRM portal URL, for example `/support/panipay` or `/support/euroza`, and must not include an API key in browser code.

## Mirror product tickets

`POST /api/support/v1/sync` accepts up to 50 tickets and 1,000 messages per request. Every ticket uses a stable `sourceTicketId`; every message uses a stable `messageId`. Repeating the same payload does not duplicate source records. Updates preserve the source product status in `sourceStatus` and map it to the CRM queue status.

```json
{
  "tickets": [{
    "sourceTicketId": "ESC-123",
    "customerName": "Amina Banda",
    "customerEmail": "amina@example.com",
    "subject": "Escrow refund request",
    "category": "Escrow dispute",
    "priority": "high",
    "status": "waiting",
    "sourceStatus": "escalated",
    "reference": "payment-id",
    "createdAt": "2026-11-16T10:00:00.000Z",
    "updatedAt": "2026-11-16T10:15:00.000Z"
  }],
  "messages": [{
    "sourceTicketId": "ESC-123",
    "messageId": "message-456",
    "authorType": "customer",
    "authorName": "Amina Banda",
    "authorEmail": "amina@example.com",
    "body": "Please review my request.",
    "visibility": "public",
    "createdAt": "2026-11-16T10:00:00.000Z"
  }]
}
```

Successful responses include `{ "ok": true, "tickets": 1, "messages": 1 }`. A failed request should be retried by the source app; the same IDs remain safe to submit again.

## Email

Product integrations sync product-owned messages into CRM without triggering duplicate email. Public portal submissions receive an automatic receipt only when a unit manager has enabled receipts and the configured support sender is verified. Inbound mail is converted to a ticket when a unit's shared Gmail mailbox is connected and the message is addressed to the matching configured support email. Email replies from CRM are saved as client email drafts and must be approved in the Email module before delivery; approved replies include the ticket number in the subject so email responses can rejoin the thread. Turning receipts off cancels any queued support receipt before delivery.
