// src/services/premium.service.ts

// REMOVE the top-level prisma import to prevent build-time issues.
// import { prisma } from '../lib/prisma';

// Define types for our JSON rules (unchanged)
interface PricingFactor {
  key: string;
  condition: 'lt' | 'gt' | 'eq';
  value: number | string | boolean;
  modifier: number;
  type: 'multiply' | 'add';
}

interface PricingRules {
  baseRate: number;
  factors: PricingFactor[];
}

interface PremiumInput {
  insuranceType: 'motor' | 'travel' | 'health';
  details: Record<string, any>;
}

/**
 * A dynamic premium calculation engine.
 *
 * @param input - Contains the insurance type and the user's collected details.
 * @returns An object containing the final calculated premium or an error.
 */
// FIX: Ensure the function only accepts one argument.
export const calculatePremium = async (
  input: PremiumInput
): Promise<{ premium: number } | { error: string }> => {
  const { insuranceType, details } = input;

  try {
    // FIX: Dynamically import prisma inside the function.
    const { prisma } = await import('../lib/prisma');

    const product = await prisma.insuranceProduct.findUnique({
      where: { type: insuranceType },
    });

    if (!product || !product.isActive) {
      console.error(`Insurance product type "${insuranceType}" not found or is not active.`);
      return { error: 'Invalid insurance type specified.' };
    }

    const rules = product.pricingRules as unknown as PricingRules;

    if (!rules || typeof rules.baseRate !== 'number' || !Array.isArray(rules.factors)) {
        console.error(`Pricing rules for "${insuranceType}" are malformed or missing key properties.`);
        return { error: 'Pricing rules are not configured correctly for this product.' };
    }

    let finalPremium = rules.baseRate;
    console.log(`RULES ENGINE: Starting with base rate: ${finalPremium} RWF`);

    for (const factor of rules.factors) {
      const userValue = details[factor.key];
      if (userValue === undefined) continue;

      let conditionMet = false;
      switch (factor.condition) {
        case 'lt': conditionMet = userValue < factor.value; break;
        case 'gt': conditionMet = userValue > factor.value; break;
        case 'eq': conditionMet = userValue == factor.value; break;
      }

      if (conditionMet) {
        console.log(`RULES ENGINE: Condition met for key "${factor.key}". Applying modifier.`);
        if (factor.type === 'multiply') {
          finalPremium *= factor.modifier;
        } else if (factor.type === 'add') {
          finalPremium += factor.modifier;
        }
      }
    }

    const roundedPremium = Math.round(finalPremium);
    console.log(`RULES ENGINE: Final calculated premium: ${roundedPremium} RWF`);

    return { premium: roundedPremium };

  } catch (error) {
    console.error(`❌ Error in premium calculation service for type "${insuranceType}":`, error);
    return { error: 'An unexpected error occurred during premium calculation.' };
  }
};






























// // src/services/premium.service.ts

// // We REMOVE the prisma import from the top of the file.
// // import { prisma } from '../lib/prisma';

// // Define types for our JSON rules (unchanged)
// interface PricingFactor {
//   key: string;
//   condition: 'lt' | 'gt' | 'eq';
//   value: number | string | boolean;
//   modifier: number;
//   type: 'multiply' | 'add';
// }

// interface PricingRules {
//   baseRate: number;
//   factors: PricingFactor[];
// }

// interface PremiumInput {
//   insuranceType: 'motor' | 'travel' | 'health';
//   details: Record<string, any>;
// }

// /**
//  * A dynamic premium calculation engine.
//  */
// export const calculatePremium = async (
//   input: PremiumInput
// ): Promise<{ premium: number } | { error: string }> => {
//   const { insuranceType, details } = input;

//   try {
//     // ===================================================================
//     // THE FIX: Dynamically import prisma inside the function.
//     // This forces the module to be resolved at runtime, not build time.
//     const { prisma } = await import('../lib/prisma');
//     // ===================================================================

//     // 1. Use the dynamically imported prisma instance.
//     const product = await prisma.insuranceProduct.findUnique({
//       where: { type: insuranceType },
//     });

//     if (!product || !product.isActive) {
//       console.error(`Insurance product type "${insuranceType}" not found or is not active.`);
//       return { error: 'Invalid insurance type specified.' };
//     }

//     const rules = product.pricingRules as unknown as PricingRules;

//     if (!rules || typeof rules.baseRate !== 'number' || !Array.isArray(rules.factors)) {
//         console.error(`Pricing rules for "${insuranceType}" are malformed or missing key properties.`);
//         return { error: 'Pricing rules are not configured correctly for this product.' };
//     }

//     let finalPremium = rules.baseRate;
//     console.log(`RULES ENGINE: Starting with base rate: ${finalPremium} RWF`);

//     for (const factor of rules.factors) {
//       const userValue = details[factor.key];
//       if (userValue === undefined) continue;

//       let conditionMet = false;
//       switch (factor.condition) {
//         case 'lt': conditionMet = userValue < factor.value; break;
//         case 'gt': conditionMet = userValue > factor.value; break;
//         case 'eq': conditionMet = userValue == factor.value; break;
//       }

//       if (conditionMet) {
//         console.log(`RULES ENGINE: Condition met for key "${factor.key}". Applying modifier.`);
//         if (factor.type === 'multiply') {
//           finalPremium *= factor.modifier;
//         } else if (factor.type === 'add') {
//           finalPremium += factor.modifier;
//         }
//       }
//     }

//     const roundedPremium = Math.round(finalPremium);
//     console.log(`RULES ENGINE: Final calculated premium: ${roundedPremium} RWF`);

//     return { premium: roundedPremium };

//   } catch (error) {
//     console.error(`❌ Error in premium calculation service for type "${insuranceType}":`, error);
//     return { error: 'An unexpected error occurred during premium calculation.' };
//   }
// };



























































// // // src/services/premium.service.ts

// // import { prisma } from '../lib/prisma'; // <-- IMPORT PRISMA DIRECTLY

// // // Define types for our JSON rules (unchanged)
// // interface PricingFactor {
// //   key: string;
// //   condition: 'lt' | 'gt' | 'eq';
// //   value: number | string | boolean;
// //   modifier: number;
// //   type: 'multiply' | 'add';
// // }

// // interface PricingRules {
// //   baseRate: number;
// //   factors: PricingFactor[];
// // }

// // interface PremiumInput {
// //   insuranceType: 'motor' | 'travel' | 'health';
// //   details: Record<string, any>;
// // }

// // /**
// //  * A dynamic premium calculation engine.
// //  * It fetches pricing rules from the database for a given insurance type
// //  * and applies them to the user-provided details.
// //  *
// //  * @param input - Contains the insurance type and the user's collected details.
// //  * @returns An object containing the final calculated premium or an error.
// //  */
// // // FIX: Remove the prisma parameter from the function signature
// // export const calculatePremium = async (
// //   input: PremiumInput
// // ): Promise<{ premium: number } | { error: string }> => {
// //   const { insuranceType, details } = input;

// //   try {
// //     // 1. Use the directly imported prisma instance.
// //     const product = await prisma.insuranceProduct.findUnique({
// //       where: { type: insuranceType },
// //     });

// //     if (!product || !product.isActive) {
// //       console.error(`Insurance product type "${insuranceType}" not found or is not active.`);
// //       return { error: 'Invalid insurance type specified.' };
// //     }

// //     // 2. Safely parse the pricing rules from the JSON field.
// //     const rules = product.pricingRules as unknown as PricingRules;

// //     if (!rules || typeof rules.baseRate !== 'number' || !Array.isArray(rules.factors)) {
// //         console.error(`Pricing rules for "${insuranceType}" are malformed or missing key properties.`);
// //         return { error: 'Pricing rules are not configured correctly for this product.' };
// //     }

// //     // 3. Initialize the premium with the base rate.
// //     let finalPremium = rules.baseRate;
// //     console.log(`RULES ENGINE: Starting with base rate: ${finalPremium} RWF`);

// //     // 4. Execute the rules engine.
// //     for (const factor of rules.factors) {
// //       const userValue = details[factor.key];
// //       if (userValue === undefined) continue;

// //       let conditionMet = false;
// //       switch (factor.condition) {
// //         case 'lt': conditionMet = userValue < factor.value; break;
// //         case 'gt': conditionMet = userValue > factor.value; break;
// //         case 'eq': conditionMet = userValue == factor.value; break;
// //       }

// //       if (conditionMet) {
// //         console.log(`RULES ENGINE: Condition met for key "${factor.key}". Applying modifier.`);
// //         if (factor.type === 'multiply') {
// //           finalPremium *= factor.modifier;
// //         } else if (factor.type === 'add') {
// //           finalPremium += factor.modifier;
// //         }
// //       }
// //     }

// //     const roundedPremium = Math.round(finalPremium);
// //     console.log(`RULES ENGINE: Final calculated premium: ${roundedPremium} RWF`);

// //     return { premium: roundedPremium };

// //   } catch (error) {
// //     console.error(`❌ Error in premium calculation service for type "${insuranceType}":`, error);
// //     return { error: 'An unexpected error occurred during premium calculation.' };
// //   }
// // };










































// // // // src/services/premium.service.ts

// // // import { PrismaClient } from '@prisma/client';
// // // import { prisma } from '../lib/prisma';

// // // // Define types for our JSON rules to get TypeScript autocompletion and safety.
// // // interface PricingFactor {
// // //   key: string;
// // //   condition: 'lt' | 'gt' | 'eq';
// // //   value: number | string | boolean;
// // //   modifier: number;
// // //   type: 'multiply' | 'add';
// // // }

// // // interface PricingRules {
// // //   baseRate: number;
// // //   factors: PricingFactor[];
// // // }

// // // interface PremiumInput {
// // //   insuranceType: 'motor' | 'travel' | 'health';
// // //   details: Record<string, any>;
// // // }

// // // /**
// // //  * A dynamic premium calculation engine.
// // //  * It fetches pricing rules from the database for a given insurance type
// // //  * and applies them to the user-provided details.
// // //  *
// // //  * @param prisma - The PrismaClient instance, passed in to avoid import cycles.
// // //  * @param input - Contains the insurance type and the user's collected details.
// // //  * @returns An object containing the final calculated premium or an error.
// // //  */
// // // export const calculatePremium = async (
// // //   prisma: PrismaClient, // The Prisma client is now an argument
// // //   input: PremiumInput
// // // ): Promise<{ premium: number } | { error: string }> => {
// // //   const { insuranceType, details } = input;

// // //   try {
// // //     // 1. Fetch the product and its pricing rules from the database using the passed-in prisma client.
// // //     const product = await prisma.insuranceProduct.findUnique({
// // //       where: { type: insuranceType },
// // //     });

// // //     if (!product || !product.isActive) {
// // //       console.error(`Insurance product type "${insuranceType}" not found or is not active.`);
// // //       return { error: 'Invalid insurance type specified.' };
// // //     }

// // //     // 2. Safely parse the pricing rules from the JSON field.
// // //     const rules = product.pricingRules as unknown as PricingRules;

// // //     if (!rules || typeof rules.baseRate !== 'number' || !Array.isArray(rules.factors)) {
// // //         console.error(`Pricing rules for "${insuranceType}" are malformed or missing key properties.`);
// // //         return { error: 'Pricing rules are not configured correctly for this product.' };
// // //     }

// // //     // 3. Initialize the premium with the base rate.
// // //     let finalPremium = rules.baseRate;
// // //     console.log(`RULES ENGINE: Starting with base rate: ${finalPremium} RWF`);

// // //     // 4. Execute the rules engine.
// // //     for (const factor of rules.factors) {
// // //       const userValue = details[factor.key];

// // //       if (userValue === undefined) {
// // //         continue;
// // //       }

// // //       let conditionMet = false;
// // //       switch (factor.condition) {
// // //         case 'lt':
// // //           conditionMet = userValue < factor.value;
// // //           break;
// // //         case 'gt':
// // //           conditionMet = userValue > factor.value;
// // //           break;
// // //         case 'eq':
// // //           conditionMet = userValue == factor.value;
// // //           break;
// // //       }

// // //       if (conditionMet) {
// // //         console.log(`RULES ENGINE: Condition met for key "${factor.key}". Applying modifier.`);
// // //         if (factor.type === 'multiply') {
// // //           finalPremium *= factor.modifier;
// // //         } else if (factor.type === 'add') {
// // //           finalPremium += factor.modifier;
// // //         }
// // //       }
// // //     }

// // //     const roundedPremium = Math.round(finalPremium);
// // //     console.log(`RULES ENGINE: Final calculated premium: ${roundedPremium} RWF`);

// // //     return { premium: roundedPremium };

// // //   } catch (error) {
// // //     console.error(`❌ Error in premium calculation service for type "${insuranceType}":`, error);
// // //     return { error: 'An unexpected error occurred during premium calculation.' };
// // //   }
// // // };



























// // // // // src/services/premium.service.ts

// // // // import { prisma } from '../lib/prisma';

// // // // // Define types for our JSON rules to get TypeScript autocompletion and safety.
// // // // interface PricingFactor {
// // // //   key: string;
// // // //   condition: 'lt' | 'gt' | 'eq';
// // // //   value: number | string | boolean;
// // // //   modifier: number;
// // // //   type: 'multiply' | 'add';
// // // // }

// // // // interface PricingRules {
// // // //   baseRate: number;
// // // //   factors: PricingFactor[];
// // // // }

// // // // interface PremiumInput {
// // // //   insuranceType: 'motor' | 'travel' | 'health';
// // // //   details: Record<string, any>;
// // // // }

// // // // /**
// // // //  * A dynamic premium calculation engine.
// // // //  * It fetches pricing rules from the database for a given insurance type
// // // //  * and applies them to the user-provided details.
// // // //  */
// // // // export const calculatePremium = async (input: PremiumInput): Promise<{ premium: number } | { error: string }> => {
// // // //   const { insuranceType, details } = input;

// // // //   try {
// // // //     // 1. Fetch the product and its pricing rules from the database.
// // // //     const product = await prisma.insuranceProduct.findUnique({
// // // //       where: { type: insuranceType },
// // // //     });

// // // //     if (!product || !product.isActive) {
// // // //       console.error(`Insurance product type "${insuranceType}" not found or is not active.`);
// // // //       return { error: 'Invalid insurance type specified.' };
// // // //     }

// // // //     // ===================================================================
// // // //     // THE FIX IS HERE: Use the 'as unknown as PricingRules' two-step cast.
// // // //     const rules = product.pricingRules as unknown as PricingRules;
// // // //     // ===================================================================

// // // //     if (!rules || typeof rules.baseRate !== 'number' || !Array.isArray(rules.factors)) {
// // // //         console.error(`Pricing rules for "${insuranceType}" are malformed or missing key properties.`);
// // // //         return { error: 'Pricing rules are not configured correctly for this product.' };
// // // //     }

// // // //     // 3. Initialize the premium with the base rate.
// // // //     let finalPremium = rules.baseRate;
// // // //     console.log(`RULES ENGINE: Starting with base rate: ${finalPremium} RWF`);

// // // //     // 4. Execute the rules engine.
// // // //     for (const factor of rules.factors) {
// // // //       const userValue = details[factor.key];

// // // //       if (userValue === undefined) {
// // // //         continue;
// // // //       }

// // // //       let conditionMet = false;
// // // //       switch (factor.condition) {
// // // //         case 'lt':
// // // //           conditionMet = userValue < factor.value;
// // // //           break;
// // // //         case 'gt':
// // // //           conditionMet = userValue > factor.value;
// // // //           break;
// // // //         case 'eq':
// // // //           conditionMet = userValue == factor.value;
// // // //           break;
// // // //       }

// // // //       if (conditionMet) {
// // // //         console.log(`RULES ENGINE: Condition met for key "${factor.key}". Applying modifier.`);
// // // //         if (factor.type === 'multiply') {
// // // //           finalPremium *= factor.modifier;
// // // //         } else if (factor.type === 'add') {
// // // //           finalPremium += factor.modifier;
// // // //         }
// // // //       }
// // // //     }

// // // //     const roundedPremium = Math.round(finalPremium);
// // // //     console.log(`RULES ENGINE: Final calculated premium: ${roundedPremium} RWF`);

// // // //     return { premium: roundedPremium };

// // // //   } catch (error) {
// // // //     console.error(`❌ Error in premium calculation service for type "${insuranceType}":`, error);
// // // //     return { error: 'An unexpected error occurred during premium calculation.' };
// // // //   }
// // // // };




















// // // // // interface PremiumInput {
// // // // //   type: 'motor' | 'travel' | 'health';
// // // // //   details: Record<string, any>;
// // // // // }

// // // // // // This is a mock function. In a real application, this would contain
// // // // // // complex business logic, database lookups for pricing tables, etc.
// // // // // export const calculatePremium = async (input: PremiumInput): Promise<{ premium: number }> => {
// // // // //   console.log('TOOL EXECUTED: calculatePremium with input:', input);
  
// // // // //   let basePremium = 50000; // Base premium in RWF

// // // // //   // Simple mock logic
// // // // //   if (input.type === 'motor') {
// // // // //     const driverAge = input.details.driverAge || 30;
// // // // //     if (driverAge < 25) {
// // // // //       basePremium *= 1.5; // 50% surcharge for young drivers
// // // // //     }
// // // // //   } else if (input.type === 'travel') {
// // // // //     const duration = input.details.durationInDays || 7;
// // // // //     basePremium = 2000 * duration;
// // // // //   }

// // // // //   const finalPremium = Math.ceil(basePremium);
// // // // //   console.log(`TOOL RESULT: Calculated premium is ${finalPremium} RWF`);

// // // // //   return { premium: finalPremium };
// // // // // };
