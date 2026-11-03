import dotenv from 'dotenv';
import path from 'path';

// Load .env from workspace root if present, or local directory
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

export interface WhatsAppConfig {
  accessToken?: string;
  phoneNumberId?: string;
  businessAccountId?: string;
  verifyToken?: string;
  appSecret?: string;
  isConfigured: boolean;
}

export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  directUrl?: string;
  webOrigin: string;
  eraktkoshBaseUrl: string;
  demoOtp: string;
  allowDemoOtp: boolean;
  whatsapp: WhatsAppConfig;
}

function requireEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (!value) {
    throw new Error(`[Configuration Error] Missing required environment variable: ${key}`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const allowDemoOtp = process.env.ALLOW_DEMO_OTP === 'true';

// CRITICAL SECURITY GUARD: Refuse to start in production if fixed demo OTP is enabled
if (nodeEnv === 'production' && allowDemoOtp) {
  throw new Error(
    '[FATAL SECURITY GUARD] Demo OTP authentication CANNOT be enabled in production environments (ALLOW_DEMO_OTP=true with NODE_ENV=production).'
  );
}

const whatsappToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || undefined;
const whatsappPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || undefined;

export const config: AppConfig = {
  nodeEnv,
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: requireEnv('DATABASE_URL'),
  directUrl: process.env.DIRECT_URL,
  webOrigin: process.env.WEB_ORIGIN || 'http://localhost:3000',
  eraktkoshBaseUrl:
    process.env.ERAKTKOSH_BASE_URL ||
    'https://eraktkosh.mohfw.gov.in/eraktkoshPortal/eraktkosh',
  demoOtp: process.env.DEMO_OTP || '123456',
  allowDemoOtp,
  whatsapp: {
    accessToken: whatsappToken,
    phoneNumberId: whatsappPhoneId,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() || undefined,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim() || undefined,
    appSecret: process.env.WHATSAPP_APP_SECRET?.trim() || undefined,
    isConfigured: Boolean(whatsappToken && whatsappPhoneId),
  },
};
