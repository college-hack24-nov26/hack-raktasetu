import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Header } from '../components/Header';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { SelectModal, SelectOption } from '../components/ui/SelectModal';
import { ApiClient } from '../services/apiClient';
import { AuthStorage } from '../services/authStorage';
import {
  MAHARASHTRA_DISTRICTS,
  BLOOD_GROUPS,
  toBloodGroupEnum,
} from '../config/constants';

interface DonorRegistrationScreenProps {
  onRegistrationSuccess: () => void;
  onCancel?: () => void;
}

export const DonorRegistrationScreen: React.FC<DonorRegistrationScreenProps> = ({
  onRegistrationSuccess,
  onCancel,
}) => {
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('1998-05-15'); // Sensible default
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>('O+');
  const [selectedDistrictCode, setSelectedDistrictCode] = useState<number>(521); // Pune default
  const [cityOrLocality, setCityOrLocality] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [consentToSearch, setConsentToSearch] = useState(true);

  // Modal pickers
  const [showBloodGroupModal, setShowBloodGroupModal] = useState(false);
  const [showDistrictModal, setShowDistrictModal] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const bloodGroupOptions: SelectOption[] = BLOOD_GROUPS.map((bg) => ({
    label: bg,
    value: bg,
  }));

  const districtOptions: SelectOption[] = MAHARASHTRA_DISTRICTS.map((d) => ({
    label: d.name,
    value: d.code,
    subtitle: `District Code: ${d.code}`,
  }));

  const selectedDistrictName =
    MAHARASHTRA_DISTRICTS.find((d) => d.code === selectedDistrictCode)?.name || 'Pune';

  const handleSubmit = async () => {
    setErrorMessage(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setErrorMessage('Full name must be at least 2 characters long.');
      return;
    }

    if (!dob.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dob.trim())) {
      setErrorMessage('Date of birth must be in YYYY-MM-DD format.');
      return;
    }

    const birthDate = new Date(dob.trim());
    if (isNaN(birthDate.getTime())) {
      setErrorMessage('Invalid date of birth.');
      return;
    }

    const age = Math.floor(
      (Date.now() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
    );
    if (age < 18 || age > 65) {
      setErrorMessage(
        `Donors must be between 18 and 65 years old. Calculated age is ${age} years.`
      );
      return;
    }

    setLoading(true);
    try {
      const res = await ApiClient.registerDonor({
        fullName: fullName.trim(),
        dateOfBirth: new Date(dob.trim()).toISOString(),
        bloodGroup: toBloodGroupEnum(selectedBloodGroup),
        districtCode: selectedDistrictCode,
        stateCode: 27,
        cityOrLocality: cityOrLocality.trim() || undefined,
        isAvailable,
        consentToSearch,
        consentVersion: 'v1.0',
      });

      if (res.success) {
        // Refresh local user profile
        const user = await AuthStorage.getUser();
        if (user) {
          await AuthStorage.saveUser({
            ...user,
            name: fullName.trim(),
            bloodGroup: toBloodGroupEnum(selectedBloodGroup),
            districtCode: selectedDistrictCode,
            cityOrLocality: cityOrLocality.trim() || null,
          });
        }
        Alert.alert(
          'Registration Complete',
          'Your donor profile has been registered successfully on RaktaSetu.',
          [{ text: 'Continue', onPress: onRegistrationSuccess }]
        );
      } else {
        setErrorMessage(
          res.error?.message || 'Failed to complete registration. Please check fields.'
        );
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error during registration.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header subtitle="Voluntary Donor Registration" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Card style={styles.card}>
          <Text style={styles.heading}>Register Donor Profile</Text>
          <Text style={styles.subheading}>
            Connect your blood type with patients and hospitals in clinical need.
          </Text>

          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {/* Full Name */}
          <Input
            label="Full Name *"
            placeholder="e.g. Ramesh Kulkarni"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
          />

          {/* Date of Birth */}
          <Input
            label="Date of Birth (YYYY-MM-DD) *"
            placeholder="1998-05-15"
            value={dob}
            onChangeText={setDob}
            helper="Eligible donors must be between 18 and 65 years old."
            keyboardType="numbers-and-punctuation"
          />

          {/* Blood Group Picker */}
          <View style={styles.pickerSection}>
            <Text style={styles.fieldLabel}>Blood Group *</Text>
            <TouchableOpacity
              style={styles.selectorBtn}
              onPress={() => setShowBloodGroupModal(true)}
            >
              <Text style={styles.selectorValue}>{selectedBloodGroup}</Text>
              <Text style={styles.selectorArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* District Picker */}
          <View style={styles.pickerSection}>
            <Text style={styles.fieldLabel}>Home / Primary District *</Text>
            <TouchableOpacity
              style={styles.selectorBtn}
              onPress={() => setShowDistrictModal(true)}
            >
              <Text style={styles.selectorValue}>{selectedDistrictName}</Text>
              <Text style={styles.selectorArrow}>▼</Text>
            </TouchableOpacity>
          </View>

          {/* Locality */}
          <Input
            label="City, Town or Locality"
            placeholder="e.g. Kothrud, Shivaji Nagar"
            value={cityOrLocality}
            onChangeText={setCityOrLocality}
          />

          {/* Availability Switch */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Ready to Donate</Text>
              <Text style={styles.switchSubtext}>
                Mark yourself as active for urgent requests nearby.
              </Text>
            </View>
            <Switch
              value={isAvailable}
              onValueChange={setIsAvailable}
              trackColor={{ false: '#D1D5DB', true: '#FCA5A5' }}
              thumbColor={isAvailable ? '#DC2626' : '#9CA3AF'}
            />
          </View>

          {/* Consent to Community Search Switch */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Consent to Community Search</Text>
              <Text style={styles.switchSubtext}>
                Allow patient search queries to view your anonymized donor card ("Ramesh K.") and invite you. Your phone number is never disclosed without your consent.
              </Text>
            </View>
            <Switch
              value={consentToSearch}
              onValueChange={setConsentToSearch}
              trackColor={{ false: '#D1D5DB', true: '#FCA5A5' }}
              thumbColor={consentToSearch ? '#DC2626' : '#9CA3AF'}
            />
          </View>

          {/* Submit */}
          <Button
            title="Complete Registration"
            onPress={handleSubmit}
            variant="primary"
            loading={loading}
            size="lg"
            style={{ marginTop: 14 }}
          />

          {onCancel && (
            <Button
              title="Cancel"
              onPress={onCancel}
              variant="ghost"
              size="md"
              style={{ marginTop: 8 }}
            />
          )}
        </Card>
      </ScrollView>

      {/* Select Modals */}
      <SelectModal
        visible={showBloodGroupModal}
        title="Select Blood Group"
        options={bloodGroupOptions}
        selectedValue={selectedBloodGroup}
        onSelect={(val) => setSelectedBloodGroup(val)}
        onClose={() => setShowBloodGroupModal(false)}
        searchable={false}
      />

      <SelectModal
        visible={showDistrictModal}
        title="Select District"
        options={districtOptions}
        selectedValue={selectedDistrictCode}
        onSelect={(val) => setSelectedDistrictCode(val)}
        onClose={() => setShowDistrictModal(false)}
        searchable={true}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  card: {
    padding: 20,
  },
  heading: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  subheading: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
    fontWeight: '600',
  },
  pickerSection: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  selectorBtn: {
    height: 48,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectorValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  selectorArrow: {
    fontSize: 12,
    color: '#6B7280',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    gap: 12,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  switchSubtext: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 15,
  },
});

