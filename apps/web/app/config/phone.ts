/**
 * Formats a phone number for consistent, user-friendly display.
 * Guarantees that "+91" is never duplicated.
 */
export function formatPhoneNumber(phone?: string | null): string {
  if (!phone) return '';
  const cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');

  // If already starts with +91, return in standard formatted form
  if (cleaned.startsWith('+91')) {
    const national = cleaned.slice(3);
    return `+91 ${national}`;
  }

  // If starts with 91 followed by 10 digits
  if (/^91[6-9]\d{9}$/.test(cleaned)) {
    return `+91 ${cleaned.slice(2)}`;
  }

  // If standard 10 digits
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91 ${cleaned}`;
  }

  return cleaned;
}

/**
 * Validates whether an input represents a valid 10-digit Indian mobile number.
 */
export function isValidIndianMobile(phone: string): boolean {
  if (!phone) return false;
  const cleaned = phone.trim().replace(/[\s\-\(\)\.]/g, '');
  return /^(?:\+91|91)?[6-9]\d{9}$/.test(cleaned);
}
