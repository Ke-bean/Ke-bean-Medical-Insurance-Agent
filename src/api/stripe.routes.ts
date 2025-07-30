import { Router } from 'express';
import { stripeWebhookHandler } from '../controllers/stripe.controller';

const router = Router();

/**
 * @route POST /api/stripe/webhook
 * @description This is the dedicated endpoint for receiving and processing
 * events sent from the Stripe platform.
 */
router.post('/webhook', stripeWebhookHandler);

export default router;