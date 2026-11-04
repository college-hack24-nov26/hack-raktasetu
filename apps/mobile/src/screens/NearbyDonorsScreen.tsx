import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Header } from '../components/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SelectModal, SelectOption } from '../components/ui/SelectModal';
import { ApiClient } from '../services/apiClient';
import {
  MAHARASHTRA_DISTRICTS,
  BLOOD_GROUPS,
  displayBloodGroup,
  toBloodGroupEnum,
} from '../config/constants';

interface NearbyDonorsScreenProps {
  onNavigateRequestWithGroup?: (bloodGroup: string) => void;
}

export const NearbyDonorsScreen: React.FC<NearbyDonorsScreenProps> = ({
  onNavigateRequestWithGroup,
}) => {
  const [selectedDistrictCode, setSelectedDistrictCode] = useState<number>(521); // Pune default
  const [selectedBloodGroup, setSelectedBloodGroup] = useState<string>('O+');
  const [localityQuery, setLocalityQuery] = useState('');

  // Modals
  const [showDistrictModal, setShowDistrictModal] = useState(false);
  const [showBloodGroupModal, setShowBloodGroupModal] = useState(false);

  const [donors, setDonors] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSearch = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSearched(true);

    try {
      const res = await ApiClient.discoverDonors({
        districtCode: selectedDistrictCode,
        bloodGroup: toBloodGroupEnum(selectedBloodGroup),
        cityOrLocality: localityQuery.trim() || undefined,
        stateCode: 27,
      });

      if (res.success && Array.isArray(res.data)) {
        setDonors(res.data);
      } else {
        setDonors([]);
        if (res.error?.message) setErrorMsg(res.error.message);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to search nearby donors.');
      setDonors([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleSearch();
  }, [selectedDistrictCode, selectedBloodGroup]);

  const districtOptions: SelectOption[] = MAHARASHTRA_DISTRICTS.map((d) => ({
    label: d.name,
    value: d.code,
    subtitle: `District Code: ${d.code}`,
  }));

  const bloodGroupOptions: SelectOption[] = BLOOD_GROUPS.map((bg) => ({
    label: bg,
    value: bg,
  }));

  const selectedDistrictName =
    MAHARASHTRA_DISTRICTS.find((d) => d.code === selectedDistrictCode)?.name || 'Pune';

  return (
    <View style={styles.container}>
      <Header subtitle="Community Voluntary Donor Discovery" />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Search Criteria Card */}
        <Card style={styles.filterCard} variant="elevated">
          <Text style={styles.filterTitle}>Search Voluntary Donors</Text>

          <View style={styles.row}>
            {/* District Selector */}
            <View style={[styles.pickerBlock, { flex: 2 }]}>
              <Text style={styles.pickerLabel}>District</Text>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setShowDistrictModal(true)}
              >
                <Text style={styles.pickerValue}>📍 {selectedDistrictName}</Text>
                <Text style={styles.pickerArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Blood Group Selector */}
            <View style={[styles.pickerBlock, { flex: 1 }]}>
              <Text style={styles.pickerLabel}>Blood Group</Text>
              <TouchableOpacity
                style={styles.pickerBtn}
                onPress={() => setShowBloodGroupModal(true)}
              >
                <Text style={styles.pickerValue}>🩸 {selectedBloodGroup}</Text>
                <Text style={styles.pickerArrow}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Locality Input */}
          <Input
            label="Filter by City or Locality (Optional)"
            placeholder="e.g. Kothrud, Hadapsar, Shivaji Nagar"
            value={localityQuery}
            onChangeText={setLocalityQuery}
            onSubmitEditing={handleSearch}
          />

          <Button
            title="Search Donors"
            onPress={handleSearch}
            variant="primary"
            loading={loading}
            icon="👥"
          />
        </Card>

        {/* Privacy & Safety Guarantee Banner */}
        <View style={styles.privacyBanner}>
          <Text style={styles.privacyTitle}>🔒 Strict Donor Privacy Protections</Text>
          <Text style={styles.privacyText}>
            • Donor names are anonymized ("Rahul S.") to prevent unsolicited contacts.
          </Text>
          <Text style={styles.privacyText}>
            • Direct phone numbers are never shared publicly. Contact details unlock only when a donor independently accepts an official blood request.
          </Text>
          <Text style={styles.privacyText}>
            • GPS coordinates and movement routes are never exposed in community discovery.
          </Text>
        </View>

        {/* Results Header */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsHeading}>
            Available {selectedBloodGroup} Donors in {selectedDistrictName}
          </Text>
          <Badge
            label={`${donors.length} AVAILABLE`}
            variant={donors.length > 0 ? 'success' : 'neutral'}
            size="sm"
          />
        </View>

        {errorMsg && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          </View>
        )}

        {loading ? (
          <ActivityIndicator size="large" color="#DC2626" style={{ marginTop: 32 }} />
        ) : donors.length === 0 && searched ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyTitle}>No Donors Found in this Area</Text>
            <Text style={styles.emptyDesc}>
              No voluntary {selectedBloodGroup} donors in {selectedDistrictName} are currently marked as available for public matching.
            </Text>
            {onNavigateRequestWithGroup && (
              <Button
                title="Create Emergency Blood Request"
                onPress={() => onNavigateRequestWithGroup(selectedBloodGroup)}
                variant="primary"
                size="sm"
                style={{ marginTop: 14 }}
              />
            )}
          </Card>
        ) : (
          <View style={styles.donorsList}>
            {donors.map((donor) => (
              <Card key={donor.id} style={styles.donorCard} variant="elevated">
                <View style={styles.donorTopRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {donor.displayName ? donor.displayName.charAt(0).toUpperCase() : 'D'}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.donorName}>{donor.displayName}</Text>
                    <Text style={styles.donorLocation}>
                      📍 {donor.cityOrLocality ? `${donor.cityOrLocality}, ` : ''}
                      {selectedDistrictName}
                    </Text>
                    {donor.primaryCentreName && (
                      <Text style={styles.centreAffiliation}>
                        Affiliated with: {donor.primaryCentreName}
                      </Text>
                    )}
                  </View>
                  <View style={styles.bloodBadge}>
                    <Text style={styles.bloodBadgeText}>
                      {displayBloodGroup(donor.bloodGroup)}
                    </Text>
                  </View>
                </View>

                <View style={styles.donorFooter}>
                  <Badge label="AVAILABLE TO ASSIST" variant="success" size="sm" />
                  {onNavigateRequestWithGroup && (
                    <TouchableOpacity
                      style={styles.inviteBtn}
                      onPress={() => onNavigateRequestWithGroup(selectedBloodGroup)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.inviteBtnText}>Create Request to Match →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Card>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Select Modals */}
      <SelectModal
        visible={showDistrictModal}
        title="Select District"
        options={districtOptions}
        selectedValue={selectedDistrictCode}
        onSelect={(val) => setSelectedDistrictCode(val)}
        onClose={() => setShowDistrictModal(false)}
        searchable={true}
      />

      <SelectModal
        visible={showBloodGroupModal}
        title="Select Blood Group"
        options={bloodGroupOptions}
        selectedValue={selectedBloodGroup}
        onSelect={(val) => setSelectedBloodGroup(val)}
        onClose={() => setShowBloodGroupModal(false)}
        searchable={false}
      />
    </View>
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
  filterCard: {
    padding: 16,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  pickerBlock: {
    marginBottom: 10,
  },
  pickerLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  pickerBtn: {
    height: 44,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  pickerArrow: {
    fontSize: 10,
    color: '#6B7280',
  },
  privacyBanner: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  privacyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E40AF',
    marginBottom: 6,
  },
  privacyText: {
    fontSize: 11,
    color: '#1E3A8A',
    lineHeight: 16,
    marginBottom: 2,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 12,
  },
  resultsHeading: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    maxWidth: 240,
  },
  errorBanner: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    marginTop: 12,
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 17,
  },
  donorsList: {
    gap: 12,
  },
  donorCard: {
    padding: 14,
  },
  donorTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  donorName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  donorLocation: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  centreAffiliation: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 1,
  },
  bloodBadge: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  bloodBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#DC2626',
  },
  donorFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  inviteBtn: {
    paddingVertical: 4,
  },
  inviteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
});

