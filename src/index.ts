// src/index.ts

import express from 'express';
import cors from 'cors'; // <-- 1. IMPORT CORS
import { config } from './config';
import stripeRouter from './api/stripe.routes'; 
import apiRouter from './api';
import { seed } from './seed'; // Your seed import

const app = express();

// ===================================================================
// --- 2. ADD CORS MIDDLEWARE CONFIGURATION ---
// This should be one of the first middleware your app uses.
// ===================================================================
const corsOptions: cors.CorsOptions = {
  origin: config.CORS_ORIGIN, // We'll get this from our environment variables
};

app.use(cors(corsOptions));
// ===================================================================

// Your seed function call (if you want to run it on startup)
// seed();

// --- ROUTE-SPECIFIC MIDDLEWARE (Your existing, correct logic) ---
// 1. Stripe webhook route uses its own RAW body parser.
app.use('/api/stripe', express.raw({ type: 'application/json' }), stripeRouter);

// --- GLOBAL MIDDLEWARE (Your existing, correct logic) ---
// 2. Apply the global JSON parser for all OTHER routes.
app.use(express.json());

// --- OTHER ROUTES (Your existing, correct logic) ---
// 3. Mount the main API router.
app.use('/api', apiRouter);

// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('Insurance Agent is alive!');
});

app.listen(config.PORT, () => {
  console.log(`🚀 Server is running on port ${config.PORT}`);
});