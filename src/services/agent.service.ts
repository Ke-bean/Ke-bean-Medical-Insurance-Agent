// src/services/agent.service.ts

import { PrismaClient } from '@prisma/client';
import {
  GoogleGenerativeAI,
  Content,
  FunctionDeclaration,
  Tool,
  SchemaType,
} from '@google/generative-ai';
import { config } from '../config';
import { sendMessage as sendWhatsAppMessage } from './whatsapp.service';
import { systemInstruction, trustAndSafetyPrompt } from './persona.service';
import { calculatePremium } from './premium.service';
import { createStripeCheckoutSession } from './payment.service';

// --- TYPE DEFINITIONS FOR OUR TOOL ARGUMENTS ---
interface CalculatePremiumArgs {
  insuranceType: 'motor' | 'travel' | 'health';
  details: Record<string, any>;
}

interface GeneratePaymentLinkArgs {
  insuranceType: 'motor' | 'travel' | 'health';
  premium: number;
  customerName: string;
  details: Record<string, any>;
}

// --- TOOL AND MODEL SETUP ---
const functionDeclarations: FunctionDeclaration[] = [
  {
    name: 'calculate_premium',
    description: 'Calculates the insurance premium based on the type of insurance and user-provided details.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        insuranceType: {
          type: SchemaType.STRING,
          enum: ['motor', 'travel', 'health'],
          description: 'The type of insurance.',
          format: 'enum',
        },
        details: {
          type: SchemaType.OBJECT,
          description: 'An object containing all the details collected from the user, like age, car type, etc.',
          properties: {},
        },
      },
      required: ['insuranceType', 'details'],
    },
  },
  {
    name: 'generate_payment_link',
    description: "Generates a Stripe payment link when the user agrees to a quote. Creates a quote record in the database before generating the link.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        insuranceType: {
          type: SchemaType.STRING,
          enum: ['motor', 'travel', 'health'],
          description: "The type of insurance being quoted, e.g., 'motor'.",
          format: 'enum',
        },
        premium: {
          type: SchemaType.NUMBER,
          description: 'The premium amount in RWF to be charged.',
        },
        customerName: {
          type: SchemaType.STRING,
          description: 'The full name of the customer.',
        },
        details: {
          type: SchemaType.OBJECT,
          description: 'The same details object that was used for the premium calculation.',
          properties: {},
        },
      },
      required: ['insuranceType', 'premium', 'customerName', 'details'],
    },
  },
];

const tools: Tool[] = [{ functionDeclarations }];
const genAI = new GoogleGenerativeAI(config.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({
  model: 'gemini-2.0-flash', // Updated to the latest stable model for best performance
  systemInstruction: systemInstruction,
  tools: tools,
});

// --- MAIN MESSAGE PROCESSING FUNCTION ---
export const processMessage = async (whatsappId: string, userMessage: string) => {
  try {
    const { prisma } = await import('../lib/prisma');
    
    const { user, conversation } = await findOrCreateUserAndConversation(prisma, whatsappId);
    
    const chatHistory = conversation.history as unknown as Content[];
    const dynamicHistory = await injectDynamicInstructions(prisma, chatHistory, userMessage);
    
    const chat = model.startChat({ history: dynamicHistory });

    const result = await chat.sendMessage(userMessage);
    const response = result.response;
    let aiResponseText = response.text();

    const functionCalls = response.functionCalls();
    if (functionCalls && functionCalls.length > 0) {
      const call = functionCalls[0];
      console.log('🤖 AI wants to call a tool:', call.name);
      
      let toolResult: any;

      if (call.name === 'calculate_premium') {
        const args = call.args as CalculatePremiumArgs;
        toolResult = await calculatePremium({
            insuranceType: args.insuranceType,
            details: args.details
        });

      } else if (call.name === 'generate_payment_link') {
        const args = call.args as GeneratePaymentLinkArgs;
        
        // ===================================================================
        // --- NEW LOGIC: SAVE THE USER'S FULL NAME TO THEIR PROFILE ---
        // This ensures the name is available for later use (e.g., certificate).
        console.log(`Updating user profile for ${whatsappId} with name: ${args.customerName}`);
        await prisma.user.update({
            where: { id: user.id },
            data: { fullName: args.customerName },
        });
        // ===================================================================

        console.log(`📝 Creating quote record in DB for ${args.customerName}...`);
        const product = await prisma.insuranceProduct.findUnique({ where: { type: args.insuranceType } });
        if (!product) throw new Error(`Product type ${args.insuranceType} not found.`);

        const newQuote = await prisma.quote.create({
          data: {
            userId: user.id,
            insuranceProductId: product.id,
            type: args.insuranceType,
            status: 'quoted',
            premium: args.premium,
            details: args.details,
          },
        });
        console.log(`✅ Quote record created with ID: ${newQuote.id}`);

        toolResult = await createStripeCheckoutSession({
          quoteId: newQuote.id,
          premium: newQuote.premium,
          customerName: args.customerName,
        });

      } else {
        console.warn(`Unknown function call requested: ${call.name}`);
        toolResult = { error: 'Unknown function' };
      }

      const toolResponseResult = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
      aiResponseText = toolResponseResult.response.text();
      console.log('🤖 AI Response after tool call:', aiResponseText);
    }

    const updatedHistory = await chat.getHistory();
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { history: updatedHistory as unknown as any },
    });

    const finalMessage = applyBusinessLogic(aiResponseText);
    await sendWhatsAppMessage(whatsappId, finalMessage);
    
  } catch (error) {
    console.error('❌ Error in agent.service:', error);
    await sendWhatsAppMessage(whatsappId, "I'm sorry, I encountered an unexpected error. Could we please try that again?");
  }
};

// --- HELPER FUNCTIONS (Refactored for Dependency Injection) ---

async function injectDynamicInstructions(prisma: PrismaClient, history: Content[], userMessage: string): Promise<Content[]> {
    const lowerCaseMessage = userMessage.toLowerCase();
    if (history.length <= 2 && (lowerCaseMessage.includes('motor') || lowerCaseMessage.includes('car'))) {
        const motorProduct = await prisma.insuranceProduct.findUnique({ where: { type: 'motor' } });
        if (motorProduct) {
            const requiredInputs = JSON.stringify(motorProduct.requiredInputs);
            const instruction: Content = {
                role: 'model',
                parts: [{ text: `(System Instruction: The user wants motor insurance. Your goal is to collect the following pieces of information, asking one question at a time: ${requiredInputs}. Once you have all required information, call the 'calculate_premium' tool.)` }]
            };
            return [history[0], instruction, ...history.slice(1)];
        }
    }
    return history;
}

async function findOrCreateUserAndConversation(prisma: PrismaClient, whatsappId: string) {
  let user = await prisma.user.findUnique({ where: { whatsappId } });
  if (!user) { user = await prisma.user.create({ data: { whatsappId } }) }

  let conversation = await prisma.conversation.findUnique({ where: { userId: user.id } });
  if (!conversation) { conversation = await prisma.conversation.create({ data: { userId: user.id, history: [] } }) }

  return { user, conversation };
}

function applyBusinessLogic(responseText: string): string {
  let finalMessage = responseText;
  if (responseText.toLowerCase().includes('premium is')) {
    finalMessage += `\n\n*Note: This quote is based on the details you provided and our standard underwriting rules.*`;
  }
  if (responseText.toLowerCase().includes("i cannot help")) {
    return trustAndSafetyPrompt;
  }
  return finalMessage;
}

export const addSystemMessageToConversation = async (whatsappId: string, systemText: string) => {
  try {
    const { prisma } = await import('../lib/prisma');
    const { conversation } = await findOrCreateUserAndConversation(prisma, whatsappId);
    
    const currentHistory = conversation.history as unknown as Content[];
    const systemMessage: Content = {
      role: 'model',
      parts: [{ text: `(System Note: ${systemText})` }],
    };
    const updatedHistory = [...currentHistory, systemMessage];
    
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { history: updatedHistory as unknown as any },
    });
    console.log(`📝 System message added to conversation for ${whatsappId}.`);
  } catch (error) {
    console.error(`❌ Error adding system message for ${whatsappId}:`, error);
  }
};

































































// import { PrismaClient } from '@prisma/client'; // Import the TYPE for dependency injection
// import {
//   GoogleGenerativeAI,
//   Content,
//   FunctionDeclaration,
//   Tool,
//   SchemaType,
// } from '@google/generative-ai';
// import { config } from '../config';
// import { sendMessage as sendWhatsAppMessage } from './whatsapp.service';
// import { systemInstruction, trustAndSafetyPrompt } from './persona.service';
// import { calculatePremium } from './premium.service';
// import { createStripeCheckoutSession } from './payment.service';

// // --- TYPE DEFINITIONS FOR OUR TOOL ARGUMENTS ---
// interface CalculatePremiumArgs {
//   insuranceType: 'motor' | 'travel' | 'health';
//   details: Record<string, any>;
// }

// interface GeneratePaymentLinkArgs {
//   insuranceType: 'motor' | 'travel' | 'health';
//   premium: number;
//   customerName: string;
//   details: Record<string, any>;
// }

// // --- TOOL AND MODEL SETUP ---
// const functionDeclarations: FunctionDeclaration[] = [
//   {
//     name: 'calculate_premium',
//     description: 'Calculates the insurance premium based on the type of insurance and user-provided details.',
//     parameters: {
//       type: SchemaType.OBJECT,
//       properties: {
//         insuranceType: {
//           type: SchemaType.STRING,
//           enum: ['motor', 'travel', 'health'],
//           description: 'The type of insurance.',
//           format: 'enum',
//         },
//         details: {
//           type: SchemaType.OBJECT,
//           description: 'An object containing all the details collected from the user, like age, car type, etc.',
//           properties: {},
//         },
//       },
//       required: ['insuranceType', 'details'],
//     },
//   },
//   {
//     name: 'generate_payment_link',
//     description: "Generates a Stripe payment link when the user agrees to a quote. Creates a quote record in the database before generating the link.",
//     parameters: {
//       type: SchemaType.OBJECT,
//       properties: {
//         insuranceType: {
//           type: SchemaType.STRING,
//           enum: ['motor', 'travel', 'health'],
//           description: "The type of insurance being quoted, e.g., 'motor'.",
//           format: 'enum',
//         },
//         premium: {
//           type: SchemaType.NUMBER,
//           description: 'The premium amount in RWF to be charged.',
//         },
//         customerName: {
//           type: SchemaType.STRING,
//           description: 'The full name of the customer.',
//         },
//         details: {
//           type: SchemaType.OBJECT,
//           description: 'The same details object that was used for the premium calculation.',
//           properties: {},
//         },
//       },
//       required: ['insuranceType', 'premium', 'customerName', 'details'],
//     },
//   },
// ];

// const tools: Tool[] = [{ functionDeclarations }];
// const genAI = new GoogleGenerativeAI(config.GOOGLE_API_KEY!);
// const model = genAI.getGenerativeModel({
//   model: 'gemini-2.0-flash',
//   systemInstruction: systemInstruction,
//   tools: tools,
// });

// // --- MAIN MESSAGE PROCESSING FUNCTION ---
// export const processMessage = async (whatsappId: string, userMessage: string) => {
//   try {
//     // Import prisma dynamically ONCE at the start of the process.
//     const { prisma } = await import('../lib/prisma');
    
//     // Pass the initialized prisma instance to all helpers that need it.
//     const { user, conversation } = await findOrCreateUserAndConversation(prisma, whatsappId);
    
//     const chatHistory = conversation.history as unknown as Content[];
//     const dynamicHistory = await injectDynamicInstructions(prisma, chatHistory, userMessage);
    
//     const chat = model.startChat({ history: dynamicHistory });

//     const result = await chat.sendMessage(userMessage);
//     const response = result.response;
//     let aiResponseText = response.text();

//     const functionCalls = response.functionCalls();
//     if (functionCalls && functionCalls.length > 0) {
//       const call = functionCalls[0];
//       console.log('🤖 AI wants to call a tool:', call.name);
      
//       let toolResult: any;

//    if (call.name === 'calculate_premium') {
//         const args = call.args as CalculatePremiumArgs;
        
//         // ===================================================================
//         // THE FIX IS HERE: Call the function with a single argument, as it's defined.
//         toolResult = await calculatePremium({
//             insuranceType: args.insuranceType,
//             details: args.details
//         });

//       } else if (call.name === 'generate_payment_link') {
//         const args = call.args as GeneratePaymentLinkArgs;

//         console.log(`📝 Creating quote record in DB for ${args.customerName}...`);
//         const product = await prisma.insuranceProduct.findUnique({ where: { type: args.insuranceType } });
//         if (!product) throw new Error(`Product type ${args.insuranceType} not found.`);

//         const newQuote = await prisma.quote.create({
//           data: {
//             userId: user.id,
//             insuranceProductId: product.id,
//             type: args.insuranceType,
//             status: 'quoted',
//             premium: args.premium,
//             details: args.details,
//           },
//         });
//         console.log(`✅ Quote record created with ID: ${newQuote.id}`);

//         toolResult = await createStripeCheckoutSession({
//           quoteId: newQuote.id,
//           premium: newQuote.premium,
//           customerName: args.customerName,
//         });

//       } else {
//         console.warn(`Unknown function call requested: ${call.name}`);
//         toolResult = { error: 'Unknown function' };
//       }

//       const toolResponseResult = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
//       aiResponseText = toolResponseResult.response.text();
//       console.log('🤖 AI Response after tool call:', aiResponseText);
//     }

//     const updatedHistory = await chat.getHistory();
//     await prisma.conversation.update({
//       where: { id: conversation.id },
//       data: { history: updatedHistory as unknown as any },
//     });

//     const finalMessage = applyBusinessLogic(aiResponseText);
//     await sendWhatsAppMessage(whatsappId, finalMessage);
    
//   } catch (error) {
//     console.error('❌ Error in agent.service:', error);
//     await sendWhatsAppMessage(whatsappId, "I'm sorry, I encountered an unexpected error. Could we please try that again?");
//   }
// };

// // --- HELPER FUNCTIONS (Refactored for Dependency Injection) ---

// async function injectDynamicInstructions(prisma: PrismaClient, history: Content[], userMessage: string): Promise<Content[]> {
//     const lowerCaseMessage = userMessage.toLowerCase();
//     // Only inject instructions at the very beginning of a conversation.
//     if (history.length <= 2 && (lowerCaseMessage.includes('motor') || lowerCaseMessage.includes('car'))) {
//         const motorProduct = await prisma.insuranceProduct.findUnique({ where: { type: 'motor' } });
//         if (motorProduct) {
//             const requiredInputs = JSON.stringify(motorProduct.requiredInputs);
//             const instruction: Content = {
//                 role: 'model',
//                 parts: [{ text: `(System Instruction: The user wants motor insurance. Your goal is to collect the following pieces of information, asking one question at a time: ${requiredInputs}. Once you have all required information, call the 'calculate_premium' tool.)` }]
//             };
//             // Inject the instruction into the history to guide the next AI response.
//             return [history[0], instruction, ...history.slice(1)];
//         }
//     }
//     return history;
// }

// async function findOrCreateUserAndConversation(prisma: PrismaClient, whatsappId: string) {
//   let user = await prisma.user.findUnique({ where: { whatsappId } });
//   if (!user) { user = await prisma.user.create({ data: { whatsappId } }) }

//   let conversation = await prisma.conversation.findUnique({ where: { userId: user.id } });
//   if (!conversation) { conversation = await prisma.conversation.create({ data: { userId: user.id, history: [] } }) }

//   return { user, conversation };
// }

// function applyBusinessLogic(responseText: string): string {
//   let finalMessage = responseText;
//   if (responseText.toLowerCase().includes('premium is')) {
//     finalMessage += `\n\n*Note: This quote is based on the details you provided and our standard underwriting rules.*`;
//   }
//   if (responseText.toLowerCase().includes("i cannot help")) {
//     return trustAndSafetyPrompt;
//   }
//   return finalMessage;
// }

// export const addSystemMessageToConversation = async (whatsappId: string, systemText: string) => {
//   try {
//     const { prisma } = await import('../lib/prisma');
//     // Pass the prisma instance to the helper to maintain the pattern.
//     const { conversation } = await findOrCreateUserAndConversation(prisma, whatsappId);
    
//     const currentHistory = conversation.history as unknown as Content[];
//     const systemMessage: Content = {
//       role: 'model',
//       parts: [{ text: `(System Note: ${systemText})` }],
//     };
//     const updatedHistory = [...currentHistory, systemMessage];
    
//     await prisma.conversation.update({
//       where: { id: conversation.id },
//       data: { history: updatedHistory as unknown as any },
//     });
//     console.log(`📝 System message added to conversation for ${whatsappId}.`);
//   } catch (error) {
//     console.error(`❌ Error adding system message for ${whatsappId}:`, error);
//   }
// };






























// // // src/services/agent.service.ts

// // // We REMOVE the top-level prisma import to prevent build-time/initialization race conditions.
// // import {
// //   GoogleGenerativeAI,
// //   Content,
// //   FunctionDeclaration,
// //   Tool,
// //   SchemaType,
// // } from '@google/generative-ai';
// // import { config } from '../config';
// // import { sendMessage as sendWhatsAppMessage } from './whatsapp.service';
// // import { systemInstruction, trustAndSafetyPrompt } from './persona.service';
// // import { calculatePremium } from './premium.service';
// // import { createStripeCheckoutSession } from './payment.service';

// // // --- TYPE DEFINITIONS FOR OUR TOOL ARGUMENTS ---
// // interface CalculatePremiumArgs {
// //   insuranceType: 'motor' | 'travel' | 'health';
// //   details: Record<string, any>;
// // }

// // interface GeneratePaymentLinkArgs {
// //   insuranceType: 'motor' | 'travel' | 'health';
// //   premium: number;
// //   customerName: string;
// //   details: Record<string, any>;
// // }

// // // --- 1. DEFINE ALL AVAILABLE TOOLS FOR THE AGENT ---
// // const functionDeclarations: FunctionDeclaration[] = [
// //   {
// //     name: 'calculate_premium',
// //     description: 'Calculates the insurance premium based on the type of insurance and user-provided details.',
// //     parameters: {
// //       type: SchemaType.OBJECT,
// //       properties: {
// //         insuranceType: {
// //           type: SchemaType.STRING,
// //           enum: ['motor', 'travel', 'health'],
// //           description: 'The type of insurance.',
// //           format: 'enum',
// //         },
// //         details: {
// //           type: SchemaType.OBJECT,
// //           description: 'An object containing all the details collected from the user, like age, car type, etc.',
// //           properties: {},
// //         },
// //       },
// //       required: ['insuranceType', 'details'],
// //     },
// //   },
// //   {
// //     name: 'generate_payment_link',
// //     description: "Generates a Stripe payment link when the user agrees to a quote. Creates a quote record in the database before generating the link.",
// //     parameters: {
// //       type: SchemaType.OBJECT,
// //       properties: {
// //         insuranceType: {
// //           type: SchemaType.STRING,
// //           enum: ['motor', 'travel', 'health'],
// //           description: "The type of insurance being quoted, e.g., 'motor'.",
// //           format: 'enum',
// //         },
// //         premium: {
// //           type: SchemaType.NUMBER,
// //           description: 'The premium amount in RWF to be charged.',
// //         },
// //         customerName: {
// //           type: SchemaType.STRING,
// //           description: 'The full name of the customer.',
// //         },
// //         details: {
// //           type: SchemaType.OBJECT,
// //           description: 'The same details object that was used for the premium calculation.',
// //           properties: {},
// //         },
// //       },
// //       required: ['insuranceType', 'premium', 'customerName', 'details'],
// //     },
// //   },
// // ];

// // // --- 2. WRAP DECLARATIONS IN A TOOL OBJECT ---
// // const tools: Tool[] = [{ functionDeclarations }];

// // // --- 3. SETUP THE GEMINI MODEL WITH TOOLS ---
// // const genAI = new GoogleGenerativeAI(config.GOOGLE_API_KEY!);
// // const model = genAI.getGenerativeModel({
// //   model: 'gemini-1.5-pro-latest',
// //   systemInstruction: systemInstruction,
// //   tools: tools,
// // });

// // // --- 4. THE MAIN MESSAGE PROCESSING FUNCTION ---
// // export const processMessage = async (whatsappId: string, userMessage: string) => {
// //   try {
// //     const { prisma } = await import('../lib/prisma'); // DYNAMIC IMPORT
// //     const { user, conversation } = await findOrCreateUserAndConversation(whatsappId);
    
// //     const chatHistory = conversation.history as unknown as Content[];
// //     const dynamicHistory = await injectDynamicInstructions(chatHistory, userMessage);
    
// //     const chat = model.startChat({ history: dynamicHistory });

// //     const result = await chat.sendMessage(userMessage);
// //     const response = result.response;
// //     let aiResponseText = response.text();

// //     const functionCalls = response.functionCalls();
// //     if (functionCalls && functionCalls.length > 0) {
// //       const call = functionCalls[0];
// //       console.log('🤖 AI wants to call a tool:', call.name);
      
// //       let toolResult: any;

// //       if (call.name === 'calculate_premium') {
// //         const args = call.args as CalculatePremiumArgs;
// //         toolResult = await calculatePremium({
// //             insuranceType: args.insuranceType,
// //             details: args.details
// //         });

// //       } else if (call.name === 'generate_payment_link') {
// //         const args = call.args as GeneratePaymentLinkArgs;

// //         console.log(`📝 Creating quote record in DB for ${args.customerName}...`);
// //         const product = await prisma.insuranceProduct.findUnique({ where: { type: args.insuranceType } });
// //         if (!product) throw new Error(`Product type ${args.insuranceType} not found.`);

// //         const newQuote = await prisma.quote.create({
// //           data: {
// //             userId: user.id,
// //             insuranceProductId: product.id,
// //             type: args.insuranceType,
// //             status: 'quoted',
// //             premium: args.premium,
// //             details: args.details,
// //           },
// //         });
// //         console.log(`✅ Quote record created with ID: ${newQuote.id}`);

// //         toolResult = await createStripeCheckoutSession({
// //           quoteId: newQuote.id,
// //           premium: newQuote.premium,
// //           customerName: args.customerName,
// //         });

// //       } else {
// //         console.warn(`Unknown function call requested: ${call.name}`);
// //         toolResult = { error: 'Unknown function' };
// //       }

// //       const toolResponseResult = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
// //       aiResponseText = toolResponseResult.response.text();
// //       console.log('🤖 AI Response after tool call:', aiResponseText);
// //     }

// //     const updatedHistory = await chat.getHistory();
// //     await prisma.conversation.update({
// //       where: { id: conversation.id },
// //       data: { history: updatedHistory as unknown as any },
// //     });

// //     const finalMessage = applyBusinessLogic(aiResponseText);
// //     await sendWhatsAppMessage(whatsappId, finalMessage);
    
// //   } catch (error) {
// //     console.error('❌ Error in agent.service:', error);
// //     await sendWhatsAppMessage(whatsappId, "I'm sorry, I encountered an unexpected error. Could we please try that again?");
// //   }
// // };

// // // --- HELPER FUNCTIONS ---

// // async function injectDynamicInstructions(history: Content[], userMessage: string): Promise<Content[]> {
// //     const { prisma } = await import('../lib/prisma'); // DYNAMIC IMPORT
// //     const lowerCaseMessage = userMessage.toLowerCase();
// //     if (history.length <= 2 && (lowerCaseMessage.includes('motor') || lowerCaseMessage.includes('car'))) {
// //         const motorProduct = await prisma.insuranceProduct.findUnique({ where: { type: 'motor' } });
// //         if (motorProduct) {
// //             const requiredInputs = JSON.stringify(motorProduct.requiredInputs);
// //             const instruction: Content = {
// //                 role: 'model',
// //                 parts: [{ text: `(System Instruction: The user wants motor insurance. Your goal is to collect the following pieces of information, asking one question at a time: ${requiredInputs}. Once you have all required information, call the 'calculate_premium' tool.)` }]
// //             };
// //             return [history[0], instruction, ...history.slice(1)];
// //         }
// //     }
// //     return history;
// // }

// // async function findOrCreateUserAndConversation(whatsappId: string) {
// //   const { prisma } = await import('../lib/prisma'); // DYNAMIC IMPORT
// //   let user = await prisma.user.findUnique({ where: { whatsappId } });
// //   if (!user) { user = await prisma.user.create({ data: { whatsappId } }) }

// //   let conversation = await prisma.conversation.findUnique({ where: { userId: user.id } });
// //   if (!conversation) { conversation = await prisma.conversation.create({ data: { userId: user.id, history: [] } }) }

// //   return { user, conversation };
// // }

// // function applyBusinessLogic(responseText: string): string {
// //   let finalMessage = responseText;
// //   if (responseText.toLowerCase().includes('premium is')) {
// //     finalMessage += `\n\n*Note: This quote is based on the details you provided and our standard underwriting rules.*`;
// //   }
// //   if (responseText.toLowerCase().includes("i cannot help")) {
// //     return trustAndSafetyPrompt;
// //   }
// //   return finalMessage;
// // }

// // export const addSystemMessageToConversation = async (whatsappId: string, systemText: string) => {
// //   try {
// //     const { prisma } = await import('../lib/prisma'); // DYNAMIC IMPORT
// //     const { conversation } = await findOrCreateUserAndConversation(whatsappId);
// //     const currentHistory = conversation.history as unknown as Content[];
// //     const systemMessage: Content = {
// //       role: 'model',
// //       parts: [{ text: `(System Note: ${systemText})` }],
// //     };
// //     const updatedHistory = [...currentHistory, systemMessage];
// //     await prisma.conversation.update({
// //       where: { id: conversation.id },
// //       data: { history: updatedHistory as unknown as any },
// //     });
// //     console.log(`📝 System message added to conversation for ${whatsappId}.`);
// //   } catch (error) {
// //     console.error(`❌ Error adding system message for ${whatsappId}:`, error);
// //   }
// // };





















































// // // // src/services/agent.service.ts

// // // import { prisma } from '../lib/prisma';
// // // import {
// // //   GoogleGenerativeAI,
// // //   Content,
// // //   FunctionDeclaration,
// // //   Tool,
// // //   SchemaType,
// // // } from '@google/generative-ai';
// // // import { config } from '../config';
// // // import { sendMessage as sendWhatsAppMessage } from './whatsapp.service';
// // // import { systemInstruction, trustAndSafetyPrompt } from './persona.service';
// // // import { calculatePremium } from './premium.service';
// // // import { createStripeCheckoutSession } from './payment.service';

// // // // --- TYPE DEFINITIONS FOR OUR TOOL ARGUMENTS ---
// // // interface CalculatePremiumArgs {
// // //   insuranceType: 'motor' | 'travel' | 'health';
// // //   details: Record<string, any>;
// // // }

// // // interface GeneratePaymentLinkArgs {
// // //   insuranceType: 'motor' | 'travel' | 'health';
// // //   premium: number;
// // //   customerName: string;
// // //   details: Record<string, any>;
// // // }

// // // // --- TOOL AND MODEL SETUP (unchanged) ---
// // // const functionDeclarations: FunctionDeclaration[] = [
// // //   {
// // //     name: 'calculate_premium',
// // //     description: 'Calculates the insurance premium based on the type of insurance and user-provided details.',
// // //     parameters: {
// // //       type: SchemaType.OBJECT,
// // //       properties: {
// // //         insuranceType: {
// // //           type: SchemaType.STRING,
// // //           enum: ['motor', 'travel', 'health'],
// // //           description: 'The type of insurance.',
// // //           format: 'enum',
// // //         },
// // //         details: {
// // //           type: SchemaType.OBJECT,
// // //           description: 'An object containing all the details collected from the user, like age, car type, etc.',
// // //           properties: {},
// // //         },
// // //       },
// // //       required: ['insuranceType', 'details'],
// // //     },
// // //   },
// // //   {
// // //     name: 'generate_payment_link',
// // //     description: "Generates a Stripe payment link when the user agrees to a quote. Creates a quote record in the database before generating the link.",
// // //     parameters: {
// // //       type: SchemaType.OBJECT,
// // //       properties: {
// // //         insuranceType: {
// // //           type: SchemaType.STRING,
// // //           enum: ['motor', 'travel', 'health'],
// // //           description: "The type of insurance being quoted, e.g., 'motor'.",
// // //           format: 'enum',
// // //         },
// // //         premium: {
// // //           type: SchemaType.NUMBER,
// // //           description: 'The premium amount in RWF to be charged.',
// // //         },
// // //         customerName: {
// // //           type: SchemaType.STRING,
// // //           description: 'The full name of the customer.',
// // //         },
// // //         details: {
// // //           type: SchemaType.OBJECT,
// // //           description: 'The same details object that was used for the premium calculation.',
// // //           properties: {},
// // //         },
// // //       },
// // //       required: ['insuranceType', 'premium', 'customerName', 'details'],
// // //     },
// // //   },
// // // ];

// // // const tools: Tool[] = [{ functionDeclarations }];
// // // const genAI = new GoogleGenerativeAI(config.GOOGLE_API_KEY!);
// // // const model = genAI.getGenerativeModel({
// // //   model: 'gemini-2.0-flash',
// // //   systemInstruction: systemInstruction,
// // //   tools: tools,
// // // });

// // // // --- THE MAIN MESSAGE PROCESSING FUNCTION ---
// // // export const processMessage = async (whatsappId: string, userMessage: string) => {
// // //   try {
// // //     const { user, conversation } = await findOrCreateUserAndConversation(whatsappId);
    
// // //     const chatHistory = conversation.history as unknown as Content[];
// // //     const dynamicHistory = await injectDynamicInstructions(chatHistory, userMessage);
    
// // //     const chat = model.startChat({ history: dynamicHistory });

// // //     const result = await chat.sendMessage(userMessage);
// // //     const response = result.response;
// // //     let aiResponseText = response.text();

// // //     const functionCalls = response.functionCalls();
// // //     if (functionCalls && functionCalls.length > 0) {
// // //       const call = functionCalls[0];
// // //       console.log('🤖 AI wants to call a tool:', call.name);
      
// // //       let toolResult: any;

// // //       if (call.name === 'calculate_premium') {
// // //         const args = call.args as CalculatePremiumArgs;
// // //         // FIX: Revert the call to its original, simpler form.
// // //         toolResult = await calculatePremium({
// // //             insuranceType: args.insuranceType,
// // //             details: args.details
// // //         });

// // //       } else if (call.name === 'generate_payment_link') {
// // //         const args = call.args as GeneratePaymentLinkArgs;

// // //         console.log(`📝 Creating quote record in DB for ${args.customerName}...`);
// // //         const product = await prisma.insuranceProduct.findUnique({ where: { type: args.insuranceType } });
// // //         if (!product) throw new Error(`Product type ${args.insuranceType} not found.`);

// // //         const newQuote = await prisma.quote.create({
// // //           data: {
// // //             userId: user.id,
// // //             insuranceProductId: product.id,
// // //             type: args.insuranceType,
// // //             status: 'quoted',
// // //             premium: args.premium,
// // //             details: args.details,
// // //           },
// // //         });
// // //         console.log(`✅ Quote record created with ID: ${newQuote.id}`);

// // //         toolResult = await createStripeCheckoutSession({
// // //           quoteId: newQuote.id,
// // //           premium: newQuote.premium,
// // //           customerName: args.customerName,
// // //         });

// // //       } else {
// // //         console.warn(`Unknown function call requested: ${call.name}`);
// // //         toolResult = { error: 'Unknown function' };
// // //       }

// // //       const toolResponseResult = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
// // //       aiResponseText = toolResponseResult.response.text();
// // //       console.log('🤖 AI Response after tool call:', aiResponseText);
// // //     }

// // //     const updatedHistory = await chat.getHistory();
// // //     await prisma.conversation.update({
// // //       where: { id: conversation.id },
// // //       data: { history: updatedHistory as unknown as any },
// // //     });

// // //     const finalMessage = applyBusinessLogic(aiResponseText);
// // //     await sendWhatsAppMessage(whatsappId, finalMessage);
    
// // //   } catch (error) {
// // //     console.error('❌ Error in agent.service:', error);
// // //     await sendWhatsAppMessage(whatsappId, "I'm sorry, I encountered an unexpected error. Could we please try that again?");
// // //   }
// // // };

// // // // --- HELPER FUNCTIONS ---
// // // // ... (These functions are unchanged)
// // // async function injectDynamicInstructions(history: Content[], userMessage: string): Promise<Content[]> {
// // //     const lowerCaseMessage = userMessage.toLowerCase();
// // //     if (history.length <= 2 && (lowerCaseMessage.includes('motor') || lowerCaseMessage.includes('car'))) {
// // //         const motorProduct = await prisma.insuranceProduct.findUnique({ where: { type: 'motor' } });
// // //         if (motorProduct) {
// // //             const requiredInputs = JSON.stringify(motorProduct.requiredInputs);
// // //             const instruction: Content = {
// // //                 role: 'model',
// // //                 parts: [{ text: `(System Instruction: The user wants motor insurance. Your goal is to collect the following pieces of information, asking one question at a time: ${requiredInputs}. Once you have all required information, call the 'calculate_premium' tool.)` }]
// // //             };
// // //             return [history[0], instruction, ...history.slice(1)];
// // //         }
// // //     }
// // //     return history;
// // // }

// // // async function findOrCreateUserAndConversation(whatsappId: string) {
// // //   let user = await prisma.user.findUnique({ where: { whatsappId } });
// // //   if (!user) { user = await prisma.user.create({ data: { whatsappId } }) }

// // //   let conversation = await prisma.conversation.findUnique({ where: { userId: user.id } });
// // //   if (!conversation) { conversation = await prisma.conversation.create({ data: { userId: user.id, history: [] } }) }

// // //   return { user, conversation };
// // // }

// // // function applyBusinessLogic(responseText: string): string {
// // //   let finalMessage = responseText;
// // //   if (responseText.toLowerCase().includes('premium is')) {
// // //     finalMessage += `\n\n*Note: This quote is based on the details you provided and our standard underwriting rules.*`;
// // //   }
// // //   if (responseText.toLowerCase().includes("i cannot help")) {
// // //     return trustAndSafetyPrompt;
// // //   }
// // //   return finalMessage;
// // // }

// // // export const addSystemMessageToConversation = async (whatsappId: string, systemText: string) => {
// // //   try {
// // //     const { conversation } = await findOrCreateUserAndConversation(whatsappId);
// // //     const currentHistory = conversation.history as unknown as Content[];
// // //     const systemMessage: Content = {
// // //       role: 'model',
// // //       parts: [{ text: `(System Note: ${systemText})` }],
// // //     };
// // //     const updatedHistory = [...currentHistory, systemMessage];
// // //     await prisma.conversation.update({
// // //       where: { id: conversation.id },
// // //       data: { history: updatedHistory as unknown as any },
// // //     });
// // //     console.log(`📝 System message added to conversation for ${whatsappId}.`);
// // //   } catch (error) {
// // //     console.error(`❌ Error adding system message for ${whatsappId}:`, error);
// // //   }
// // // };

































// // // // // src/services/agent.service.ts

// // // // import { prisma } from '../lib/prisma'; // This file now "owns" the prisma import
// // // // import {
// // // //   GoogleGenerativeAI,
// // // //   Content,
// // // //   FunctionDeclaration,
// // // //   Tool,
// // // //   SchemaType,
// // // // } from '@google/generative-ai';
// // // // import { config } from '../config';
// // // // import { sendMessage as sendWhatsAppMessage } from './whatsapp.service';
// // // // import { systemInstruction, trustAndSafetyPrompt } from './persona.service';
// // // // import { calculatePremium } from './premium.service'; // We import the function
// // // // import { createStripeCheckoutSession } from './payment.service';

// // // // // --- TYPE DEFINITIONS FOR OUR TOOL ARGUMENTS ---
// // // // interface CalculatePremiumArgs {
// // // //   insuranceType: 'motor' | 'travel' | 'health';
// // // //   details: Record<string, any>;
// // // // }

// // // // interface GeneratePaymentLinkArgs {
// // // //   insuranceType: 'motor' | 'travel' | 'health';
// // // //   premium: number;
// // // //   customerName: string;
// // // //   details: Record<string, any>;
// // // // }

// // // // // --- TOOL AND MODEL SETUP (No changes here) ---
// // // // const functionDeclarations: FunctionDeclaration[] = [
// // // //   {
// // // //     name: 'calculate_premium',
// // // //     description: 'Calculates the insurance premium based on the type of insurance and user-provided details.',
// // // //     parameters: {
// // // //       type: SchemaType.OBJECT,
// // // //       properties: {
// // // //         insuranceType: {
// // // //           type: SchemaType.STRING,
// // // //           enum: ['motor', 'travel', 'health'],
// // // //           description: 'The type of insurance.',
// // // //           format: 'enum',
// // // //         },
// // // //         details: {
// // // //           type: SchemaType.OBJECT,
// // // //           description: 'An object containing all the details collected from the user, like age, car type, etc.',
// // // //           properties: {},
// // // //         },
// // // //       },
// // // //       required: ['insuranceType', 'details'],
// // // //     },
// // // //   },
// // // //   {
// // // //     name: 'generate_payment_link',
// // // //     description: "Generates a Stripe payment link when the user agrees to a quote. Creates a quote record in the database before generating the link.",
// // // //     parameters: {
// // // //       type: SchemaType.OBJECT,
// // // //       properties: {
// // // //         insuranceType: {
// // // //           type: SchemaType.STRING,
// // // //           enum: ['motor', 'travel', 'health'],
// // // //           description: "The type of insurance being quoted, e.g., 'motor'.",
// // // //           format: 'enum',
// // // //         },
// // // //         premium: {
// // // //           type: SchemaType.NUMBER,
// // // //           description: 'The premium amount in RWF to be charged.',
// // // //         },
// // // //         customerName: {
// // // //           type: SchemaType.STRING,
// // // //           description: 'The full name of the customer.',
// // // //         },
// // // //         details: {
// // // //           type: SchemaType.OBJECT,
// // // //           description: 'The same details object that was used for the premium calculation.',
// // // //           properties: {},
// // // //         },
// // // //       },
// // // //       required: ['insuranceType', 'premium', 'customerName', 'details'],
// // // //     },
// // // //   },
// // // // ];

// // // // const tools: Tool[] = [{ functionDeclarations }];
// // // // const genAI = new GoogleGenerativeAI(config.GOOGLE_API_KEY!);
// // // // const model = genAI.getGenerativeModel({
// // // //   model: 'gemini-2.0-flash',
// // // //   systemInstruction: systemInstruction,
// // // //   tools: tools,
// // // // });


// // // // // --- THE MAIN MESSAGE PROCESSING FUNCTION ---
// // // // export const processMessage = async (whatsappId: string, userMessage: string) => {
// // // //   try {
// // // //     const { user, conversation } = await findOrCreateUserAndConversation(whatsappId);
    
// // // //     const chatHistory = conversation.history as unknown as Content[];
// // // //     const dynamicHistory = await injectDynamicInstructions(chatHistory, userMessage);
    
// // // //     const chat = model.startChat({ history: dynamicHistory });

// // // //     const result = await chat.sendMessage(userMessage);
// // // //     const response = result.response;
// // // //     let aiResponseText = response.text();

// // // //     const functionCalls = response.functionCalls();
// // // //     if (functionCalls && functionCalls.length > 0) {
// // // //       const call = functionCalls[0];
// // // //       console.log('🤖 AI wants to call a tool:', call.name);
      
// // // //       let toolResult: any;

// // // //       if (call.name === 'calculate_premium') {
// // // //         const args = call.args as CalculatePremiumArgs;
// // // //         // FIX: Pass the imported prisma instance as the first argument.
// // // //         toolResult = await calculatePremium(prisma, {
// // // //             insuranceType: args.insuranceType,
// // // //             details: args.details
// // // //         });

// // // //       } else if (call.name === 'generate_payment_link') {
// // // //         const args = call.args as GeneratePaymentLinkArgs;

// // // //         console.log(`📝 Creating quote record in DB for ${args.customerName}...`);
// // // //         const product = await prisma.insuranceProduct.findUnique({ where: { type: args.insuranceType } });
// // // //         if (!product) throw new Error(`Product type ${args.insuranceType} not found.`);

// // // //         const newQuote = await prisma.quote.create({
// // // //           data: {
// // // //             userId: user.id,
// // // //             insuranceProductId: product.id,
// // // //             type: args.insuranceType,
// // // //             status: 'quoted',
// // // //             premium: args.premium,
// // // //             details: args.details,
// // // //           },
// // // //         });
// // // //         console.log(`✅ Quote record created with ID: ${newQuote.id}`);

// // // //         toolResult = await createStripeCheckoutSession({
// // // //           quoteId: newQuote.id,
// // // //           premium: newQuote.premium,
// // // //           customerName: args.customerName,
// // // //         });

// // // //       } else {
// // // //         console.warn(`Unknown function call requested: ${call.name}`);
// // // //         toolResult = { error: 'Unknown function' };
// // // //       }

// // // //       const toolResponseResult = await chat.sendMessage([{ functionResponse: { name: call.name, response: toolResult } }]);
// // // //       aiResponseText = toolResponseResult.response.text();
// // // //       console.log('🤖 AI Response after tool call:', aiResponseText);
// // // //     }

// // // //     const updatedHistory = await chat.getHistory();
// // // //     await prisma.conversation.update({
// // // //       where: { id: conversation.id },
// // // //       data: { history: updatedHistory as unknown as any },
// // // //     });

// // // //     const finalMessage = applyBusinessLogic(aiResponseText);
// // // //     await sendWhatsAppMessage(whatsappId, finalMessage);
    
// // // //   } catch (error) {
// // // //     console.error('❌ Error in agent.service:', error);
// // // //     await sendWhatsAppMessage(whatsappId, "I'm sorry, I encountered an unexpected error. Could we please try that again?");
// // // //   }
// // // // };

// // // // // --- HELPER FUNCTIONS ---

// // // // async function injectDynamicInstructions(history: Content[], userMessage: string): Promise<Content[]> {
// // // //     const lowerCaseMessage = userMessage.toLowerCase();
// // // //     if (history.length <= 2 && (lowerCaseMessage.includes('motor') || lowerCaseMessage.includes('car'))) {
// // // //         const motorProduct = await prisma.insuranceProduct.findUnique({ where: { type: 'motor' } });
// // // //         if (motorProduct) {
// // // //             const requiredInputs = JSON.stringify(motorProduct.requiredInputs);
// // // //             const instruction: Content = {
// // // //                 role: 'model',
// // // //                 parts: [{ text: `(System Instruction: The user wants motor insurance. Your goal is to collect the following pieces of information, asking one question at a time: ${requiredInputs}. Once you have all required information, call the 'calculate_premium' tool.)` }]
// // // //             };
// // // //             return [history[0], instruction, ...history.slice(1)];
// // // //         }
// // // //     }
// // // //     return history;
// // // // }

// // // // async function findOrCreateUserAndConversation(whatsappId: string) {
// // // //   let user = await prisma.user.findUnique({ where: { whatsappId } });
// // // //   if (!user) { user = await prisma.user.create({ data: { whatsappId } }) }

// // // //   let conversation = await prisma.conversation.findUnique({ where: { userId: user.id } });
// // // //   if (!conversation) { conversation = await prisma.conversation.create({ data: { userId: user.id, history: [] } }) }

// // // //   return { user, conversation };
// // // // }

// // // // function applyBusinessLogic(responseText: string): string {
// // // //   let finalMessage = responseText;
// // // //   if (responseText.toLowerCase().includes('premium is')) {
// // // //     finalMessage += `\n\n*Note: This quote is based on the details you provided and our standard underwriting rules.*`;
// // // //   }
// // // //   if (responseText.toLowerCase().includes("i cannot help")) {
// // // //     return trustAndSafetyPrompt;
// // // //   }
// // // //   return finalMessage;
// // // // }


// // // // export const addSystemMessageToConversation = async (whatsappId: string, systemText: string) => {
// // // //   try {
// // // //     const { conversation } = await findOrCreateUserAndConversation(whatsappId);
// // // //     const currentHistory = conversation.history as unknown as Content[];
// // // //     const systemMessage: Content = {
// // // //       role: 'model',
// // // //       parts: [{ text: `(System Note: ${systemText})` }],
// // // //     };
// // // //     const updatedHistory = [...currentHistory, systemMessage];
// // // //     await prisma.conversation.update({
// // // //       where: { id: conversation.id },
// // // //       data: { history: updatedHistory as unknown as any },
// // // //     });
// // // //     console.log(`📝 System message added to conversation for ${whatsappId}.`);
// // // //   } catch (error) {
// // // //     console.error(`❌ Error adding system message for ${whatsappId}:`, error);
// // // //   }
// // // // };
