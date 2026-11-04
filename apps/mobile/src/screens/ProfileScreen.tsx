import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Header } from '../components/Header';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { SelectModal, SelectOption } from '../components/ui/SelectModal';
import { ApiClient, CampAssignmentDTO } from '../services/apiClient';
import { AuthStorage } from '../services/authStorage';
import {
  MAHARASHTRA_DISTRICTS,
  BLOOD_GROUPS,
  displayBloodGroup,
  toBloodGroupEnum,
} from '../config/constants';

interface ProfileScreenProps {
  onBack?: () => void;
  onLogout?: () => void;
  campAssignments?: CampAssignmentDTO[];
  isAssignmentsServerVerified?: boolean;
  onOpenOperations?: () => void;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  onBack,
  onLogout,
  campAssignments = [],
  isAssignmentsServerVerified = false,
  onOpenOperations,
}) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  // Form State
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [bloodGroup, setBloodGroup] = useState('O+');
  const [districtCode, setDistrictCode] = useState(521);
  const [cityOrLocality, setCityOrLocality] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [isSearchable, setIsSearchable] = useState(true);

  // Modals
  const [showBloodGroupModal, setShowBloodGroupModal] = useState(false);
  const [showDistrictModal, setShowDistrictModal] = useState(false);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchProfile = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await ApiClient.getProfile();
      if (res.success && res.data) {
        const u = res.data.user || res.data;
        const dp = res.data.donorProfile || u.donorProfile;
        setProfile(res.data);
        setFullName(u.name || dp?.fullName || '');
        setPhoneNumber(u.phoneNumber || '');
        setBloodGroup(displayBloodGroup(dp?.bloodGroup));
        setDistrictCode(dp?.districtCode || 521);
        setCityOrLocality(dp?.cityOrLocality || '');
        setIsAvailable(dp?.isAvailable ?? true);
        setIsSearchable(dp?.isSearchable ?? true);
      } else {
        setMessage({
          text: res.error?.message || 'Failed to load profile.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setMessage({
        text: err.message || 'Network error fetching profile.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handleSave = async () => {
    setMessage(null);
    if (!fullName.trim() || fullName.trim().length < 2) {
      setMessage({ text: 'Full name must be at least 2 characters.', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      const res = await ApiClient.updateProfile({
        fullName: fullName.trim(),
        bloodGroup: toBloodGroupEnum(bloodGroup),
        districtCode,
        stateCode: 27,
        cityOrLocality: cityOrLocality.trim() || undefined,
        isAvailable,
        isSearchable,
      });

      if (res.success) {
        // Update local auth storage
        const user = await AuthStorage.getUser();
        if (user) {
          await AuthStorage.saveUser({
            ...user,
            name: fullName.trim(),
            bloodGroup: toBloodGroupEnum(bloodGroup),
            districtCode,
            cityOrLocality: cityOrLocality.trim() || null,
          });
        }
        setMessage({ text: 'Profile updated successfully!', type: 'success' });
        Alert.alert('Saved', 'Your profile changes have been saved.');
      } else {
        setMessage({
          text: res.error?.message || 'Failed to save changes.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setMessage({
        text: err.message || 'Network error saving changes.',
        type: 'error',
      });
    } finally {
      setSaving(false);
    }
  };

  const bloodGroupOptions: SelectOption[] = BLOOD_GROUPS.map((bg) => ({
    label: bg,
    value: bg,
  }));

  const districtOptions: SelectOption[] = MAHARASHTRA_DISTRICTS.map((d) => ({
    label: d.name,
    value: d.code,
    subtitle: `Code: ${d.code}`,
  }));

  const selectedDistrictName =
    MAHARASHTRA_DISTRICTS.find((d) => d.code === districtCode)?.name || 'Pune';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header subtitle="Donor Profile Management" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {loading ? (
          <ActivityIndicator size="large" color="#DC2626" style={{ marginTop: 40 }} />
        ) : (
          <Card style={styles.card}>
            {/* Header / Avatar */}
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {fullName ? fullName.charAt(0).toUpperCase() : 'D'}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.nameDisplay}>{fullName || 'Voluntary Donor'}</Text>
                <Text style={styles.phoneDisplay}>{phoneNumber}</Text>
              </View>
              <Badge label="ACTIVE" variant="success" size="sm" />
            </View>

            {/* Notification messages */}
            {message && (
              <View
                style={[
                  styles.messageBox,
                  message.type === 'success' ? styles.messageSuccess : styles.messageError,
                ]}
              >
                <Text
                  style={[
                    styles.messageText,
                    message.type === 'success' ? styles.messageSuccessText : styles.messageErrorText,
                  ]}
                >
                  {message.type === 'success' ? '✅ ' : '⚠️ '}
                  {message.text}
                </Text>
              </View>
            )}

            {/* Editable Fields */}
            <View style={styles.formSection}>
              <Input
                label="Full Name *"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Your full legal name"
              />

              {/* Verified Phone - Read Only Note */}
              <View style={styles.readOnlyBlock}>
                <Text style={styles.fieldLabel}>Registered Mobile Number</Text>
                <View style={styles.readOnlyInput}>
                  <Text style={styles.readOnlyText}>{phoneNumber}</Text>
                  <Text style={styles.lockIcon}>🔒 Verified</Text>
                </View>
                <Text style={styles.readOnlyHelper}>
                  Mobile number changes require re-authentication through the demo OTP login flow.
                </Text>
              </View>

              {/* Blood Group Picker */}
              <View style={styles.pickerBlock}>
                <Text style={styles.fieldLabel}>Blood Group</Text>
                <TouchableOpacity
                  style={styles.selectorBtn}
                  onPress={() => setShowBloodGroupModal(true)}
                >
                  <Text style={styles.selectorValue}>{bloodGroup}</Text>
                  <Text style={styles.selectorArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* District Picker */}
              <View style={styles.pickerBlock}>
                <Text style={styles.fieldLabel}>District</Text>
                <TouchableOpacity
                  style={styles.selectorBtn}
                  onPress={() => setShowDistrictModal(true)}
                >
                  <Text style={styles.selectorValue}>{selectedDistrictName}</Text>
                  <Text style={styles.selectorArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              {/* City / Locality */}
              <Input
                label="City / Locality"
                value={cityOrLocality}
                onChangeText={setCityOrLocality}
                placeholder="e.g. Kothrud, Pune"
              />

              {/* Availability Switch */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Donation Availability</Text>
                  <Text style={styles.switchDesc}>
                    Pause when travelling, recovering or temporarily unavailable.
                  </Text>
                </View>
                <Switch
                  value={isAvailable}
                  onValueChange={setIsAvailable}
                  trackColor={{ false: '#D1D5DB', true: '#FCA5A5' }}
                  thumbColor={isAvailable ? '#DC2626' : '#9CA3AF'}
                />
              </View>

              {/* Community Search Switch */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Community Search Visibility</Text>
                  <Text style={styles.switchDesc}>
                    Allow emergency requests to match with your anonymized profile.
                  </Text>
                </View>
                <Switch
                  value={isSearchable}
                  onValueChange={setIsSearchable}
                  trackColor={{ false: '#D1D5DB', true: '#FCA5A5' }}
                  thumbColor={isSearchable ? '#DC2626' : '#9CA3AF'}
                />
              </View>

              {/* Operations Workspace Access (Conditional for Staff / Coordinators and strictly Server-Verified) */}
              {campAssignments && campAssignments.length > 0 && isAssignmentsServerVerified && onOpenOperations && (
                <TouchableOpacity style={styles.opsAccessCard} onPress={onOpenOperations}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Text style={{ fontSize: 20 }}>🏥</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.opsAccessTitle}>Camp Operations Workspace</Text>
                      <Text style={styles.opsAccessDesc}>
                        {campAssignments.length} active drive assignment{campAssignments.length > 1 ? 's' : ''} (Coordinator)
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.opsAccessArrow}>→</Text>
                </TouchableOpacity>
              )}

              {/* Save Button */}
              <Button
                title="Save Profile Changes"
                onPress={handleSave}
                variant="primary"
                size="lg"
                loading={saving}
                style={{ marginTop: 18 }}
              />

              {onBack && (
                <Button
                  title="Back to Dashboard"
                  onPress={onBack}
                  variant="outline"
                  size="md"
                  style={{ marginTop: 10 }}
                />
              )}
            </View>
          </Card>
        )}
      </ScrollView>

      {/* Select Modals */}
      <SelectModal
        visible={showBloodGroupModal}
        title="Select Blood Group"
        options={bloodGroupOptions}
        selectedValue={bloodGroup}
        onSelect={(val) => setBloodGroup(val)}
        onClose={() => setShowBloodGroupModal(false)}
        searchable={false}
      />

      <SelectModal
        visible={showDistrictModal}
        title="Select District"
        options={districtOptions}
        selectedValue={districtCode}
        onSelect={(val) => setDistrictCode(val)}
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
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    padding: 18,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    marginBottom: 16,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  nameDisplay: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  phoneDisplay: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  messageBox: {
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
  },
  messageSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  messageError: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  messageText: {
    fontSize: 13,
    fontWeight: '600',
  },
  messageSuccessText: {
    color: '#065F46',
  },
  messageErrorText: {
    color: '#B91C1C',
  },
  formSection: {
    gap: 12,
  },
  readOnlyBlock: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  readOnlyInput: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readOnlyText: {
    fontSize: 14,
    color: '#4B5563',
    fontWeight: '600',
  },
  lockIcon: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  readOnlyHelper: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 4,
    lineHeight: 15,
  },
  pickerBlock: {
    marginBottom: 14,
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
  switchTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  switchDesc: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 15,
  },
  opsAccessCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 12,
    padding: 14,
    marginTop: 16,
  },
  opsAccessTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E3A8A',
  },
  opsAccessDesc: {
    fontSize: 11,
    color: '#3B82F6',
    marginTop: 2,
  },
  opsAccessArrow: {
    fontSize: 18,
    color: '#2563EB',
    fontWeight: '800',
    marginLeft: 8,
  },
});

