// src/services/payment.service.ts

import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { config } from '../config';
// Import both messaging functions from the whatsapp service
import { sendMessage as sendWhatsAppMessage, sendDocument } from './whatsapp.service';
import { addSystemMessageToConversation } from './agent.service';
import { generateAndUploadCertificate } from './document.service';

// Initialize the Stripe client.
const stripe = new Stripe(config.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-06-30.basil', // Using a stable, recommended API version
  typescript: true,
});

interface CreateCheckoutInput {
  quoteId: string;
  premium: number;
  customerName: string;
  customerEmail?: string;
}

/**
 * Creates a Stripe Checkout Session to collect payment from a user.
 * (This function is unchanged)
 */
export const createStripeCheckoutSession = async (input: CreateCheckoutInput): Promise<{ url: string | null }> => {
  const { quoteId, premium, customerName, customerEmail } = input;

  try {
    console.log(`Creating Stripe Checkout for Quote ID: ${quoteId} with premium: ${premium} RWF`);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'rwf',
            product_data: {
              name: 'Ishimwe Insurance Policy',
              description: `Payment for Insurance Quote #${quoteId}`,
            },
            unit_amount: Math.round(premium),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `https://your-website.com/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://your-website.com/payment-cancelled`,
      metadata: {
        quoteId: quoteId,
      },
      customer_email: customerEmail,
    });

    console.log(`✅ Stripe Checkout Session created: ${session.id}`);
    return { url: session.url };

  } catch (error: any) {
    console.error('❌ Error creating Stripe Checkout Session:', error.message);
    throw new Error('Could not create payment session.');
  }
};

/**
 * Handles incoming webhook events from Stripe, with certificate generation and direct document delivery.
 */
export const handleStripeWebhook = async (rawBody: string | Buffer, sig: string): Promise<{ received: true }> => {
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET!);
    console.log(`🔔 Stripe Webhook Received: ${event.type}`);
  } catch (err: any) {
    console.error(`❌ Webhook signature verification failed:`, err.message);
    throw new Error('Webhook signature verification failed.');
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const quoteId = session.metadata?.quoteId;

    if (!quoteId) {
      console.error('❌ Critical Error: Webhook received without a quoteId in metadata.');
      return { received: true };
    }

    try {
      const quote = await prisma.quote.findUnique({
        where: { id: quoteId },
        include: {
          user: {
            select: {
              id: true,
              whatsappId: true,
              fullName: true,
            },
          },
        },
      });

      if (!quote || !quote.user || quote.status === 'paid') {
        console.log(`Webhook for quote ${quoteId} already processed or quote/user not found.`);
        return { received: true };
      }

      const updatedQuote = await prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'paid' },
      });
      console.log(`✅ Quote ID ${updatedQuote.id} successfully marked as 'paid'.`);

      const userWhatsappId = quote.user.whatsappId;
      if (userWhatsappId) {
        // --- Step 1: Send Immediate Confirmation (Your existing debug logs are here) ---
        console.log('DEBUG: Payment successful. Preparing to send notification.');
        console.log(`DEBUG: Found WhatsApp ID: ${userWhatsappId}. Proceeding to send message.`);
        const customerName = quote.user.fullName || 'there';
        const successMessage = `Thank you, ${customerName}! Your payment of ${quote.premium} RWF for quote #${quote.id.substring(0, 8)} was successful. We are now preparing your insurance certificate.`;
        
        console.log(`DEBUG: Message to be sent: "${successMessage}"`);
        await sendWhatsAppMessage(userWhatsappId, successMessage);
        
        const systemMessage = `Payment for quote ${quote.id} was successfully processed. Certificate generation initiated.`;
        await addSystemMessageToConversation(userWhatsappId, systemMessage);
        console.log('DEBUG: Notification logic block completed successfully.');

        // --- Step 2: Trigger PDF Generation and Direct Document Delivery ---
        try {
            console.log(`Starting certificate generation for quote ${quote.id}...`);
            const certificateUrl = await generateAndUploadCertificate(quote.id);
            
            // Use the new sendDocument function for a superior user experience.
            await sendDocument(
              userWhatsappId,
              certificateUrl,
              `Here is your official Insurance Certificate.`,
              `Insurance-Certificate-${quote.id.substring(0, 8)}.pdf`
            );
            console.log(`✅ Certificate document sent to user ${userWhatsappId}.`);

        } catch (certError) {
            console.error(`❌ FAILED to generate or send certificate for quote ${quote.id}:`, certError);
            await sendWhatsAppMessage(userWhatsappId, "We've confirmed your payment, but there was an issue generating your certificate. Our team has been notified and will send it to you manually shortly.");
        }

      } else {
        console.error(`DEBUG: SILENT FAILURE. Could not send notification because User with ID ${quote.user.id} has no whatsappId associated in the database.`);
      }
      
    } catch (dbError) {
      console.error(`❌ Error during webhook processing for quote ${quoteId}:`, dbError);
      throw new Error(`Processing error for quote ${quoteId}.`);
    }
  }

  return { received: true };
};
























































// // src/services/payment.service.ts

// import Stripe from 'stripe';
// import { prisma } from '../lib/prisma';
// import { config } from '../config';
// import { sendMessage as sendWhatsAppMessage } from './whatsapp.service';
// import { addSystemMessageToConversation } from './agent.service';
// // Import the new document service to trigger PDF generation
// import { generateAndUploadCertificate } from './document.service';

// // Initialize the Stripe client.
// const stripe = new Stripe(config.STRIPE_SECRET_KEY!, {
//   apiVersion: '2025-06-30.basil', // Using a stable, recommended API version
//   typescript: true,
// });

// interface CreateCheckoutInput {
//   quoteId: string;
//   premium: number;
//   customerName: string;
//   customerEmail?: string;
// }

// /**
//  * Creates a Stripe Checkout Session to collect payment from a user.
//  * (This function is unchanged)
//  */
// export const createStripeCheckoutSession = async (input: CreateCheckoutInput): Promise<{ url: string | null }> => {
//   const { quoteId, premium, customerName, customerEmail } = input;

//   try {
//     console.log(`Creating Stripe Checkout for Quote ID: ${quoteId} with premium: ${premium} RWF`);

//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ['card'],
//       line_items: [
//         {
//           price_data: {
//             currency: 'rwf',
//             product_data: {
//               name: 'Ishimwe Insurance Policy',
//               description: `Payment for Insurance Quote #${quoteId}`,
//             },
//             unit_amount: Math.round(premium),
//           },
//           quantity: 1,
//         },
//       ],
//       mode: 'payment',
//       success_url: `https://your-website.com/payment-success?session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url: `https://your-website.com/payment-cancelled`,
//       metadata: {
//         quoteId: quoteId,
//       },
//       customer_email: customerEmail,
//     });

//     console.log(`✅ Stripe Checkout Session created: ${session.id}`);
//     return { url: session.url };

//   } catch (error: any) {
//     console.error('❌ Error creating Stripe Checkout Session:', error.message);
//     throw new Error('Could not create payment session.');
//   }
// };

// /**
//  * Handles incoming webhook events from Stripe, now with PDF certificate generation.
//  */
// export const handleStripeWebhook = async (rawBody: string | Buffer, sig: string): Promise<{ received: true }> => {
//   let event: Stripe.Event;

//   try {
//     event = stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET!);
//     console.log(`🔔 Stripe Webhook Received: ${event.type}`);
//   } catch (err: any) {
//     console.error(`❌ Webhook signature verification failed:`, err.message);
//     throw new Error('Webhook signature verification failed.');
//   }

//   if (event.type === 'checkout.session.completed') {
//     const session = event.data.object as Stripe.Checkout.Session;
//     const quoteId = session.metadata?.quoteId;

//     if (!quoteId) {
//       console.error('❌ Critical Error: Webhook received without a quoteId in metadata.');
//       return { received: true };
//     }

//     try {
//       const quote = await prisma.quote.findUnique({
//         where: { id: quoteId },
//         include: {
//           user: {
//             select: {
//               id: true,
//               whatsappId: true,
//               fullName: true,
//             },
//           },
//         },
//       });

//       if (!quote || !quote.user || quote.status === 'paid') {
//         console.log(`Webhook for quote ${quoteId} already processed or quote/user not found.`);
//         return { received: true };
//       }

//       const updatedQuote = await prisma.quote.update({
//         where: { id: quoteId },
//         data: { status: 'paid' },
//       });
//       console.log(`✅ Quote ID ${updatedQuote.id} successfully marked as 'paid'.`);

//       const userWhatsappId = quote.user.whatsappId;
//       if (userWhatsappId) {
//         // --- Step 1: Send Immediate Confirmation ---
//         const customerName = quote.user.fullName || 'there';
//         const successMessage = `Thank you, ${customerName}! Your payment of ${quote.premium} RWF for quote #${quote.id.substring(0, 8)} was successful. We are now preparing your insurance certificate.`;
//         await sendWhatsAppMessage(userWhatsappId, successMessage);
        
//         const systemMessage = `Payment for quote ${quote.id} was successfully processed. Certificate generation initiated.`;
//         await addSystemMessageToConversation(userWhatsappId, systemMessage);
        
//         // --- Step 2: Trigger PDF Generation and Delivery ---
//         try {
//             console.log(`Starting certificate generation for quote ${quote.id}...`);
//             const certificateUrl = await generateAndUploadCertificate(quote.id);
//             const certificateMessage = `Here is your official Insurance Certificate: ${certificateUrl}`;
//             await sendWhatsAppMessage(userWhatsappId, certificateMessage);
//             console.log(`✅ Certificate link sent to user ${userWhatsappId}.`);
//         } catch (certError) {
//             console.error(`❌ FAILED to generate or send certificate for quote ${quote.id}:`, certError);
//             // Send a fallback message to the user if PDF generation fails
//             await sendWhatsAppMessage(userWhatsappId, "We've confirmed your payment, but there was an issue generating your certificate. Our team has been notified and will send it to you manually shortly.");
//         }

//       } else {
//         console.error(`SILENT FAILURE: Could not send notifications for quote ${quote.id} because user ${quote.user.id} has no whatsappId.`);
//       }
      
//     } catch (dbError) {
//       console.error(`❌ Error during webhook processing for quote ${quoteId}:`, dbError);
//       throw new Error(`Processing error for quote ${quoteId}.`);
//     }
//   }

//   return { received: true };
// };






































// // src/services/payment.service.ts

// import Stripe from 'stripe';
// import { prisma } from '../lib/prisma';
// import { config } from '../config';
// import { sendMessage as sendWhatsAppMessage } from './whatsapp.service';
// import { addSystemMessageToConversation } from './agent.service';

// // Initialize the Stripe client.
// const stripe = new Stripe(config.STRIPE_SECRET_KEY!, {
//   apiVersion: '2025-06-30.basil',
//   typescript: true,
// });

// interface CreateCheckoutInput {
//   quoteId: string;
//   premium: number;
//   customerName: string;
//   customerEmail?: string;
// }

// /**
//  * Creates a Stripe Checkout Session to collect payment from a user.
//  * (This function is unchanged)
//  */
// export const createStripeCheckoutSession = async (input: CreateCheckoutInput): Promise<{ url: string | null }> => {
//   const { quoteId, premium, customerName, customerEmail } = input;

//   try {
//     console.log(`Creating Stripe Checkout for Quote ID: ${quoteId} with premium: ${premium} RWF`);

//     const session = await stripe.checkout.sessions.create({
//       payment_method_types: ['card'],
//       line_items: [
//         {
//           price_data: {
//             currency: 'rwf',
//             product_data: {
//               name: 'Ishimwe Insurance Policy',
//               description: `Payment for Insurance Quote #${quoteId}`,
//             },
//             unit_amount: Math.round(premium),
//           },
//           quantity: 1,
//         },
//       ],
//       mode: 'payment',
//       success_url: `https://your-website.com/payment-success?session_id={CHECKOUT_SESSION_ID}`,
//       cancel_url: `https://your-website.com/payment-cancelled`,
//       metadata: {
//         quoteId: quoteId,
//       },
//       customer_email: customerEmail,
//     });

//     console.log(`✅ Stripe Checkout Session created: ${session.id}`);
//     return { url: session.url };

//   } catch (error: any) {
//     console.error('❌ Error creating Stripe Checkout Session:', error.message);
//     throw new Error('Could not create payment session.');
//   }
// };

// /**
//  * Handles incoming webhook events from Stripe, including proactive user notification.
//  */
// export const handleStripeWebhook = async (rawBody: string | Buffer, sig: string): Promise<{ received: true }> => {
//   let event: Stripe.Event;

//   try {
//     event = stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET!);
//     console.log(`🔔 Stripe Webhook Received: ${event.type}`);
//   } catch (err: any) {
//     console.error(`❌ Webhook signature verification failed:`, err.message);
//     throw new Error('Webhook signature verification failed.');
//   }

//   if (event.type === 'checkout.session.completed') {
//     const session = event.data.object as Stripe.Checkout.Session;
//     const quoteId = session.metadata?.quoteId;

//     if (!quoteId) {
//       console.error('❌ Critical Error: Webhook received without a quoteId in metadata.');
//       return { received: true };
//     }

//     try {
//       const quote = await prisma.quote.findUnique({
//         where: { id: quoteId },
//         include: {
//           user: {
//             select: {
//               id: true,
//               whatsappId: true,
//               fullName: true,
//             },
//           },
//         },
//       });

//       if (!quote || quote.status === 'paid') {
//         console.log(`Webhook for quote ${quoteId} already processed or quote not found. Acknowledging event.`);
//         return { received: true };
//       }

//       const updatedQuote = await prisma.quote.update({
//         where: { id: quoteId },
//         data: { status: 'paid' },
//       });
//       console.log(`✅ Quote ID ${updatedQuote.id} successfully marked as 'paid'.`);

//       // ===================================================================
//       // --- DEBUGGING & NOTIFICATION LOGIC ---
//       // ===================================================================
//       console.log('DEBUG: Payment successful. Preparing to send notification.');
//       const userWhatsappId = quote.user.whatsappId;

//       if (userWhatsappId) {
//         console.log(`DEBUG: Found WhatsApp ID: ${userWhatsappId}. Proceeding to send message.`);
//         const customerName = quote.user.fullName || 'there';
//         const successMessage = `Thank you, ${customerName}! Your payment of ${quote.premium} RWF for quote #${quote.id.substring(0, 8)} was successful. We are now preparing your insurance certificate.`;
        
//         console.log(`DEBUG: Message to be sent: "${successMessage}"`);

//         // Call the services
//         await sendWhatsAppMessage(userWhatsappId, successMessage);
//         const systemMessage = `Payment for quote ${quote.id} was successfully processed. The user has been notified.`;
//         await addSystemMessageToConversation(userWhatsappId, systemMessage);
        
//         console.log('DEBUG: Notification logic block completed successfully.');

//       } else {
//         // This log is CRITICAL. It will tell us if the user record is missing the WhatsApp ID.
//         console.error(`DEBUG: SILENT FAILURE. Could not send notification because User with ID ${quote.user.id} has no whatsappId associated in the database.`);
//       }
//       // ===================================================================
      
//     } catch (dbError) {
//       console.error(`❌ Error during webhook processing for quote ${quoteId}:`, dbError);
//       throw new Error(`Processing error for quote ${quoteId}.`);
//     }
//   }

//   return { received: true };
// };







































// // // src/services/payment.service.ts

// // import Stripe from 'stripe';
// // import { prisma } from '../lib/prisma';
// // import { config } from '../config';
// // // IMPORT our messaging and agent services to enable proactive notifications
// // import { sendMessage as sendWhatsAppMessage } from './whatsapp.service';
// // import { addSystemMessageToConversation } from './agent.service';

// // // Initialize the Stripe client with our secret key.
// // // Using a fixed, recent API version is recommended for production stability.
// // const stripe = new Stripe(config.STRIPE_SECRET_KEY!, {
// //   apiVersion: '2025-06-30.basil', // Updated to a stable, recommended version
// //   typescript: true,
// // });

// // interface CreateCheckoutInput {
// //   quoteId: string;
// //   premium: number;
// //   customerName: string;
// //   customerEmail?: string;
// // }

// // /**
// //  * Creates a Stripe Checkout Session to collect payment from a user.
// //  * (This function is unchanged)
// //  */
// // export const createStripeCheckoutSession = async (input: CreateCheckoutInput): Promise<{ url: string | null }> => {
// //   const { quoteId, premium, customerName, customerEmail } = input;

// //   try {
// //     console.log(`Creating Stripe Checkout for Quote ID: ${quoteId} with premium: ${premium} RWF`);

// //     const session = await stripe.checkout.sessions.create({
// //       payment_method_types: ['card'],
// //       line_items: [
// //         {
// //           price_data: {
// //             currency: 'rwf',
// //             product_data: {
// //               name: 'Ishimwe Insurance Policy',
// //               description: `Payment for Insurance Quote #${quoteId}`,
// //             },
// //             unit_amount: Math.round(premium),
// //           },
// //           quantity: 1,
// //         },
// //       ],
// //       mode: 'payment',
// //       success_url: `https://your-website.com/payment-success?session_id={CHECKOUT_SESSION_ID}`,
// //       cancel_url: `https://your-website.com/payment-cancelled`,
// //       metadata: {
// //         quoteId: quoteId,
// //       },
// //       customer_email: customerEmail,
// //     });

// //     console.log(`✅ Stripe Checkout Session created: ${session.id}`);
// //     return { url: session.url };

// //   } catch (error: any) {
// //     console.error('❌ Error creating Stripe Checkout Session:', error.message);
// //     throw new Error('Could not create payment session.');
// //   }
// // };


// // /**
// //  * Handles incoming webhook events from Stripe, verifying their authenticity before processing.
// //  * This function now includes logic to proactively notify the user upon successful payment.
// //  */
// // export const handleStripeWebhook = async (rawBody: string | Buffer, sig: string): Promise<{ received: true }> => {
// //   let event: Stripe.Event;

// //   try {
// //     event = stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET!);
// //     console.log(`🔔 Stripe Webhook Received: ${event.type}`);
// //   } catch (err: any) {
// //     console.error(`❌ Webhook signature verification failed:`, err.message);
// //     throw new Error('Webhook signature verification failed.');
// //   }

// //   // Handle the specific 'checkout.session.completed' event.
// //   if (event.type === 'checkout.session.completed') {
// //     const session = event.data.object as Stripe.Checkout.Session;
// //     const quoteId = session.metadata?.quoteId;

// //     if (!quoteId) {
// //       console.error('❌ Critical Error: Webhook received without a quoteId in metadata.');
// //       return { received: true };
// //     }

// //     try {
// //       // 1. Find the quote AND the associated user details in one efficient query.
// //       const quote = await prisma.quote.findUnique({
// //         where: { id: quoteId },
// //         include: {
// //           user: {
// //             select: {
// //               id: true,
// //               whatsappId: true,
// //               fullName: true,
// //             },
// //           },
// //         },
// //       });
      
// //       // 2. Idempotency Check: If the quote isn't found or is already paid, stop processing.
// //       // This prevents re-processing if Stripe sends the same event multiple times.
// //       if (!quote || quote.status === 'paid') {
// //         console.log(`Webhook for quote ${quoteId} already processed or quote not found. Acknowledging event.`);
// //         return { received: true };
// //       }

// //       // 3. Update the quote status in our database to 'paid'.
// //       const updatedQuote = await prisma.quote.update({
// //         where: { id: quoteId },
// //         data: { status: 'paid' },
// //       });
// //       console.log(`✅ Quote ID ${updatedQuote.id} successfully marked as 'paid'.`);

// //       // ===================================================================
// //       // --- NEW LOGIC: PROACTIVE NOTIFICATION ---
// //       // ===================================================================
// //       const userWhatsappId = quote.user.whatsappId;
// //       if (userWhatsappId) {
// //         // A. Send a confirmation message directly to the user on WhatsApp.
// //         const customerName = quote.user.fullName || 'there'; // Use a fallback name
// //         const successMessage = `Thank you, ${customerName}! Your payment of ${quote.premium} RWF for quote #${quote.id.substring(0, 8)} was successful. We are now preparing your insurance certificate.`;
// //         await sendWhatsAppMessage(userWhatsappId, successMessage);

// //         // B. Add a system message to the conversation history for future AI context.
// //         const systemMessage = `Payment for quote ${quote.id} was successfully processed. The user has been notified.`;
// //         await addSystemMessageToConversation(userWhatsappId, systemMessage);
// //       }
// //       // ===================================================================
      
// //     } catch (dbError) {
// //       console.error(`❌ Database error while processing quote ${quoteId}:`, dbError);
// //       throw new Error(`Database error for quote ${quoteId}.`);
// //     }
// //   }

// //   // 4. Acknowledge receipt of any other event types without processing them.
// //   return { received: true };
// // };















































// // // // src/services/payment.service.ts

// // // import Stripe from 'stripe';
// // // import { prisma } from '../lib/prisma';
// // // import { config } from '../config';

// // // // Initialize the Stripe client with our secret key.
// // // // Pinning the API version ensures that future Stripe API updates won't break our integration.
// // // const stripe = new Stripe(config.STRIPE_SECRET_KEY!, {
// // //   apiVersion: '2025-06-30.basil',
// // //   typescript: true, // Enable TypeScript support
// // // });

// // // interface CreateCheckoutInput {
// // //   quoteId: string;
// // //   premium: number;
// // //   customerName: string;
// // //   customerEmail?: string; // Optional customer email
// // // }

// // // /**
// // //  * Creates a Stripe Checkout Session to collect payment from a user.
// // //  *
// // //  * @param input - Contains the quote ID, premium amount, and customer details.
// // //  * @returns An object containing the URL for the created Stripe Checkout Session.
// // //  */
// // // export const createStripeCheckoutSession = async (input: CreateCheckoutInput): Promise<{ url: string | null }> => {
// // //   const { quoteId, premium, customerName, customerEmail } = input;

// // //   try {
// // //     console.log(`Creating Stripe Checkout for Quote ID: ${quoteId} with premium: ${premium} RWF`);

// // //     const session = await stripe.checkout.sessions.create({
// // //       payment_method_types: ['card'],
// // //       line_items: [
// // //         {
// // //           price_data: {
// // //             currency: 'rwf', // Using RWF as per our business rule.
// // //             product_data: {
// // //               name: 'Ishimwe Insurance Policy',
// // //               description: `Payment for Insurance Quote #${quoteId}`,
// // //             },
// // //             // Stripe requires the amount in the smallest currency unit.
// // //             // RWF has no subunits (like cents), so we can pass the integer amount directly.
// // //             unit_amount: Math.round(premium),
// // //           },
// // //           quantity: 1,
// // //         },
// // //       ],
// // //       mode: 'payment',
// // //       // These are placeholder URLs. In a real application, you would point these to
// // //       // your actual frontend success and cancellation pages.
// // //       success_url: `https://your-website.com/payment-success?session_id={CHECKOUT_SESSION_ID}`,
// // //       cancel_url: `https://your-website.com/payment-cancelled`,
      
// // //       // IMPORTANT: Pass our internal IDs through Stripe's metadata.
// // //       // This is the critical link between the Stripe transaction and our database.
// // //       metadata: {
// // //         quoteId: quoteId,
// // //       },

// // //       // Pre-fill customer details in the checkout form if available.
// // //       customer_email: customerEmail,
// // //     });

// // //     console.log(`✅ Stripe Checkout Session created: ${session.id}`);
// // //     return { url: session.url };

// // //   } catch (error: any) {
// // //     console.error('❌ Error creating Stripe Checkout Session:', error.message);
// // //     throw new Error('Could not create payment session.');
// // //   }
// // // };


// // // /**
// // //  * Handles incoming webhook events from Stripe, verifying their authenticity before processing.
// // //  *
// // //  * @param rawBody - The raw request body as a Buffer or string.
// // //  * @param sig - The 'stripe-signature' header from the request.
// // //  * @returns An object indicating the result of the handling.
// // //  */
// // // export const handleStripeWebhook = async (rawBody: string | Buffer, sig: string): Promise<{ received: true }> => {
// // //   let event: Stripe.Event;

// // //   try {
// // //     // 1. Securely verify the event is genuinely from Stripe using the webhook signing secret.
// // //     // This MUST use the raw request body, not the parsed JSON object.
// // //     event = stripe.webhooks.constructEvent(rawBody, sig, config.STRIPE_WEBHOOK_SECRET!);
// // //     console.log(`🔔 Stripe Webhook Received: ${event.type}`);
// // //   } catch (err: any) {
// // //     console.error(`❌ Webhook signature verification failed:`, err.message);
// // //     // If verification fails, we throw an error. The controller will catch this
// // //     // and send a 400 Bad Request response, telling Stripe not to retry.
// // //     throw new Error('Webhook signature verification failed.');
// // //   }

// // //   // 2. Handle the specific 'checkout.session.completed' event.
// // //   // We only care about this event, which confirms a successful payment.
// // //   if (event.type === 'checkout.session.completed') {
// // //     const session = event.data.object as Stripe.Checkout.Session;
// // //     const quoteId = session.metadata?.quoteId;

// // //     if (!quoteId) {
// // //       console.error('❌ Critical Error: Webhook received for completed session without a quoteId in metadata.');
// // //       // We still return successfully to prevent Stripe from retrying this malformed event.
// // //       return { received: true };
// // //     }

// // //     try {
// // //       // 3. Update the quote status in our database to 'paid'.
// // //       const updatedQuote = await prisma.quote.update({
// // //         where: { id: quoteId },
// // //         data: { status: 'paid' },
// // //       });

// // //       console.log(`✅ Quote ID ${updatedQuote.id} successfully marked as 'paid'.`);

// // //       // TODO: This is the perfect place to trigger the next step in our business logic,
// // //       // such as generating and sending the final insurance certificate PDF.
// // //       // e.g., await generateCertificatePdf(updatedQuote.id);
      
// // //     } catch (dbError) {
// // //       console.error(`❌ Database error while updating quote ${quoteId}:`, dbError);
// // //       // If the database update fails, we throw an error. This will cause our controller
// // //       // to send a non-200 response to Stripe, and Stripe WILL attempt to send the
// // //       // webhook again later, giving our database a chance to recover.
// // //       throw new Error(`Database error for quote ${quoteId}.`);
// // //     }
// // //   }

// // //   // 4. Acknowledge receipt of any other event types without processing them.
// // //   return { received: true };
// // // };
