import { Router } from 'express';
import whatsappRouter from './whatsapp.routes';
import authRouter from './auth.routes';
import adminRouter from './admin.routes';
// import stripeRouter from './stripe.routes'; // <-- IMPORT

const router = Router();

router.use('/whatsapp', whatsappRouter);
router.use('/auth', authRouter);
router.use('/admin', adminRouter);
// router.use('/stripe', stripeRouter); // <-- USE THE ROUTER

export default router;