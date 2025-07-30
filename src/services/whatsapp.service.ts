import axios from 'axios';
import { config } from '../config';

const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

export const sendMessage = async (to: string, text: string) => {
  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'text',
        text: { body: text },
      },
      {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ Message sent to ${to}`);
  } catch (error: any) {
    console.error('❌ Error sending WhatsApp message:', error.response?.data || error.message);
  }
};

export const sendDocument = async (to: string, documentUrl: string, caption: string, filename: string) => {
  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        to: to,
        type: 'document',
        document: {
          link: documentUrl, // The public URL of the PDF
          caption: caption,
          filename: filename,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`✅ Document sent to ${to}`);
  } catch (error: any) {
    const errorMessage = error.response?.data?.error?.message || error.message;
    console.error(`❌ Error sending WhatsApp document to ${to}:`, errorMessage);
    throw new Error(`Failed to send WhatsApp document: ${errorMessage}`);
  }
};
