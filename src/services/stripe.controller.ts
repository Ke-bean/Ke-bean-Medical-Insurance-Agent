// src/controllers/stripe.controller.ts

import { Request, Response } from 'express';
import { handleStripeWebhook } from '../services/payment.service';

/**
 * Controller to handle incoming webhooks from Stripe.
 * It extracts the necessary signature and raw body from the request
 * and passes them to the payment service for secure verification and processing.
 */
export const stripeWebhookHandler = async (req: Request, res: Response): Promise<void> => {
  // Get the 'stripe-signature' header from the request.
  console.log('--- STRIPE WEBHOOK INCOMING ----');
  console.log('HEADERS:', JSON.stringify(req.headers, null, 2));

  const sig = req.headers['stripe-signature'] as string;

  // Get the raw request body that we attached in the 'verify' function
  // of the express.json() middleware in src/index.ts.
  const rawBody = req.rawBody;

  // Basic validation to ensure we have what we need for verification.
  if (!sig || !rawBody) {
    console.error('❌ Missing Stripe signature or raw body in webhook request.');
    res.status(400).send('Webhook Error: Missing stripe-signature header or request body.');
    return;
  }

  try {
    // Pass the rawBody and signature to the service layer.
    // The service layer will handle the verification and business logic.
    await handleStripeWebhook(rawBody, sig);

    // If the service function completes without throwing an error, it was successful.
    // Send a 200 OK response back to Stripe to acknowledge receipt.
    res.status(200).json({ received: true, message: 'Webhook processed successfully.' });

  } catch (error: any) {
    // The service layer throws specific errors (e.g., signature verification failed).
    // We catch them here and send the appropriate HTTP status code back to Stripe.
    console.error(`❌ Stripe Webhook Controller Error: ${error.message}`);
    res.status(400).send(`Webhook Error: ${error.message}`);
  }
};
