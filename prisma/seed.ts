// prisma/seed.ts

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function main() {
  console.log('Start seeding...');

  // Upsert ensures we don't create duplicates if we run the seed script again.
  // It will update the record if it exists, or create it if it doesn't.
  const motorProduct = await prisma.insuranceProduct.upsert({
    where: { type: 'motor' },
    update: {}, // No updates needed if it exists, just ensure it's there
    create: {
      type: 'motor',
      name: 'Comprehensive Motor Insurance',
      isActive: true,
      requiredInputs: [
        { key: 'driverFullName', question: "What is the full name of the primary driver?", type: 'string', required: true },
        { key: 'driverAge', question: "What is the driver's age?", type: 'number', required: true },
        { key: 'carMake', question: "What is the make of the car (e.g., Toyota, VW)?", type: 'string', required: true },
        { key: 'carModel', question: "And the model (e.g., Camry, Golf)?", type: 'string', required: true },
        { key: 'carYear', question: "What year was the car manufactured?", type: 'number', required: true },
      ],
      pricingRules: {
        baseRate: 60000, // Base premium in RWF
        factors: [
          // Rule: If driver's age is less than 25, multiply premium by 1.4 (40% surcharge)
          {
            key: 'driverAge',
            condition: 'lt', // "less than"
            value: 25,
            modifier: 1.4,
            type: 'multiply'
          },
          // Rule: If car is older than 15 years, add 10,000 RWF to premium
          {
            key: 'carYear',
            condition: 'lt',
            value: new Date().getFullYear() - 15, // Dynamic value based on current year
            modifier: 10000,
            type: 'add'
          }
        ]
      }
    },
  });

  console.log(`Created/updated product: ${motorProduct.name}`);
  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
  