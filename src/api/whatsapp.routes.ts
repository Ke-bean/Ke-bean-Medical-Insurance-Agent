import { Router } from 'express';
import { verifyWebhook, handleIncomingMessage } from '../controllers/whatsapp.controller';

const router = Router();

/**
 * @route GET /api/whatsapp
 * @description This route is used by Meta to verify the webhook.
 * It expects a hub.verify_token that matches the one in our .env file.
 */
router.get('/', verifyWebhook);

/**
 * @route POST /api/whatsapp
 * @description This route receives all incoming messages and events from users on WhatsApp.
 * It's the main entry point for our AI agent.
 */
router.post('/', handleIncomingMessage);

export default router;
