// src/services/document.service.ts

import axios from 'axios';
import { v2 as cloudinary } from 'cloudinary';
import { prisma } from '../lib/prisma';
import { config } from '../config';

// Configure Cloudinary (this part is unchanged)
cloudinary.config({
  cloud_name: config.CLOUDINARY_CLOUD_NAME,
  api_key: config.CLOUDINARY_API_KEY,
  api_secret: config.CLOUDINARY_API_SECRET,
});

/**
 * A helper function to convert camelCase or snake_case keys into a readable Title Case format.
 * E.g., 'driverFullName' becomes 'Driver Full Name'.
 * @param key The key string to format.
 * @returns A formatted, human-readable string.
 */
const formatDetailKey = (key: string): string => {
  const result = key.replace(/([A-Z])/g, ' $1'); // Add space before capital letters
  return result.charAt(0).toUpperCase() + result.slice(1); // Capitalize the first letter
};

/**
 * Generates a professional HTML string for the insurance certificate, matching the provided design.
 */
const getCertificateHtml = (data: {
  policyId: string;
  customerName: string;
  policyType: string;
  premium: number;
  coverageDetails: any; // This is the JSON object we will format
  issueDate: string;
}): string => {
  const style = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 0; background-color: #ffffff; }
    .page { width: 21cm; min-height: 29.7cm; padding: 2cm; margin: 1cm auto; border: 1px solid #e0e0e0; border-radius: 5px; background: white; box-shadow: 0 0 10px rgba(0, 0, 0, 0.05); }
    .header { text-align: left; margin-bottom: 40px; }
    .header h1 { font-size: 28px; color: #004a80; margin: 0; font-weight: 600; }
    .section-title { font-size: 18px; font-weight: 600; color: #333; border-bottom: 2px solid #004a80; padding-bottom: 8px; margin-top: 30px; margin-bottom: 20px; }
    .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 40px; }
    .detail-item { font-size: 12px; }
    .detail-item strong { font-size: 13px; display: block; margin-bottom: 4px; color: #000; font-weight: 600; }
    .coverage-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .coverage-table td { padding: 10px; border-bottom: 1px solid #eee; font-size: 12px; }
    .coverage-table td:first-child { font-weight: 600; color: #000; width: 40%; }
    .footer { text-align: center; margin-top: 50px; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
  `;

  // --- NEW LOGIC TO FORMAT THE COVERAGE DETAILS ---
  const coverageRows = Object.entries(data.coverageDetails)
    .map(([key, value]) => `
      <tr>
        <td>${formatDetailKey(key)}</td>
        <td>${value}</td>
      </tr>
    `)
    .join('');

  const formattedPolicyType = data.policyType.charAt(0).toUpperCase() + data.policyType.slice(1);

  return `
    <html>
      <head><meta charset="UTF-8"><style>${style}</style></head>
      <body>
        <div class="page">
          <div class="header"><h1>Ishimwe Insurance Certificate</h1></div>
          <div class="section-title">Policy Details</div>
          <div class="details-grid">
            <div class="detail-item"><strong>Policy ID:</strong><span>${data.policyId}</span></div>
            <div class="detail-item"><strong>Insured Name:</strong><span>${data.customerName}</span></div>
            <div class="detail-item"><strong>Insurance Type:</strong><span>${formattedPolicyType}</span></div>
            <div class="detail-item"><strong>Premium Paid:</strong><span>${data.premium.toLocaleString()} RWF</span></div>
            <div class="detail-item"><strong>Date of Issue:</strong><span>${data.issueDate}</span></div>
          </div>
          <div class="section-title">Coverage Summary</div>
          <table class="coverage-table">${coverageRows}</table>
          <div class="footer">This document confirms your insurance policy with Ishimwe Insurance. Valid from the date of issue.</div>
        </div>
      </body>
    </html>
  `;
};

/**
 * Generates a PDF via PDF.co API, uploads it to Cloudinary, and returns the URL.
 * (This function is unchanged, it will now automatically use the new HTML template)
 */
export const generateAndUploadCertificate = async (quoteId: string): Promise<string> => {
  console.log(`CERTIFICATE: Starting API-based generation for quote ID: ${quoteId}`);
  
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { user: true },
  });

  if (!quote || !quote.user) {
    throw new Error(`Quote or user not found for certificate generation (Quote ID: ${quoteId}).`);
  }

  const certificateData = {
    policyId: `POL-${quote.id.toUpperCase().substring(0, 12)}`,
    customerName: quote.user.fullName || 'Valued Customer',
    policyType: quote.type,
    premium: quote.premium,
    coverageDetails: quote.details,
    issueDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
  };
  const htmlContent = getCertificateHtml(certificateData);

  let pdfUrlFromApi: string;
  try {
    const pdfCoResponse = await axios.post(
      'https://api.pdf.co/v1/pdf/convert/from/html', 
      {
        html: htmlContent,
        inline: false,
        name: `${certificateData.policyId}.pdf`,
      },
      {
        headers: {
          'x-api-key': config.PDF_CO_API_KEY!,
          'Content-Type': 'application/json',
        },
      }
    );

    if (pdfCoResponse.data.error) {
      throw new Error(`PDF.co API Error: ${pdfCoResponse.data.message}`);
    }
    pdfUrlFromApi = pdfCoResponse.data.url;
    console.log(`CERTIFICATE: PDF generated by API. Temporary URL: ${pdfUrlFromApi}`);
  } catch (error: any) {
    console.error('❌ PDF.co API request failed:', error.response?.data || error.message);
    throw new Error('Failed to generate PDF via external API.');
  }

  try {
    const pdfBufferResponse = await axios.get(pdfUrlFromApi, { responseType: 'arraybuffer' });
    const pdfBuffer = Buffer.from(pdfBufferResponse.data, 'binary');

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'certificates',
          resource_type: 'raw',
          public_id: certificateData.policyId,
        },
        (error, result) => {
          if (error) {
            console.error('❌ Cloudinary upload error:', error);
            return reject(new Error('Failed to upload PDF to permanent storage.'));
          }
          if (result) {
            console.log(`CERTIFICATE: PDF uploaded to Cloudinary. Final URL: ${result.secure_url}`);
            resolve(result.secure_url);
          }
        }
      );
      uploadStream.end(pdfBuffer);
    });
  } catch (error) {
      console.error('❌ Failed to download from PDF.co or upload to Cloudinary:', error);
      return pdfUrlFromApi;
  }
};















// // src/services/document.service.ts

// import axios from 'axios';
// import { v2 as cloudinary } from 'cloudinary';
// import { prisma } from '../lib/prisma';
// import { config } from '../config';

// // Configure Cloudinary with the credentials from our environment.
// cloudinary.config({
//   cloud_name: config.CLOUDINARY_CLOUD_NAME,
//   api_key: config.CLOUDINARY_API_KEY,
//   api_secret: config.CLOUDINARY_API_SECRET,
// });

// /**
//  * Generates a professional HTML string for the insurance certificate, matching the provided design.
//  */
// const getCertificateHtml = (data: {
//   policyId: string;
//   customerName: string;
//   policyType: string;
//   premium: number;
//   coverageDetails: any;
//   issueDate: string;
// }): string => {
//   const style = `
//     body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #333; margin: 0; padding: 0; background-color: #ffffff; }
//     .page { width: 21cm; min-height: 29.7cm; padding: 2cm; margin: 1cm auto; border: 1px solid #e0e0e0; border-radius: 5px; background: white; box-shadow: 0 0 10px rgba(0, 0, 0, 0.05); }
//     .header { text-align: left; margin-bottom: 40px; }
//     .header h1 { font-size: 28px; color: #004a80; margin: 0; font-weight: 600; }
//     .section-title { font-size: 18px; font-weight: 600; color: #333; border-bottom: 2px solid #004a80; padding-bottom: 8px; margin-top: 30px; margin-bottom: 20px; }
//     .details-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px 40px; }
//     .detail-item { font-size: 12px; }
//     .detail-item strong { font-size: 13px; display: block; margin-bottom: 4px; color: #000; font-weight: 600; }
//     .coverage-summary { background-color: #f8f9fa; border: 1px solid #e9ecef; padding: 15px; border-radius: 8px; margin-top: 10px; }
//     pre { margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: 'SF Mono', 'Courier New', Courier, monospace; font-size: 11px; line-height: 1.5; }
//     .footer { text-align: center; margin-top: 50px; font-size: 10px; color: #888; border-top: 1px solid #eee; padding-top: 20px; }
//   `;

//   const formattedPolicyType = data.policyType.charAt(0).toUpperCase() + data.policyType.slice(1);

//   return `
//     <html>
//       <head><meta charset="UTF-8"><style>${style}</style></head>
//       <body>
//         <div class="page">
//           <div class="header"><h1>Ishimwe Insurance Certificate</h1></div>
//           <div class="section-title">Policy Details</div>
//           <div class="details-grid">
//             <div class="detail-item"><strong>Policy ID:</strong><span>${data.policyId}</span></div>
//             <div class="detail-item"><strong>Insured Name:</strong><span>${data.customerName}</span></div>
//             <div class="detail-item"><strong>Insurance Type:</strong><span>${formattedPolicyType}</span></div>
//             <div class="detail-item"><strong>Premium Paid:</strong><span>${data.premium.toLocaleString()} RWF</span></div>
//             <div class="detail-item"><strong>Date of Issue:</strong><span>${data.issueDate}</span></div>
//           </div>
//           <div class="section-title">Coverage Summary</div>
//           <div class="coverage-summary"><pre>${JSON.stringify(data.coverageDetails, null, 2)}</pre></div>
//           <div class="footer">This document confirms your insurance policy with Ishimwe Insurance. Valid from the date of issue.</div>
//         </div>
//       </body>
//     </html>
//   `;
// };

// /**
//  * Generates a PDF via PDF.co API, uploads it to Cloudinary, and returns the URL.
//  */
// export const generateAndUploadCertificate = async (quoteId: string): Promise<string> => { // <-- The '=> {' was missing
//   console.log(`CERTIFICATE: Starting API-based generation for quote ID: ${quoteId}`);
  
//   const quote = await prisma.quote.findUnique({
//     where: { id: quoteId },
//     include: { user: true },
//   });

//   if (!quote || !quote.user) {
//     throw new Error(`Quote or user not found for certificate generation (Quote ID: ${quoteId}).`);
//   }

//   const certificateData = {
//     policyId: `POL-${quote.id.toUpperCase().substring(0, 12)}`,
//     customerName: quote.user.fullName || 'Valued Customer',
//     policyType: quote.type,
//     premium: quote.premium,
//     coverageDetails: quote.details,
//     issueDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
//   };
//   const htmlContent = getCertificateHtml(certificateData);

//   let pdfUrlFromApi: string;
//   try {
//     const pdfCoResponse = await axios.post(
//       'https://api.pdf.co/v1/pdf/convert/from/html', 
//       {
//         html: htmlContent,
//         inline: false,
//         name: `${certificateData.policyId}.pdf`,
//       },
//       {
//         headers: {
//           'x-api-key': config.PDF_CO_API_KEY!,
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     if (pdfCoResponse.data.error) {
//       throw new Error(`PDF.co API Error: ${pdfCoResponse.data.message}`);
//     }
//     pdfUrlFromApi = pdfCoResponse.data.url;
//     console.log(`CERTIFICATE: PDF generated by API. Temporary URL: ${pdfUrlFromApi}`);
//   } catch (error: any) {
//     console.error('❌ PDF.co API request failed:', error.response?.data || error.message);
//     throw new Error('Failed to generate PDF via external API.');
//   }

//   try {
//     const pdfBufferResponse = await axios.get(pdfUrlFromApi, { responseType: 'arraybuffer' });
//     const pdfBuffer = Buffer.from(pdfBufferResponse.data, 'binary');

//     return new Promise((resolve, reject) => {
//       const uploadStream = cloudinary.uploader.upload_stream(
//         {
//           folder: 'certificates',
//           resource_type: 'raw',
//           public_id: certificateData.policyId,
//         },
//         (error, result) => {
//           if (error) {
//             console.error('❌ Cloudinary upload error:', error);
//             return reject(new Error('Failed to upload PDF to permanent storage.'));
//           }
//           if (result) {
//             console.log(`CERTIFICATE: PDF uploaded to Cloudinary. Final URL: ${result.secure_url}`);
//             resolve(result.secure_url);
//           }
//         }
//       );
//       uploadStream.end(pdfBuffer);
//     });
//   } catch (error) {
//       console.error('❌ Failed to download from PDF.co or upload to Cloudinary:', error);
//       return pdfUrlFromApi;
//   }
// };
















































































// // src/services/document.service.ts

// import axios from 'axios';
// import { v2 as cloudinary } from 'cloudinary';
// import { prisma } from '../lib/prisma';
// import { config } from '../config';

// // Configure Cloudinary with the credentials from our environment.
// // This is done once when the service is initialized.
// cloudinary.config({
//   cloud_name: config.CLOUDINARY_CLOUD_NAME,
//   api_key: config.CLOUDINARY_API_KEY,
//   api_secret: config.CLOUDINARY_API_SECRET,
// });

// /**
//  * Generates an HTML string for the insurance certificate.
//  * In a real-world application, this could use a more advanced templating engine
//  * like Handlebars or EJS for better separation of logic and presentation.
//  * @param data - The data object to populate the certificate template.
//  * @returns A complete HTML string.
//  */
// const getCertificateHtml = (data: {
//   policyId: string;
//   customerName: string;
//   policyType: string;
//   premium: number;
//   coverageDetails: any;
//   issueDate: string;
// }): string => {
//   // Basic CSS for a professional-looking PDF document.
//   const style = `
//     body { 
//       font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
//       color: #333; 
//       margin: 2.5cm;
//       font-size: 11pt;
//     }
//     .container { 
//       border: 1px solid #e0e0e0; 
//       padding: 1.5cm; 
//       border-radius: 8px; 
//       box-shadow: 0 4px 6px rgba(0,0,0,0.1);
//     }
//     h1 { 
//       color: #004a80; 
//       text-align: center; 
//       margin-bottom: 20px; 
//       font-size: 24pt;
//     }
//     h2 { 
//       color: #333; 
//       border-bottom: 2px solid #004a80; 
//       padding-bottom: 8px; 
//       margin-top: 30px; 
//       font-size: 16pt;
//     }
//     p { 
//       line-height: 1.6; 
//       margin: 10px 0;
//     }
//     strong {
//       color: #000;
//     }
//     .footer { 
//       text-align: center; 
//       margin-top: 40px; 
//       font-size: 9pt; 
//       color: #888; 
//     }
//     .details-grid {
//       display: grid;
//       grid-template-columns: 1fr 1fr;
//       gap: 15px;
//     }
//     pre {
//       background-color: #f5f5f5;
//       padding: 15px;
//       border-radius: 5px;
//       white-space: pre-wrap;
//       word-wrap: break-word;
//       font-size: 10pt;
//     }
//   `;

//   // Using a more structured HTML template.
//   return `
//     <html>
//       <head>
//         <meta charset="UTF-8">
//         <style>${style}</style>
//       </head>
//       <body>
//         <div class="container">
//           <h1>Ishimwe Insurance Certificate</h1>
//           <h2>Policy Details</h2>
//           <div class="details-grid">
//             <p><strong>Policy ID:</strong> ${data.policyId}</p>
//             <p><strong>Insured Name:</strong> ${data.customerName}</p>
//             <p><strong>Insurance Type:</strong> ${data.policyType}</p>
//             <p><strong>Premium Paid:</strong> ${data.premium.toLocaleString()} RWF</p>
//             <p><strong>Date of Issue:</strong> ${data.issueDate}</p>
//           </div>
//           <h2>Coverage Summary</h2>
//           <pre>${JSON.stringify(data.coverageDetails, null, 2)}</pre>
//         </div>
//         <div class="footer">
//           This document confirms your insurance policy with Ishimwe Insurance. Valid from the date of issue.
//         </div>
//       </body>
//     </html>
//   `;
// };

// /**
//  * Generates a PDF certificate by calling the PDF.co API,
//  * then uploads the result to Cloudinary for permanent storage.
//  * @param quoteId - The ID of the paid quote record in our database.
//  * @returns The secure, permanent URL of the generated PDF on Cloudinary.
//  */
// export const generateAndUploadCertificate = async (quoteId: string): Promise<string> => {
//   console.log(`CERTIFICATE: Starting API-based generation for quote ID: ${quoteId}`);
  
//   // 1. Fetch the necessary data from our database.
//   const quote = await prisma.quote.findUnique({
//     where: { id: quoteId },
//     include: { user: true },
//   });

//   if (!quote || !quote.user) {
//     throw new Error(`Quote or user not found for certificate generation (Quote ID: ${quoteId}).`);
//   }

//   // 2. Prepare the data payload for the HTML template.
//   const certificateData = {
//     policyId: `POL-${quote.id.toUpperCase().substring(0, 12)}`,
//     customerName: quote.user.fullName || 'Valued Customer',
//     policyType: quote.type.charAt(0).toUpperCase() + quote.type.slice(1), // Capitalize type
//     premium: quote.premium,
//     coverageDetails: quote.details,
//     issueDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
//   };
//   const htmlContent = getCertificateHtml(certificateData);

//   // 3. Generate the PDF using the PDF.co API.
//   let pdfUrlFromApi: string;
//   try {
//     const pdfCoResponse = await axios.post(
//       'https://api.pdf.co/v1/pdf/convert/from/html', 
//       {
//         html: htmlContent,
//         inline: false, // We want PDF.co to host the file temporarily and give us a URL.
//         name: `${certificateData.policyId}.pdf`, // Set the output filename
//       },
//       {
//         headers: {
//           'x-api-key': config.PDF_CO_API_KEY!,
//           'Content-Type': 'application/json',
//         },
//       }
//     );

//     if (pdfCoResponse.data.error) {
//       throw new Error(`PDF.co API Error: ${pdfCoResponse.data.message}`);
//     }
//     pdfUrlFromApi = pdfCoResponse.data.url;
//     console.log(`CERTIFICATE: PDF generated by API. Temporary URL: ${pdfUrlFromApi}`);
//   } catch (error: any) {
//     console.error('❌ PDF.co API request failed:', error.response?.data || error.message);
//     throw new Error('Failed to generate PDF via external API.');
//   }

//   // 4. Download the PDF from its temporary URL and upload it to Cloudinary for permanent storage.
//   try {
//     const pdfBufferResponse = await axios.get(pdfUrlFromApi, { responseType: 'arraybuffer' });
//     const pdfBuffer = Buffer.from(pdfBufferResponse.data, 'binary');

//     return new Promise((resolve, reject) => {
//       const uploadStream = cloudinary.uploader.upload_stream(
//         {
//           folder: 'certificates', // Organizes uploads in a 'certificates' folder in Cloudinary.
//           resource_type: 'raw', // Treat as a raw file, not an image to be transformed.
//           public_id: certificateData.policyId, // Use our policy ID as the filename in Cloudinary.
//         },
//         (error, result) => {
//           if (error) {
//             console.error('❌ Cloudinary upload error:', error);
//             return reject(new Error('Failed to upload PDF to permanent storage.'));
//           }
//           if (result) {
//             console.log(`CERTIFICATE: PDF uploaded to Cloudinary. Final URL: ${result.secure_url}`);
//             resolve(result.secure_url);
//           }
//         }
//       );
//       uploadStream.end(pdfBuffer);
//     });
//   } catch (error) {
//       console.error('❌ Failed to download from PDF.co or upload to Cloudinary:', error);
//       // As a fallback, we return the temporary URL from PDF.co, which is valid for 1 hour.
//       // This is better than returning nothing to the user.
//       return pdfUrlFromApi;
//   }
// };




































// import puppeteer from 'puppeteer';
// import { v2 as cloudinary } from 'cloudinary';
// import { prisma } from '../lib/prisma';
// import { config } from '../config';

// // Configure Cloudinary with the credentials from our environment
// cloudinary.config({
//   cloud_name: config.CLOUDINARY_CLOUD_NAME,
//   api_key: config.CLOUDINARY_API_KEY,
//   api_secret: config.CLOUDINARY_API_SECRET,
// });

// /**
//  * Generates an HTML string for the insurance certificate.
//  * In a real application, this might use a templating engine like EJS or Handlebars.
//  * @param data - The data to populate the certificate with.
//  * @returns An HTML string.
//  */
// const getCertificateHtml = (data: {
//   policyId: string;
//   customerName: string;
//   policyType: string;
//   premium: number;
//   coverageDetails: any;
//   issueDate: string;
// }): string => {
//   // Basic styling for the PDF
//   const style = `
//     body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #333; margin: 40px; }
//     .container { border: 2px solid #005a9c; padding: 30px; border-radius: 10px; }
//     h1 { color: #005a9c; text-align: center; }
//     h2 { color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
//     p { line-height: 1.6; }
//     .footer { text-align: center; margin-top: 40px; font-size: 12px; color: #777; }
//   `;

//   return `
//     <html>
//       <head><style>${style}</style></head>
//       <body>
//         <div class="container">
//           <h1>Ishimwe Insurance Certificate</h1>
//           <h2>Policy Details</h2>
//           <p><strong>Policy ID:</strong> ${data.policyId}</p>
//           <p><strong>Insured Name:</strong> ${data.customerName}</p>
//           <p><strong>Insurance Type:</strong> ${data.policyType}</p>
//           <p><strong>Premium Paid:</strong> ${data.premium.toLocaleString()} RWF</p>
//           <p><strong>Date of Issue:</strong> ${data.issueDate}</p>
//           <h2>Coverage Summary</h2>
//           <p>${JSON.stringify(data.coverageDetails, null, 2)}</p>
//         </div>
//         <div class="footer">
//           This document confirms your policy with Ishimwe Insurance.
//         </div>
//       </body>
//     </html>
//   `;
// };

// /**
//  * Generates a PDF certificate, uploads it to Cloudinary, and returns the URL.
//  * @param quoteId - The ID of the paid quote.
//  * @returns The secure URL of the generated PDF.
//  */
// export const generateAndUploadCertificate = async (quoteId: string): Promise<string> => {
//   console.log(`CERTIFICATE: Starting generation for quote ID: ${quoteId}`);
  
//   // 1. Fetch the necessary data from the database
//   const quote = await prisma.quote.findUnique({
//     where: { id: quoteId },
//     include: { user: true },
//   });

//   if (!quote || !quote.user) {
//     throw new Error('Quote or user not found for certificate generation.');
//   }

//   // 2. Prepare the data for the HTML template
//   const certificateData = {
//     policyId: `POL-${quote.id.toUpperCase().substring(0, 12)}`,
//     customerName: quote.user.fullName || 'Valued Customer',
//     policyType: quote.type,
//     premium: quote.premium,
//     coverageDetails: quote.details,
//     issueDate: new Date().toLocaleDateString('en-GB'),
//   };
//   const htmlContent = getCertificateHtml(certificateData);

//   // 3. Generate the PDF using Puppeteer
//   // Note: On Render, you may need to add build packs for Puppeteer dependencies.
//   const browser = await puppeteer.launch({
//     args: ['--no-sandbox', '--disable-setuid-sandbox'], // Required for running in a container
//   });
//   const page = await browser.newPage();
//   await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
//   const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
//   await browser.close();
//   console.log('CERTIFICATE: PDF buffer created successfully.');

//   // 4. Upload the PDF buffer to Cloudinary
//   return new Promise((resolve, reject) => {
//     const uploadStream = cloudinary.uploader.upload_stream(
//       {
//         folder: 'certificates', // Optional: organize uploads in a folder
//         resource_type: 'raw', // Treat it as a raw file, not an image
//         public_id: certificateData.policyId,
//       },
//       (error, result) => {
//         if (error) {
//           console.error('❌ Cloudinary upload error:', error);
//           return reject(error);
//         }
//         if (result) {
//           console.log(`CERTIFICATE: PDF uploaded to Cloudinary. URL: ${result.secure_url}`);
//           resolve(result.secure_url);
//         }
//       }
//     );
//     uploadStream.end(pdfBuffer);
//   });
// };
