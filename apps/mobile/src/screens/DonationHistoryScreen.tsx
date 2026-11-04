import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  Platform,
} from 'react-native';
import { Header } from '../components/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { ApiClient } from '../services/apiClient';
import { displayBloodGroup } from '../config/constants';

interface DonationHistoryScreenProps {
  onBack?: () => void;
  onNavigateDonate?: () => void;
}

export const DonationHistoryScreen: React.FC<DonationHistoryScreenProps> = ({
  onBack,
  onNavigateDonate,
}) => {
  const [donations, setDonations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedDonation, setSelectedDonation] = useState<any | null>(null);

  const fetchHistory = async () => {
    try {
      const res = await ApiClient.getDonations();
      if (res.success && Array.isArray(res.data)) {
        setDonations(res.data);
      }
    } catch (err) {
      console.warn('Failed to fetch donation history:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory();
  };

  return (
    <View style={styles.container}>
      <Header subtitle="Authoritative Donation Records" />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.summaryBanner}>
          <Text style={styles.summaryTitle}>Verified Clinical Records</Text>
          <Text style={styles.summaryDesc}>
            Official logs of your voluntary blood donations conducted at certified collection camps and blood centres.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#DC2626" style={{ marginTop: 40 }} />
        ) : donations.length === 0 ? (
          <Card style={styles.emptyCard}>
            <EmptyState
              icon="📜"
              title="No Recorded Donations Yet"
              description="When you participate in a registered RaktaSetu blood drive or walk-in donation, your verified record will appear here."
              actionTitle={onNavigateDonate ? 'Find Blood Camps & Centres' : undefined}
              onAction={onNavigateDonate}
            />
          </Card>
        ) : (
          <View style={styles.donationList}>
            {donations.map((item) => {
              const camp = item.camp;
              const centre = camp?.bloodCentre;
              const unit = item.collectionUnit;
              const dateStr = item.performedAt
                ? new Date(item.performedAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—';

              return (
                <Card key={item.id} style={styles.donationCard} variant="elevated">
                  <View style={styles.cardTopRow}>
                    <View style={styles.bloodGroupBadge}>
                      <Text style={styles.bloodGroupText}>
                        {displayBloodGroup(item.bloodGroup)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.campTitle}>
                        {camp?.title || 'Voluntary Blood Drive'}
                      </Text>
                      <Text style={styles.centreName}>
                        {centre?.hospitalName || camp?.organizerName || 'Certified Centre'}
                      </Text>
                    </View>
                    <Badge label={item.outcome || 'COMPLETED'} variant="success" size="sm" />
                  </View>

                  <View style={styles.metaGrid}>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Date</Text>
                      <Text style={styles.metaValue}>{dateStr}</Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Volume</Text>
                      <Text style={styles.metaValue}>
                        {item.volumeMl ? `${item.volumeMl} ml` : '350 ml (standard)'}
                      </Text>
                    </View>
                    <View style={styles.metaItem}>
                      <Text style={styles.metaLabel}>Type</Text>
                      <Text style={styles.metaValue}>
                        {item.donationType?.replace('_', ' ') || 'Whole Blood'}
                      </Text>
                    </View>
                  </View>

                  {unit?.bagIdentifier && (
                    <View style={styles.bagTag}>
                      <Text style={styles.bagLabel}>Batch Barcode Ref: </Text>
                      <Text style={styles.bagValue}>{unit.bagIdentifier}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={styles.certificateBtn}
                    onPress={() => setSelectedDonation(item)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.certificateBtnText}>🏅 View Digital Certificate</Text>
                  </TouchableOpacity>
                </Card>
              );
            })}
          </View>
        )}

        {onBack && (
          <Button
            title="Back to Dashboard"
            onPress={onBack}
            variant="ghost"
            style={{ marginTop: 20 }}
          />
        )}
      </ScrollView>

      {/* Digital Certificate Modal */}
      <Modal visible={!!selectedDonation} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.certContainer}>
          <View style={styles.certHeader}>
            <Text style={styles.certHeaderTitle}>Certificate of Appreciation</Text>
            <TouchableOpacity
              onPress={() => setSelectedDonation(null)}
              style={styles.certCloseBtn}
            >
              <Text style={styles.certCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          {selectedDonation && (
            <ScrollView contentContainerStyle={styles.certBody}>
              <View style={styles.certFrame}>
                <Text style={styles.certSeal}>🏅</Text>
                <Text style={styles.certOrg}>RAKTASETU DONOR NETWORK</Text>
                <Text style={styles.certHeading}>Certificate of Appreciation</Text>
                <Text style={styles.certSub}>
                  This is proudly presented in recognition of voluntary blood donation
                </Text>

                <View style={styles.certDivider} />

                <Text style={styles.certDetailsText}>
                  For selflessly donating life-saving blood at
                </Text>
                <Text style={styles.certCampName}>
                  {selectedDonation.camp?.title || 'Voluntary Donation Drive'}
                </Text>
                <Text style={styles.certCentreName}>
                  Associated Centre: {selectedDonation.camp?.bloodCentre?.hospitalName || 'Verified Regional Blood Centre'}
                </Text>

                <View style={styles.certInfoRow}>
                  <View style={styles.certInfoCol}>
                    <Text style={styles.certInfoLabel}>Blood Group</Text>
                    <Text style={styles.certInfoValue}>
                      {displayBloodGroup(selectedDonation.bloodGroup)}
                    </Text>
                  </View>
                  <View style={styles.certInfoCol}>
                    <Text style={styles.certInfoLabel}>Date</Text>
                    <Text style={styles.certInfoValue}>
                      {new Date(selectedDonation.performedAt).toLocaleDateString('en-IN')}
                    </Text>
                  </View>
                  <View style={styles.certInfoCol}>
                    <Text style={styles.certInfoLabel}>Batch Reference</Text>
                    <Text style={styles.certInfoValue}>
                      {selectedDonation.collectionUnit?.bagIdentifier || selectedDonation.id.slice(0, 8)}
                    </Text>
                  </View>
                </View>

                <View style={styles.certDivider} />

                <Text style={styles.certQuote}>
                  "Every voluntary blood donor is a hero who connects clinical hope with human healing."
                </Text>
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
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
  summaryBanner: {
    marginBottom: 14,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  summaryDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 16,
  },
  emptyCard: {
    marginTop: 20,
    padding: 20,
  },
  donationList: {
    gap: 12,
  },
  donationCard: {
    padding: 16,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  bloodGroupBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  bloodGroupText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#DC2626',
  },
  campTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  centreName: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  metaGrid: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    marginBottom: 10,
  },
  metaItem: {
    flex: 1,
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 2,
  },
  metaValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
  },
  bagTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 8,
  },
  bagLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  bagValue: {
    fontSize: 11,
    color: '#111827',
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  certificateBtn: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  certificateBtnText: {
    color: '#92400E',
    fontSize: 13,
    fontWeight: '700',
  },
  certContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  certHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  certHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  certCloseBtn: {
    padding: 4,
  },
  certCloseText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '700',
  },
  certBody: {
    padding: 20,
    alignItems: 'center',
  },
  certFrame: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#FDE68A',
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  certSeal: {
    fontSize: 48,
    marginBottom: 8,
  },
  certOrg: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B91C1C',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  certHeading: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: 6,
  },
  certSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 14,
  },
  certDivider: {
    width: '80%',
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  certDetailsText: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
  },
  certCampName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 4,
  },
  certCentreName: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  certInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  certInfoCol: {
    alignItems: 'center',
    flex: 1,
  },
  certInfoLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  certInfoValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  certQuote: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 16,
  },
});
