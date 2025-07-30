import { Request, Response } from 'express';
import { handleStripeWebhook } from '../services/payment.service';

/**
 * Controller to handle incoming webhooks from Stripe.
 * It passes the raw request to the service layer for secure processing.
 */

export const stripeWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;

  // The raw body is now directly on req.body because we used express.raw()
  const body = req.body; 

  if (!sig || !body) {
    res.status(400).send('Webhook Error: Missing stripe-signature header or request body.');
    return;
  }

  try {
    // Pass the raw body and signature directly to the service
    await handleStripeWebhook(body, sig);
    res.status(200).json({ received: true });
  } catch (error: any) {
    console.error(`❌ Stripe Webhook Controller Error: ${error.message}`);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
};

// export const stripeWebhookHandler = async (req: Request, res: Response): Promise<void> => {
//   // ===================================================================
//   // --- TEMPORARY DEBUGGING LOG ---
//   // This will show us exactly what headers are arriving.
//   console.log('--- STRIPE WEBHOOK REQUEST RECEIVED ---');
//   console.log('Timestamp:', new Date().toISOString());
//   console.log('Request Headers:', JSON.stringify(req.headers, null, 2));
//   // ===================================================================

//   // Get the 'stripe-signature' header from the request.
//   // Note: All HTTP headers are automatically converted to lowercase by many servers/proxies.
//   const sig = req.headers['stripe-signature'] as string;

//   const rawBody = req.rawBody;

//   if (!sig || !rawBody) {
//     // This log will tell us if our code thinks the signature is missing.
//     console.error('❌ Code Check Failed: Missing Stripe signature or raw body.');
//     console.error(`Value of sig: ${sig}`);
//     console.error(`Does rawBody exist? ${!!rawBody}`);
//     res.status(400).send('Webhook Error: Missing stripe-signature header or request body.');
//     return;
//   }

//   try {
//     await handleStripeWebhook(rawBody, sig);
//     res.status(200).json({ received: true, message: 'Webhook processed successfully.' });
//   } catch (error: any) {
//     console.error(`❌ Stripe Webhook Controller Error: ${error.message}`);
//     res.status(400).send(`Webhook Error: ${error.message}`);
//   }
// };





























// export const stripeWebhookHandler = async (req: Request, res: Response) => {
//   // We need to modify the Express request to pass the raw body,
//   // as Stripe's verification library needs it.
//   // Our custom middleware in index.ts handles this.
//   const rawBodyRequest = req as any;

//   try {
//     // Pass the modified request with the raw body to the service
//     await handleStripeWebhook(rawBodyRequest);

//     // If the service function completes without throwing, it was successful.
//     res.status(200).json({ received: true, message: 'Webhook processed successfully.' });

//   } catch (error: any) {
//     // The service layer throws specific errors (e.g., signature verification failed)
//     // which we use to send the appropriate HTTP status code back to Stripe.
//     console.error(`❌ Stripe Webhook Controller Error: ${error.message}`);
//     res.status(400).send(`Webhook Error: ${error.message}`);
//   }
// };
