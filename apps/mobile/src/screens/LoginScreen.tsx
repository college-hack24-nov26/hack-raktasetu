import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { ApiClient } from '../services/apiClient';
import { getApiBaseUrl, setCustomApiBaseUrl } from '../config/api';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';

interface LoginScreenProps {
  onLoginSuccess: () => void;
  onBack: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onLoginSuccess, onBack }) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [demoNotice, setDemoNotice] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Developer settings toggle for custom API base URL
  const [showDevSettings, setShowDevSettings] = useState(false);
  const [customUrl, setCustomUrl] = useState(getApiBaseUrl());

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const validateIndianMobile = (num: string): boolean => {
    const clean = num.replace(/\D/g, '');
    return /^[6-9]\d{9}$/.test(clean);
  };

  const handleSendOtp = async () => {
    setErrorMessage(null);
    const cleanNum = phoneNumber.trim().replace(/\D/g, '');

    if (!cleanNum || cleanNum.length !== 10) {
      setErrorMessage('Please enter a 10-digit Indian mobile number.');
      return;
    }

    if (!validateIndianMobile(cleanNum)) {
      setErrorMessage('Invalid mobile number. Indian numbers must start with 6, 7, 8, or 9.');
      return;
    }

    setLoading(true);
    try {
      const res = await ApiClient.sendOtp(cleanNum);
      if (res.success) {
        setDemoNotice(res.data?.demoNotice || 'Demo OTP: 123456');
        setOtp('123456'); // Pre-fill for convenience in demo mode
        setStep('OTP');
        setResendCooldown(30);
      } else {
        setErrorMessage(res.error?.message || 'Failed to send verification code.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error sending verification code.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    setErrorMessage(null);
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length < 4) {
      setErrorMessage('Please enter the 6-digit verification code.');
      return;
    }

    setLoading(true);
    try {
      const cleanNum = phoneNumber.trim().replace(/\D/g, '');
      const res = await ApiClient.verifyOtp(cleanNum, cleanOtp);
      if (res.success && res.data?.token) {
        onLoginSuccess();
      } else {
        setErrorMessage(res.error?.message || 'Verification failed. Please check your code.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error verifying code.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = () => {
    if (resendCooldown === 0) {
      handleSendOtp();
    }
  };

  const handleSaveDevUrl = () => {
    setCustomApiBaseUrl(customUrl.trim());
    setErrorMessage(null);
    alert(`API Base URL set to: ${getApiBaseUrl()}`);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>← Back to Home</Text>
        </TouchableOpacity>
        <Badge label="DEMO MODE" variant="warning" />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.brandRow}>
          <View style={styles.logoBadge}>
            <Text style={styles.logoIcon}>🩸</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>RaktaSetu</Text>
            <Text style={styles.brandSubtitle}>Government & Community Blood Grid</Text>
          </View>
        </View>

        <Card style={styles.card}>
          <Text style={styles.heading}>
            {step === 'PHONE' ? 'Sign In / Register' : 'Verify Mobile Number'}
          </Text>
          <Text style={styles.caption}>
            {step === 'PHONE'
              ? 'Enter your Indian mobile number to access your donor dashboard, response history, and live dispatch.'
              : `A verification code was requested for +91 ${phoneNumber}.`}
          </Text>

          {/* Demo Notice Banner */}
          <View style={styles.demoBanner}>
            <Text style={styles.demoBannerTitle}>ℹ️ Demo Authentication Environment</Text>
            <Text style={styles.demoBannerDesc}>
              This platform uses an automated sandbox OTP. SMS delivery is simulated. Use the fixed code{' '}
              <Text style={{ fontWeight: '800' }}>123456</Text> to verify instantly.
            </Text>
          </View>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {step === 'PHONE' ? (
            <View style={styles.formGroup}>
              <Text style={styles.label}>Mobile Number</Text>
              <View style={styles.inputWrapper}>
                <Text style={styles.prefix}>+91</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter 10-digit number"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="phone-pad"
                  value={phoneNumber}
                  onChangeText={(val) => {
                    setPhoneNumber(val);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  maxLength={10}
                  editable={!loading}
                  autoFocus
                />
              </View>
              <Text style={styles.helperText}>
                We will check for an existing donor profile or prompt registration for first-time donors.
              </Text>

              <Button
                title="Get Verification Code"
                onPress={handleSendOtp}
                loading={loading}
                style={{ marginTop: 8 }}
              />
            </View>
          ) : (
            <View style={styles.formGroup}>
              <Text style={styles.label}>6-Digit Verification Code</Text>
              <TextInput
                style={styles.otpInput}
                placeholder="123456"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                value={otp}
                onChangeText={(val) => {
                  setOtp(val);
                  if (errorMessage) setErrorMessage(null);
                }}
                maxLength={6}
                editable={!loading}
                autoFocus
              />

              <Button
                title="Verify & Continue"
                onPress={handleVerifyOtp}
                loading={loading}
                style={{ marginTop: 4 }}
              />

              <View style={styles.resendRow}>
                {resendCooldown > 0 ? (
                  <Text style={styles.resendCooldownText}>
                    Resend code in {resendCooldown}s
                  </Text>
                ) : (
                  <TouchableOpacity onPress={handleResend} disabled={loading}>
                    <Text style={styles.resendLinkText}>Resend Verification Code</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  onPress={() => {
                    setStep('PHONE');
                    setErrorMessage(null);
                  }}
                  disabled={loading}
                >
                  <Text style={styles.changePhoneText}>Change Number</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Card>

        {/* Developer Network Configuration */}
        <TouchableOpacity
          style={styles.devToggle}
          onPress={() => setShowDevSettings(!showDevSettings)}
        >
          <Text style={styles.devToggleText}>
            ⚙️ {showDevSettings ? 'Hide' : 'Configure'} API Base URL ({getApiBaseUrl()})
          </Text>
        </TouchableOpacity>

        {showDevSettings && (
          <View style={styles.devSettingsCard}>
            <Text style={styles.devSettingsTitle}>Developer API Endpoint</Text>
            <Text style={styles.devSettingsDesc}>
              Update target API base URL for physical Android hardware testing or emulators.
            </Text>
            <TextInput
              style={styles.devInput}
              value={customUrl}
              onChangeText={setCustomUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.devBtnRow}>
              <TouchableOpacity style={styles.devSaveBtn} onPress={handleSaveDevUrl}>
                <Text style={styles.devSaveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.devPresetBtn}
                onPress={() => {
                  setCustomUrl('http://10.0.2.2:4000/api/v1');
                  setCustomApiBaseUrl('http://10.0.2.2:4000/api/v1');
                }}
              >
                <Text style={styles.devPresetBtnText}>10.0.2.2</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.devPresetBtn}
                onPress={() => {
                  setCustomUrl('http://localhost:4000/api/v1');
                  setCustomApiBaseUrl('http://localhost:4000/api/v1');
                }}
              >
                <Text style={styles.devPresetBtnText}>localhost</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backBtnText: {
    fontSize: 14,
    color: '#991B1B',
    fontWeight: '700',
  },
  content: {
    padding: 20,
    justifyContent: 'center',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 12,
  },
  logoBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoIcon: {
    fontSize: 24,
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  card: {
    padding: 20,
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  caption: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 19,
    marginBottom: 16,
  },
  demoBanner: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  demoBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
    marginBottom: 3,
  },
  demoBannerDesc: {
    fontSize: 11,
    color: '#1E3A8A',
    lineHeight: 16,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600',
  },
  formGroup: {
    gap: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
  },
  prefix: {
    fontSize: 15,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 15,
    color: '#0F172A',
  },
  helperText: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: -4,
  },
  otpInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    height: 52,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    fontWeight: '800',
    color: '#0F172A',
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  resendCooldownText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  resendLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  changePhoneText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  devToggle: {
    marginTop: 20,
    alignItems: 'center',
  },
  devToggleText: {
    fontSize: 12,
    color: '#94A3B8',
    textDecorationLine: 'underline',
  },
  devSettingsCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  devSettingsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 4,
  },
  devSettingsDesc: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
  },
  devInput: {
    height: 38,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#0F172A',
    marginBottom: 10,
  },
  devBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  devSaveBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  devSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  devPresetBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  devPresetBtnText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
});
