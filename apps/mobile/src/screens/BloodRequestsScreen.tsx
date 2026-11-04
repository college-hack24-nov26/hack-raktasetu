
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  SafeAreaView,
  RefreshControl,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Header } from '../components/Header';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { SelectModal, SelectOption } from '../components/ui/SelectModal';
import { EmptyState } from '../components/ui/EmptyState';
import { ApiClient } from '../services/apiClient';
import { useMobileRealtime } from '../services/realtimeClient';
import {
  BLOOD_GROUPS,
  BLOOD_COMPONENTS,
  displayBloodGroup,
  toBloodGroupEnum,
} from '../config/constants';

interface BloodRequestsScreenProps {
  initialBloodGroup?: string;
  initialHospitalName?: string;
  initialHospitalCode?: string;
  onRequireAuth?: () => void;
  isAuthenticated: boolean;
}

export const BloodRequestsScreen: React.FC<BloodRequestsScreenProps> = ({
  initialBloodGroup,
  initialHospitalName,
  initialHospitalCode,
  onRequireAuth,
  isAuthenticated,
}) => {
  const [activeTab, setActiveTab] = useState<'MY_REQUESTS' | 'NEW_REQUEST'>(
    initialBloodGroup || initialHospitalName ? 'NEW_REQUEST' : 'MY_REQUESTS'
  );

  // My Requests list state
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  // New Request Form State
  const [patientName, setPatientName] = useState('');
  const [bloodGroup, setBloodGroup] = useState(initialBloodGroup || 'B+');
  const [component, setComponent] = useState('Packed Red Blood Cells');
  const [unitsRequested, setUnitsRequested] = useState('1');
  const [hospitalName, setHospitalName] = useState(initialHospitalName || '');
  const [targetHospitalCode, setTargetHospitalCode] = useState(initialHospitalCode || '');
  const [targetHospitalName, setTargetHospitalName] = useState(initialHospitalName || '');
  const [requiredDate, setRequiredDate] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Real-time synchronization
  const { status: realtimeStatus } = useMobileRealtime({
    enabled: isAuthenticated,
    onEvent: (evt) => {
      if (evt.eventType.startsWith('blood_request.')) {
        fetchRequests();
      }
    },
    onReconnect: () => {
      fetchRequests();
    },
  });

  // Modals
  const [showBloodGroupModal, setShowBloodGroupModal] = useState(false);
  const [showComponentModal, setShowComponentModal] = useState(false);

  const fetchRequests = async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await ApiClient.getPatientRequests();
      if (res.success && Array.isArray(res.data)) {
        setRequests(res.data);
      }
    } catch (err) {
      console.warn('Failed to fetch requests:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchRequests();
    }
  }, [isAuthenticated]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchRequests();
  };

  const handleCreateRequest = async () => {
    if (!isAuthenticated) {
      Alert.alert(
        'Authentication Required',
        'Please sign in with your mobile number to create and track emergency blood requests.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign In', onPress: onRequireAuth },
        ]
      );
      return;
    }

    setFormError(null);

    if (!patientName.trim() || patientName.trim().length < 2) {
      setFormError('Patient full name is required (at least 2 characters).');
      return;
    }

    const units = parseInt(unitsRequested, 10);
    if (isNaN(units) || units < 1 || units > 50) {
      setFormError('Requested units must be a number between 1 and 50.');
      return;
    }

    if (!hospitalName.trim() || hospitalName.trim().length < 2) {
      setFormError('Admitted hospital or healthcare centre name is required.');
      return;
    }

    setSubmitting(true);
    try {
      let requiredByIso: string | undefined = undefined;
      if (requiredDate.trim()) {
        const parsed = new Date(requiredDate.trim());
        if (!isNaN(parsed.getTime())) {
          requiredByIso = parsed.toISOString();
        }
      }

      const res = await ApiClient.createBloodRequest({
        patientName: patientName.trim(),
        bloodGroup: toBloodGroupEnum(bloodGroup),
        component: component.trim(),
        unitsRequested: units,
        hospitalName: hospitalName.trim(),
        hospitalCode: targetHospitalCode || undefined,
        admittedHospitalName: hospitalName.trim(),
        requiredBy: requiredByIso,
        message: message.trim() || undefined,
      });

      if (res.success) {
        Alert.alert(
          'Blood Request Submitted',
          'Your blood request has been registered. Nearby matching voluntary donors and blood centres will be coordinated.',
          [
            {
              text: 'View My Requests',
              onPress: () => {
                setActiveTab('MY_REQUESTS');
                fetchRequests();
                // Clear form
                setPatientName('');
                setHospitalName('');
                setMessage('');
                setUnitsRequested('1');
              },
            },
          ]
        );
      } else {
        setFormError(res.error?.message || 'Failed to submit blood request.');
      }
    } catch (err: any) {
      setFormError(err.message || 'Network error submitting request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDetails = async (reqItem: any) => {
    setSelectedRequest(reqItem);
    setDetailsLoading(true);
    try {
      const res = await ApiClient.getPatientRequestDetails(reqItem.id);
      if (res.success && res.data) {
        setSelectedRequest(res.data);
      }
    } catch (err) {
      console.warn('Failed to fetch request details:', err);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleCancelRequest = async (requestId: string) => {
    Alert.alert(
      'Cancel Blood Request?',
      'Are you sure you want to cancel this request? Matched donors will be informed that the request is no longer needed.',
      [
        { text: 'Keep Request', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await ApiClient.cancelPatientRequest(requestId, 'Cancelled by patient family');
              if (res.success) {
                Alert.alert('Request Cancelled', 'The blood request has been closed.');
                setSelectedRequest(null);
                fetchRequests();
              } else {
                Alert.alert('Error', res.error?.message || 'Could not cancel request.');
              }
            } catch (err: any) {
              Alert.alert('Network Error', err.message || 'Failed to cancel.');
            }
          },
        },
      ]
    );
  };

  const handleConfirmReceipt = async (requestId: string) => {
    try {
      const res = await ApiClient.confirmBloodRequestReceipt(requestId, 'Requester confirmed blood receipt via mobile app.');
      if (res.success) {
        Alert.alert(
          res.data?.isFullyFulfilled === false ? 'Partial Delivery Confirmed' : 'Receipt Confirmed',
          res.data?.isFullyFulfilled === false
            ? `You have confirmed receipt of ${res.data?.receivedUnitsCount || 1} unit(s). Remaining shortfall: ${res.data?.shortfallCount} unit(s). The request remains open for further coordination.`
            : 'You have confirmed physical receipt of the blood units. The request is now fulfilled.'
        );
        fetchRequests();
        if (selectedRequest) {
          setSelectedRequest((prev: any) => ({
            ...prev,
            status: res.data?.isFullyFulfilled === false ? 'OPEN' : 'CLOSED',
            closureOutcome: res.data?.isFullyFulfilled === false ? 'PARTIALLY_FULFILLED' : 'FULFILLED',
            fulfillmentStatus: res.data?.isFullyFulfilled === false ? 'PARTIALLY_FULFILLED' : 'FULFILLED',
            lifecycleStatus: res.data?.isFullyFulfilled === false ? 'PARTIALLY_FULFILLED' : 'FULFILLED',
            patientAcknowledgedAt: new Date().toISOString(),
          }));
        }
      } else {
        Alert.alert('Confirmation Failed', res.error?.message || 'Unable to confirm receipt at this time.');
      }
    } catch (err: any) {
      Alert.alert('Network Error', err.message || 'Failed to confirm receipt.');
    }
  };

  const bloodGroupOptions: SelectOption[] = BLOOD_GROUPS.map((bg) => ({
    label: bg,
    value: bg,
  }));

  const componentOptions: SelectOption[] = BLOOD_COMPONENTS.map((c) => ({
    label: c,
    value: c,
  }));

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'OPEN':
      case 'MATCHING_IN_PROGRESS':
        return 'primary';
      case 'FULFILLED':
      case 'COMPLETED':
        return 'success';
      case 'CANCELLED':
        return 'danger';
      case 'SUBMITTED':
      default:
        return 'warning';
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Header subtitle="Patient Blood Request Management" />

      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'MY_REQUESTS' && styles.tabButtonActive]}
          onPress={() => setActiveTab('MY_REQUESTS')}
        >
          <Text
            style={[styles.tabButtonText, activeTab === 'MY_REQUESTS' && styles.tabButtonTextActive]}
          >
            My Requests ({requests.length})
            {realtimeStatus === 'connected' ? ' ● Live' : ''}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'NEW_REQUEST' && styles.tabButtonActive]}
          onPress={() => setActiveTab('NEW_REQUEST')}
        >
          <Text
            style={[styles.tabButtonText, activeTab === 'NEW_REQUEST' && styles.tabButtonTextActive]}
          >
            + Create New Request
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          activeTab === 'MY_REQUESTS' ? (
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          ) : undefined
        }
      >
        {activeTab === 'MY_REQUESTS' ? (
          /* TAB 1: MY REQUESTS */
          <View>
            {!isAuthenticated ? (
              <Card style={styles.authPromptCard}>
                <Text style={{ fontSize: 32, marginBottom: 8 }}>🔒</Text>
                <Text style={styles.authPromptTitle}>Sign In to View Requests</Text>
                <Text style={styles.authPromptDesc}>
                  Sign in with your mobile number to view and track your submitted blood requests and fulfilment progress.
                </Text>
                <Button
                  title="Sign In with Mobile"
                  onPress={onRequireAuth || (() => {})}
                  variant="primary"
                  style={{ marginTop: 14 }}
                />
              </Card>
            ) : loading ? (
              <ActivityIndicator size="large" color="#DC2626" style={{ marginTop: 40 }} />
            ) : requests.length === 0 ? (
              <Card style={styles.emptyCard}>
                <EmptyState
                  icon="📋"
                  title="No Active Requests Found"
                  description="You have not created any patient blood requests yet. When in need, tap Create New Request."
                  actionTitle="+ Create New Request"
                  onAction={() => setActiveTab('NEW_REQUEST')}
                />
              </Card>
            ) : (
              <View style={styles.requestList}>
                {requests.map((r) => {
                  const createdDate = new Date(r.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  });

                  return (
                    <Card key={r.id} style={styles.requestCard} variant="elevated">
                      <View style={styles.requestTopRow}>
                        <View style={styles.bloodBadge}>
                          <Text style={styles.bloodBadgeText}>
                            {displayBloodGroup(r.bloodGroup)}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.patientName}>{r.patientName || 'Patient Request'}</Text>
                          <Text style={styles.hospitalText}>
                            🏥 {r.admittedHospitalName || r.hospitalCode || r.bloodCentre?.hospitalName || 'Admitted Facility'}
                          </Text>
                          {r.assignedBankName ? (
                            <Text style={{ fontSize: 11, color: '#1D4ED8', fontWeight: '700', marginTop: 1 }}>
                              🏦 Routed: {r.assignedBankName}
                            </Text>
                          ) : null}
                          <Text style={styles.componentText}>
                            {r.component} • {r.unitsRequested} Unit(s)
                          </Text>
                          {r.allocatedUnitsCount !== undefined && r.allocatedUnitsCount > 0 ? (
                            <Text style={{ fontSize: 11, color: '#4338CA', fontWeight: '700', marginTop: 1 }}>
                              📦 Allocated: {r.allocatedUnitsCount}/{r.unitsRequested} Unit(s)
                            </Text>
                          ) : null}
                          {r.shortfallCount !== undefined && r.shortfallCount > 0 && r.allocatedUnitsCount !== undefined && r.allocatedUnitsCount > 0 ? (
                            <Text style={{ fontSize: 10, color: '#B45309', fontWeight: '700', marginTop: 1 }}>
                              ⚠️ Shortfall: {r.shortfallCount} Unit(s) (Donor Outreach Active)
                            </Text>
                          ) : null}
                        </View>
                        <Badge
                          label={r.lifecycleStatus || r.status}
                          variant={getStatusVariant(r.status)}
                          size="sm"
                        />
                      </View>

                      <View style={styles.requestMetaRow}>
                        <Text style={styles.requestDateText}>Created {createdDate}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {(r.canConfirmReceipt || r.lifecycleStatus === 'DISPATCHED' || r.status === 'DISPATCHED') && !r.patientAcknowledgedAt && (
                            <TouchableOpacity
                              style={[styles.detailsBtn, { backgroundColor: '#059669', borderColor: '#059669' }]}
                              onPress={() => handleConfirmReceipt(r.id)}
                            >
                              <Text style={[styles.detailsBtnText, { color: '#FFFFFF' }]}>✓ Confirm Receipt</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.detailsBtn}
                            onPress={() => handleOpenDetails(r)}
                          >
                            <Text style={styles.detailsBtnText}>View Request Details →</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </Card>
                  );
                })}
              </View>
            )}
          </View>
        ) : (
          /* TAB 2: NEW REQUEST FORM */
          <Card style={styles.formCard}>
            <Text style={styles.formTitle}>Create Patient Blood Request</Text>
            <Text style={styles.formDesc}>
              Connect with nearby voluntary blood donors and participating blood centres across Maharashtra.
            </Text>

            {formError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {formError}</Text>
              </View>
            )}

            {/* Target Designated Blood Centre Notice */}
            {targetHospitalCode ? (
              <View style={styles.designatedCentreCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.designatedCentreTag}>TARGET DESIGNATED BLOOD CENTRE</Text>
                  <Text style={styles.designatedCentreName}>
                    {targetHospitalName || `Blood Centre #${targetHospitalCode}`}
                  </Text>
                  <Text style={styles.designatedCentreSub}>
                    Code: {targetHospitalCode} • Your request will route directly into this Blood Bank's queue.
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.clearCentreBtn}
                  onPress={() => {
                    setTargetHospitalCode('');
                    setTargetHospitalName('');
                  }}
                >
                  <Text style={styles.clearCentreBtnText}>Clear</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* Patient Name */}
            <Input
              label="Patient Full Name *"
              placeholder="e.g. Anand Deshmukh"
              value={patientName}
              onChangeText={setPatientName}
              autoCapitalize="words"
            />

            {/* Blood Group and Units Row */}
            <View style={styles.row}>
              <View style={[styles.pickerBlock, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Blood Group *</Text>
                <TouchableOpacity
                  style={styles.selectorBtn}
                  onPress={() => setShowBloodGroupModal(true)}
                >
                  <Text style={styles.selectorValue}>{bloodGroup}</Text>
                  <Text style={styles.selectorArrow}>▼</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flex: 1 }}>
                <Input
                  label="Units Required *"
                  placeholder="1"
                  value={unitsRequested}
                  onChangeText={setUnitsRequested}
                  keyboardType="number-pad"
                />
              </View>
            </View>

            {/* Blood Component */}
            <View style={styles.pickerBlock}>
              <Text style={styles.fieldLabel}>Blood Component *</Text>
              <TouchableOpacity
                style={styles.selectorBtn}
                onPress={() => setShowComponentModal(true)}
              >
                <Text style={styles.selectorValue}>{component}</Text>
                <Text style={styles.selectorArrow}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* Admitted Hospital Name */}
            <Input
              label="Admitted Hospital / Healthcare Centre *"
              placeholder="e.g. Ruby Hall Clinic, Sassoon General Hospital"
              value={hospitalName}
              onChangeText={setHospitalName}
              helper="Hospital name is used to match with nearby donors and verify delivery."
            />

            {/* Required By Date (Optional) */}
            <Input
              label="Required Date (YYYY-MM-DD) (Optional)"
              placeholder="2026-11-05"
              value={requiredDate}
              onChangeText={setRequiredDate}
              keyboardType="numbers-and-punctuation"
            />

            {/* Additional Notes */}
            <Input
              label="Medical Urgency & Coordination Notes (Optional)"
              placeholder="e.g. Scheduled for cardiac surgery at 10 AM, ICU ward 4"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={3}
              style={{ height: 70, textAlignVertical: 'top', paddingTop: 8 }}
            />

            <Button
              title="Submit Blood Request"
              onPress={handleCreateRequest}
              variant="primary"
              size="lg"
              loading={submitting}
              style={{ marginTop: 14 }}
            />
          </Card>
        )}
      </ScrollView>

      {/* Select Modals */}
      <SelectModal
        visible={showBloodGroupModal}
        title="Select Required Blood Group"
        options={bloodGroupOptions}
        selectedValue={bloodGroup}
        onSelect={(val) => setBloodGroup(val)}
        onClose={() => setShowBloodGroupModal(false)}
        searchable={false}
      />

      <SelectModal
        visible={showComponentModal}
        title="Select Blood Component"
        options={componentOptions}
        selectedValue={component}
        onSelect={(val) => setComponent(val)}
        onClose={() => setShowComponentModal(false)}
        searchable={false}
      />

      {/* Request Details & Matched Donors Modal */}
      <Modal visible={!!selectedRequest} animationType="slide" transparent={false}>
        <SafeAreaView style={styles.detailsModalContainer}>
          <View style={styles.detailsHeader}>
            <Text style={styles.detailsHeaderTitle}>Request Details & Matching</Text>
            <TouchableOpacity
              onPress={() => setSelectedRequest(null)}
              style={styles.detailsCloseBtn}
            >
              <Text style={styles.detailsCloseText}>Close</Text>
            </TouchableOpacity>
          </View>

          {selectedRequest && (
            <ScrollView contentContainerStyle={styles.detailsContent}>
              <Card style={styles.detailsCard}>
                <View style={styles.detailsTopRow}>
                  <View style={styles.bloodBadgeLarge}>
                    <Text style={styles.bloodBadgeTextLarge}>
                      {displayBloodGroup(selectedRequest.bloodGroup)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.detailsPatient}>{selectedRequest.patientName}</Text>
                    <Text style={styles.detailsHospital}>
                      🏥 {selectedRequest.hospitalCode || selectedRequest.bloodCentre?.hospitalName || 'Admitted Centre'}
                    </Text>
                    <Text style={styles.detailsUnits}>
                      {selectedRequest.component} • {selectedRequest.unitsRequested} Unit(s)
                    </Text>
                  </View>
                </View>

                <View style={styles.detailsStatusRow}>
                  <Text style={styles.detailsStatusLabel}>Status:</Text>
                  <Badge
                    label={selectedRequest.lifecycleStatus || selectedRequest.status}
                    variant={getStatusVariant(selectedRequest.status)}
                    size="md"
                  />
                </View>

                {selectedRequest.message && (
                  <View style={styles.detailsNotesBox}>
                    <Text style={styles.detailsNotesLabel}>Coordination Notes:</Text>
                    <Text style={styles.detailsNotesText}>{selectedRequest.message}</Text>
                  </View>
                )}

                {/* Allocation & Shortfall Status Card */}
                {selectedRequest.allocatedUnitsCount !== undefined && selectedRequest.allocatedUnitsCount > 0 && (
                  <View style={{ marginTop: 12, padding: 12, backgroundColor: '#EEF2FF', borderRadius: 8, borderWidth: 1, borderColor: '#C7D2FE' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#312E81' }}>
                      📦 Inventory Allocation: {selectedRequest.allocatedUnitsCount} of {selectedRequest.unitsRequested} unit(s) secured
                    </Text>
                    {selectedRequest.shortfallCount > 0 ? (
                      <View style={{ marginTop: 6, padding: 8, backgroundColor: '#FEF3C7', borderRadius: 6, borderWidth: 1, borderColor: '#FDE68A' }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#92400E' }}>
                          ⚠️ Remaining Shortfall: {selectedRequest.shortfallCount} Unit(s)
                        </Text>
                        <Text style={{ fontSize: 10, color: '#B45309', marginTop: 2 }}>
                          Partial stock allocated from available blood bank inventory. The designated Blood Bank is coordinating voluntary donor outreach for the remaining shortfall.
                        </Text>
                      </View>
                    ) : (
                      <Text style={{ fontSize: 11, color: '#047857', fontWeight: '600', marginTop: 4 }}>
                        ✓ Full quantity allocated from clinical inventory.
                      </Text>
                    )}
                  </View>
                )}

                {/* Confirm Receipt Action if Dispatched */}
                {(selectedRequest.canConfirmReceipt || selectedRequest.lifecycleStatus === 'DISPATCHED' || selectedRequest.status === 'DISPATCHED') && !selectedRequest.patientAcknowledgedAt && (
                  <Button
                    title="✓ Confirm Blood Units Received"
                    onPress={() => handleConfirmReceipt(selectedRequest.id)}
                    variant="primary"
                    size="sm"
                    style={{ marginTop: 14, backgroundColor: '#059669' }}
                  />
                )}

                {selectedRequest.patientAcknowledgedAt && (
                  <View style={{ marginTop: 12, padding: 10, backgroundColor: '#ECFDF5', borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' }}>
                    <Text style={{ fontSize: 12, color: '#065F46', fontWeight: 'bold' }}>
                      ✓ Delivery Received and Confirmed by Patient Family
                    </Text>
                  </View>
                )}

                {/* Cancel Action if Open */}
                {selectedRequest.status !== 'CANCELLED' && selectedRequest.status !== 'CLOSED' && (
                  <Button
                    title="Cancel Request"
                    onPress={() => handleCancelRequest(selectedRequest.id)}
                    variant="danger"
                    size="sm"
                    style={{ marginTop: 14 }}
                  />
                )}
              </Card>

              {/* Blood Bank Network Coordination Section */}
              <View style={styles.matchedSection}>
                <Text style={styles.matchedHeading}>Blood Bank Network Coordination</Text>
                <Text style={styles.matchedSubtext}>
                  Fulfillment is governed by accredited Blood Banks and System Administration.
                </Text>

                {selectedRequest.shortfallCount > 0 ? (
                  <Card style={styles.emptyMatchedCard}>
                    <Text style={{ fontSize: 28, marginBottom: 6 }}>🤝</Text>
                    <Text style={styles.emptyMatchedTitle}>Coordinating Shortfall...</Text>
                    <Text style={styles.emptyMatchedDesc}>
                      The designated Blood Bank is coordinating voluntary donor candidate matching for the remaining {selectedRequest.shortfallCount} unit(s). To protect donor privacy and clinical compliance, donor coordination is handled directly by the Blood Bank.
                    </Text>
                  </Card>
                ) : (
                  <Card style={styles.emptyMatchedCard}>
                    <Text style={{ fontSize: 28, marginBottom: 6 }}>✓</Text>
                    <Text style={styles.emptyMatchedTitle}>Fully Allocated</Text>
                    <Text style={styles.emptyMatchedDesc}>
                      All requested units have been allocated from verified, clinically released Blood Bank inventory.
                    </Text>
                  </Card>
                )}
              </View>
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#DC2626',
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  tabButtonTextActive: {
    color: '#DC2626',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  authPromptCard: {
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  authPromptTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  authPromptDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyCard: {
    marginTop: 20,
    padding: 20,
  },
  requestList: {
    gap: 12,
  },
  requestCard: {
    padding: 14,
  },
  requestTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
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
  patientName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  hospitalText: {
    fontSize: 12,
    color: '#4B5563',
    marginTop: 2,
  },
  componentText: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  requestMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  requestDateText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  detailsBtn: {
    paddingVertical: 2,
  },
  detailsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  formCard: {
    padding: 18,
  },
  formTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  formDesc: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 16,
    lineHeight: 17,
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
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerBlock: {
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
  detailsModalContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  detailsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  detailsHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailsCloseBtn: {
    padding: 4,
  },
  detailsCloseText: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '700',
  },
  detailsContent: {
    padding: 16,
    paddingBottom: 40,
  },
  detailsCard: {
    padding: 16,
    marginBottom: 16,
  },
  detailsTopRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  bloodBadgeLarge: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  bloodBadgeTextLarge: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DC2626',
  },
  detailsPatient: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
  },
  detailsHospital: {
    fontSize: 13,
    color: '#4B5563',
    marginTop: 2,
  },
  detailsUnits: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  detailsStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  detailsStatusLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  detailsNotesBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  detailsNotesLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 4,
  },
  detailsNotesText: {
    fontSize: 12,
    color: '#1F2937',
    lineHeight: 16,
  },
  matchedSection: {
    marginTop: 8,
  },
  matchedHeading: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  matchedSubtext: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
    lineHeight: 16,
  },
  emptyMatchedCard: {
    alignItems: 'center',
    padding: 24,
  },
  emptyMatchedTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 4,
  },
  emptyMatchedDesc: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
  },
  matchedDonorCard: {
    padding: 12,
  },
  matchedDonorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  matchedDonorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  matchedDonorLoc: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  contactUnlockedBox: {
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  contactUnlockedText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '700',
  },
  designatedCentreCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  designatedCentreTag: {
    fontSize: 9,
    fontWeight: '800',
    color: '#991B1B',
    letterSpacing: 0.5,
  },
  designatedCentreName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  designatedCentreSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  clearCentreBtn: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  clearCentreBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
});
