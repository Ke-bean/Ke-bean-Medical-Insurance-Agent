// src/index.ts

import express from 'express';
import { config } from './config';
// We need to import the stripe router directly here now
import stripeRouter from './api/stripe.routes'; 
import apiRouter from './api';
//import seed file
import { seed } from './seed'


const app = express();

// seed()
// --- ROUTE-SPECIFIC MIDDLEWARE ---
// 1. Define the Stripe webhook route FIRST, without the global express.json() middleware.
//    Stripe requires the raw body, so we use express.raw({ type: 'application/json' })
//    ONLY for this specific route.
app.use('/api/stripe', express.raw({ type: 'application/json' }), stripeRouter);


// --- GLOBAL MIDDLEWARE ---
// 2. Now, apply the global JSON parser for all OTHER routes.
//    This will not affect the '/api/stripe' route because it has already been defined.
app.use(express.json());


// --- OTHER ROUTES ---
// 3. Mount the main API router. It will handle all routes EXCEPT /api/stripe,
//    which we've already handled.
app.use('/api', apiRouter);


// Health check endpoint
app.get('/', (req, res) => {
  res.status(200).send('Insurance Agent is alive!');
});

app.listen(config.PORT, () => {
  console.log(`🚀 Server is running on port ${config.PORT}`);
});



























































// // src/index.ts

// import express from 'express';
// import { config } from './config';
// import apiRouter from './api';

// const app = express();

// // IMPORTANT: We need the raw body for Stripe webhook verification.
// // The `express.json()` middleware should be placed *after* the Stripe webhook route.
// // Or, we can use this conditional check.

// app.use(
//   express.json({
//     verify: (req: any, res, buf) => {
//       // Make the raw body available on the request object
//       // for the /api/stripe/webhook route ONLY.
//       if (req.originalUrl.startsWith('/api/stripe/webhook')) {
//         req.rawBody = buf.toString();
//       }
//     },
//   })
// );

// // Main API router
// app.use('/api', apiRouter);

// // Health check endpoint
// app.get('/', (req, res) => {
//   res.status(200).send('Insurance Agent is alive!');
// });

// app.listen(config.PORT, () => {
//   console.log(`🚀 Server is running on port ${config.PORT}`);
// });



























































// // import express from 'express';
// // import { config } from './config';
// // import apiRouter from './api';

// // const app = express();

// // // Middleware to parse JSON bodies
// // app.use(express.json());

// // // Main API router
// // app.use('/api', apiRouter);

// // // Health check endpoint
// // // This version is identical to the scaffolded code, but now you know why it works.
// // // The curly braces create a function body, and since there's no return, the type is void.
// // app.get('/', (req, res) => {
// //   res.status(200).send('Insurance Agent is alive!');
// // });

// // app.listen(config.PORT, () => {
// //   console.log(`🚀 Server is running on port ${config.PORT}`);
// // });