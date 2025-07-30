import { Request, Response } from 'express';
import { config } from '../config';
import { processMessage } from '../services/agent.service';

/**
 * Handles the webhook verification GET request from Meta.
 * This is a one-time setup step. Meta sends a challenge token, and we must
 * respond with it to prove we own this endpoint.
 */
export const verifyWebhook = (req: Request, res: Response): void => {
  // Your verify token must match the one you set in the Meta for Developers App Dashboard.
  const verifyToken = config.WHATSAPP_VERIFY_TOKEN;

  // Parse params from the webhook verification request.
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if a token and mode were sent.
  if (mode && token) {
    // Check the mode and token sent are correct.
    if (mode === 'subscribe' && token === verifyToken) {
      // Respond with 200 OK and the challenge token from the request.
      console.log('✅ Webhook verified successfully!');
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match.
      console.error('❌ Webhook verification failed: Tokens do not match.');
      res.sendStatus(403);
    }
  } else {
    // Responds with '400 Bad Request' if mode or token is missing.
    console.error('❌ Webhook verification failed: Missing mode or token.');
    res.sendStatus(400);
  }
};

/**
 * Handles all incoming POST requests from the WhatsApp webhook.
 * This includes messages, status updates, etc.
 */
export const handleIncomingMessage = async (req: Request, res: Response): Promise<void> => {
  // First, immediately send a 200 OK response back to WhatsApp.
  // This acknowledges receipt of the event and prevents Meta from re-sending it.
  // The actual processing of the message happens asynchronously after this.
  res.sendStatus(200);

  const body = req.body;

  // For debugging, it's very useful to see the full payload from Meta.
  // console.log(JSON.stringify(body, null, 2));

  try {
    // Check if it's a valid WhatsApp message payload.
    if (body.object === 'whatsapp_business_account') {
      // The payload can contain multiple entries, so we iterate through them.
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          // We are only interested in changes that contain new messages.
          if (change.value.messages) {
            for (const message of change.value.messages) {
              // We are only equipped to handle text messages for now.
              // Future enhancements could handle images, documents, audio, etc.
              if (message.type === 'text') {
                const userWhatsappId = message.from; // User's WhatsApp ID (phone number).
                const userMessageText = message.text.body;

                console.log(`📩 Message from ${userWhatsappId}: "${userMessageText}"`);

                // Hand off the validated message to our core agent service for processing.
                // We use 'await' to ensure processing completes but don't need the return value here.
                await processMessage(userWhatsappId, userMessageText);
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('❌ Error in handleIncomingMessage:', error);
    // The error is logged on the server. We've already sent a 200 OK,
    // so we can't send another response to the client here.
    // The agent.service is responsible for sending an error message to the user if needed.
  }
};


















































// import { Request, Response } from 'express';
// import { config } from '../config';
// import { processMessage } from '../services/agent.service'; // We will create this service function

// /**
//  * Handles the webhook verification GET request from Meta.
//  */
// export const verifyWebhook = (req: Request, res: Response) => {
//   // Your verify token must match the one you set in the Meta App Dashboard
//   const verifyToken = config.WHATSAPP_VERIFY_TOKEN;

//   // Parse params from the webhook verification request
//   const mode = req.query['hub.mode'];
//   const token = req.query['hub.verify_token'];
//   const challenge = req.query['hub.challenge'];

//   // Check if a token and mode were sent
//   if (mode && token) {
//     // Check the mode and token sent are correct
//     if (mode === 'subscribe' && token === verifyToken) {
//       // Respond with 200 OK and challenge token from the request
//       console.log('✅ Webhook verified successfully!');
//       res.status(200).send(challenge);
//     } else {
//       // Responds with '403 Forbidden' if verify tokens do not match
//       console.error('❌ Webhook verification failed: Tokens do not match.');
//       res.sendStatus(403);
//     }
//   } else {
//     // Responds with '400 Bad Request' if mode or token is missing
//     console.error('❌ Webhook verification failed: Missing mode or token.');
//     res.sendStatus(400);
//   }
// };

// /**
//  * Handles incoming messages from WhatsApp users.
//  */
// export const handleIncomingMessage = async (req: Request, res: Response) => {
//   // It's good practice to send a 200 OK response back to WhatsApp quickly
//   res.sendStatus(200);

//   const body = req.body;

//   // You can log the entire payload for debugging purposes
//   // console.log(JSON.stringify(body, null, 2));

//   // Check if it's a valid WhatsApp message payload
//   if (body.object === 'whatsapp_business_account' && body.entry && body.entry[0].changes) {
//     for (const change of body.entry[0].changes) {
//       if (change.value.messages) {
//         const message = change.value.messages[0];

//         // We only process text messages for now
//         if (message.type === 'text') {
//           const from = message.from; // User's WhatsApp ID (phone number)
//           const text = message.text.body;

//           console.log(`📩 Message from ${from}: "${text}"`);

//           // Hand off the message to our agent service for processing
//           await processMessage(from, text);
//         }
//       }
//     }
//   }
// };
