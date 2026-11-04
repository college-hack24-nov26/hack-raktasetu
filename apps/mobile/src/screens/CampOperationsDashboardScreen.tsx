import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
} from 'react-native';
import { Card } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { EmptyState } from '../components/ui/EmptyState';
import {
  ApiClient,
  CampAssignmentDTO,
  CampDetailsDTO,
  CampAnalyticsDTO,
  CampStaffDTO,
  CampAttendanceDTO,
  DonorLookupResultDTO,
  normalizeIndianMobile,
} from '../services/apiClient';

export type DashboardTab = 'OVERVIEW' | 'ROSTER' | 'LOOKUP' | 'READINESS' | 'LOGISTICS';
type RosterFilter = 'ALL' | 'REGISTERED' | 'CHECKED_IN' | 'CANCELLED';

const STANDARD_BLOOD_GROUPS = [
  { value: 'UNKNOWN', label: 'Unknown / Unverified' },
  { value: 'A_POS', label: 'A+' },
  { value: 'A_NEG', label: 'A-' },
  { value: 'B_POS', label: 'B+' },
  { value: 'B_NEG', label: 'B-' },
  { value: 'AB_POS', label: 'AB+' },
  { value: 'AB_NEG', label: 'AB-' },
  { value: 'O_POS', label: 'O+' },
  { value: 'O_NEG', label: 'O-' },
];

interface CampOperationsDashboardScreenProps {
  campId: string;
  assignments: CampAssignmentDTO[];
  onSelectCamp: (campId: string) => void;
  onBackToSelector?: () => void;
  onReturnToDonor: () => void;
  onLogout: () => void;
}

export const CampOperationsDashboardScreen: React.FC<CampOperationsDashboardScreenProps> = ({
  campId,
  assignments,
  onSelectCamp,
  onBackToSelector,
  onReturnToDonor,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Authoritative data from server
  const [campDetails, setCampDetails] = useState<CampDetailsDTO['camp'] | null>(null);
  const [analytics, setAnalytics] = useState<CampAnalyticsDTO | null>(null);
  const [staffRoster, setStaffRoster] = useState<CampStaffDTO[]>([]);
  const [attendanceRoster, setAttendanceRoster] = useState<CampAttendanceDTO[]>([]);

  // Local state for Roster Search & Filter
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterFilter, setRosterFilter] = useState<RosterFilter>('ALL');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Local state for Cancellation Modal
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CampAttendanceDTO | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  // Local state for Donor Phone-First Lookup & Walk-In Registration
  const [lookupPhoneInput, setLookupPhoneInput] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResult, setLookupResult] = useState<DonorLookupResultDTO | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Walk-in Registration Form state
  const [registerName, setRegisterName] = useState('');
  const [registerBloodGroup, setRegisterBloodGroup] = useState('UNKNOWN');
  const [registerSubmitting, setRegisterSubmitting] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registrationSuccess, setRegistrationSuccess] = useState<CampAttendanceDTO | null>(null);

  // Local state for Readiness Checklist
  const [checklist, setChecklist] = useState({
    staffAssigned: false,
    coldChainVerified: false,
    emergencyKitAvailable: false,
    consumablesStocked: false,
    spaceSanitized: false,
  });
  const [readinessNotes, setReadinessNotes] = useState('');
  const [readinessSubmitting, setReadinessSubmitting] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  // Local state for Logistics Form
  const [logisticsForm, setLogisticsForm] = useState({
    title: '',
    venue: '',
    targetDate: '',
    timeSlot: '',
    expectedDonors: '',
    coordinatorContact: '',
  });
  const [logisticsSubmitting, setLogisticsSubmitting] = useState(false);
  const [logisticsError, setLogisticsError] = useState<string | null>(null);

  // Find user's assignment record for this camp
  const currentAssignment = assignments.find((a) => a.campId === campId) || assignments[0] || null;

  /**
   * Fetch all camp data concurrently from authoritative endpoints:
   * 1. GET /api/v1/camps/:id
   * 2. GET /api/v1/camps/:id/analytics
   * 3. GET /api/v1/camps/:id/staff
   * 4. GET /api/v1/camps/:id/attendance
   */
  const loadCampData = useCallback(async () => {
    setError(null);
    try {
      const [detailsRes, analyticsRes, staffRes, attendanceRes] = await Promise.all([
        ApiClient.getCampDetails(campId),
        ApiClient.getCampAnalytics(campId),
        ApiClient.getCampStaff(campId),
        ApiClient.getCampAttendanceRoster(campId),
      ]);

      if (detailsRes.success && detailsRes.data?.camp) {
        const c = detailsRes.data.camp;
        setCampDetails(c);

        // Prepopulate Logistics Form with authoritative data
        setLogisticsForm({
          title: c.title || '',
          venue: c.venue || '',
          targetDate: c.targetDate ? c.targetDate.split('T')[0] : '',
          timeSlot: c.timeSlot || '',
          expectedDonors: c.expectedDonors ? String(c.expectedDonors) : '',
          coordinatorContact: c.coordinatorContact || '',
        });

        // Prepopulate Readiness Checklist
        const cl = c.readinessChecklist;
        setChecklist({
          staffAssigned: Boolean(cl?.staffAssigned),
          coldChainVerified: Boolean(cl?.coldChainVerified),
          emergencyKitAvailable: Boolean(cl?.emergencyKitAvailable),
          consumablesStocked: Boolean(cl?.consumablesStocked),
          spaceSanitized: Boolean(cl?.spaceSanitized),
        });
        setReadinessNotes(c.readinessNotes || '');
      } else {
        setError(detailsRes.error?.message || 'Failed to retrieve camp details.');
      }

      if (analyticsRes.success && analyticsRes.data) {
        setAnalytics(analyticsRes.data);
      }

      if (staffRes.success && Array.isArray(staffRes.data)) {
        setStaffRoster(staffRes.data);
      }

      if (attendanceRes.success && Array.isArray(attendanceRes.data)) {
        setAttendanceRoster(attendanceRes.data);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error retrieving camp operational metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [campId]);

  useEffect(() => {
    setLoading(true);
    loadCampData();
  }, [loadCampData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCampData();
  };

  // -------------------------------------------------------------------------
  // 1. PHONE-FIRST DONOR LOOKUP
  // -------------------------------------------------------------------------
  const handlePerformLookup = async () => {
    setLookupError(null);
    setRegistrationSuccess(null);
    setRegisterError(null);

    const norm = normalizeIndianMobile(lookupPhoneInput);
    if (!norm.valid) {
      setLookupError(norm.error || 'Please enter a valid 10-digit Indian mobile number.');
      return;
    }

    setLookupLoading(true);
    try {
      const res = await ApiClient.lookupDonor(campId, norm.normalized);
      if (res.success && res.data) {
        setLookupResult(res.data);
        setHasSearched(true);
        // Pre-fill walk-in form if donor was not found
        if (!res.data.found) {
          setRegisterName('');
          setRegisterBloodGroup('UNKNOWN');
        }
      } else {
        setLookupError(res.error?.message || 'Donor lookup failed.');
        setLookupResult(null);
      }
    } catch (err: any) {
      setLookupError(err?.message || 'Network error during donor lookup.');
      setLookupResult(null);
    } finally {
      setLookupLoading(false);
    }
  };

  const resetLookupFlow = () => {
    setLookupPhoneInput('');
    setLookupResult(null);
    setHasSearched(false);
    setLookupError(null);
    setRegistrationSuccess(null);
    setRegisterError(null);
    setRegisterName('');
  };

  // -------------------------------------------------------------------------
  // 2. WALK-IN DONOR REGISTRATION
  // -------------------------------------------------------------------------
  const handleRegisterDonor = async (phoneOrUserId: string, donorName?: string, bloodGroup?: string) => {
    if (!campDetails?.isReadyForCollection) {
      Alert.alert(
        'Registration Blocked',
        'Camp operational readiness must be verified before registering donor attendance. Please complete the Readiness checklist.'
      );
      return;
    }

    if (campDetails?.status !== 'APPROVED') {
      Alert.alert(
        'Registration Blocked',
        `Attendance registration is only permitted for APPROVED camps. Current status: ${campDetails?.status}`
      );
      return;
    }

    setRegisterSubmitting(true);
    setRegisterError(null);

    try {
      const res = await ApiClient.registerCampAttendance(campId, {
        phoneOrUserId,
        donorName: donorName || undefined,
        bloodGroup: bloodGroup && bloodGroup !== 'UNKNOWN' ? bloodGroup : undefined,
      });

      if (res.success && res.data) {
        setRegistrationSuccess(res.data);
        // Refresh live roster and camp analytics
        await loadCampData();
        Alert.alert(
          'Registration Confirmed',
          `Donor "${res.data.donorName}" registered successfully for camp participation. Status: REGISTERED.`
        );
      } else {
        const msg = res.error?.message || 'Failed to register donor attendance.';
        setRegisterError(msg);
        Alert.alert('Registration Failed', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error during donor registration.';
      setRegisterError(msg);
      Alert.alert('Network Error', msg);
    } finally {
      setRegisterSubmitting(false);
    }
  };

  // -------------------------------------------------------------------------
  // 3. PHYSICAL ARRIVAL CHECK-IN
  // -------------------------------------------------------------------------
  const handleCheckIn = async (attendance: CampAttendanceDTO) => {
    if (!campDetails?.isReadyForCollection) {
      Alert.alert(
        'Check-In Blocked',
        'Camp operational readiness must be verified before checking in donors. Please complete the Readiness checklist first.'
      );
      return;
    }

    if (campDetails?.status !== 'APPROVED') {
      Alert.alert(
        'Check-In Blocked',
        `Cannot check in donors for a camp in status "${campDetails?.status}". Camp must be APPROVED first.`
      );
      return;
    }

    Alert.alert(
      'Confirm Physical Arrival Check-In',
      `Confirm physical arrival of donor "${attendance.donorName}" at the venue?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm Check-In',
          onPress: async () => {
            setActionLoadingId(attendance.id);
            try {
              const res = await ApiClient.checkInAttendance(campId, attendance.id);
              if (res.success) {
                Alert.alert(
                  'Check-In Confirmed',
                  `${attendance.donorName} has been checked in upon arrival. The donor is now in the pre-screening queue.`
                );
                await loadCampData();
                // If in lookup view, update local state
                if (lookupResult?.existingAttendance) {
                  setLookupResult((prev) =>
                    prev
                      ? {
                          ...prev,
                          existingAttendance: {
                            ...prev.existingAttendance!,
                            status: 'CHECKED_IN',
                            checkedInAt: new Date().toISOString(),
                          },
                        }
                      : null
                  );
                }
              } else {
                Alert.alert('Check-In Failed', res.error?.message || 'Could not complete check-in.');
              }
            } catch (err: any) {
              Alert.alert('Network Error', err?.message || 'Network error during arrival check-in.');
            } finally {
              setActionLoadingId(null);
            }
          },
        },
      ]
    );
  };

  // -------------------------------------------------------------------------
  // 4. ATTENDANCE CANCELLATION
  // -------------------------------------------------------------------------
  const openCancelModal = (item: CampAttendanceDTO) => {
    if (item.donationEvent && item.donationEvent.outcome === 'COMPLETED') {
      Alert.alert(
        'Cancellation Prohibited',
        'Cannot cancel attendance: A completed donation unit has already been recorded for this donor.'
      );
      return;
    }

    if (item.screening && item.screening.status === 'CLEARED') {
      Alert.alert(
        'Cancellation Prohibited',
        'Cannot cancel attendance: Donor has already been clinically screened and cleared by the Medical Officer.'
      );
      return;
    }

    setCancelTarget(item);
    setCancelReason('');
    setCancelModalVisible(true);
  };

  const handleConfirmCancellation = async () => {
    if (!cancelTarget) return;

    setActionLoadingId(cancelTarget.id);
    try {
      const res = await ApiClient.cancelCampAttendance(
        campId,
        cancelTarget.id,
        cancelReason.trim() || undefined
      );

      if (res.success) {
        Alert.alert(
          'Registration Cancelled',
          `Attendance registration for "${cancelTarget.donorName}" has been cancelled.`
        );
        setCancelModalVisible(false);
        setCancelTarget(null);
        setCancelReason('');
        await loadCampData();
      } else {
        Alert.alert('Cancellation Failed', res.error?.message || 'Could not cancel attendance.');
      }
    } catch (err: any) {
      Alert.alert('Network Error', err?.message || 'Network error during cancellation.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered attendance roster based on search text and status filter
  const filteredRoster = useMemo(() => {
    return attendanceRoster.filter((item) => {
      // Status filter
      if (rosterFilter !== 'ALL' && item.status !== rosterFilter) {
        return false;
      }
      // Text search
      if (!rosterSearch.trim()) return true;
      const q = rosterSearch.toLowerCase();
      const nameMatch = item.donorName?.toLowerCase().includes(q);
      const phoneMatch = item.donorPhone?.includes(q);
      const groupMatch = item.bloodGroup?.toLowerCase().includes(q);
      return nameMatch || phoneMatch || groupMatch;
    });
  }, [attendanceRoster, rosterFilter, rosterSearch]);

  // -------------------------------------------------------------------------
  // 5. READINESS & LOGISTICS HANDLERS
  // -------------------------------------------------------------------------
  const toggleChecklistItem = (key: keyof typeof checklist) => {
    setChecklist((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    setReadinessError(null);
  };

  const handleSaveReadiness = async (targetReadyState: boolean) => {
    if (campDetails?.status !== 'APPROVED') {
      Alert.alert(
        'Readiness Check Blocked',
        `Operational readiness can only be declared for APPROVED camps. Current status is "${campDetails?.status}".`
      );
      return;
    }

    if (targetReadyState) {
      const allChecked =
        checklist.staffAssigned &&
        checklist.coldChainVerified &&
        checklist.emergencyKitAvailable &&
        checklist.consumablesStocked &&
        checklist.spaceSanitized;

      if (!allChecked) {
        setReadinessError('All 5 mandatory readiness items must be verified before declaring ready.');
        Alert.alert(
          'Incomplete Checklist',
          'All 5 operational readiness criteria must be confirmed before marking this drive ready for collection.'
        );
        return;
      }
    }

    setReadinessSubmitting(true);
    setReadinessError(null);
    try {
      const res = await ApiClient.verifyCampReadiness(campId, {
        isReadyForCollection: targetReadyState,
        readinessChecklist: checklist,
        readinessNotes: readinessNotes.trim() || undefined,
      });

      if (res.success) {
        Alert.alert(
          'Readiness Verified',
          targetReadyState
            ? 'Camp has been officially marked READY FOR COLLECTION.'
            : 'Operational readiness state updated.'
        );
        await loadCampData();
      } else {
        const msg = res.error?.message || 'Failed to update readiness.';
        setReadinessError(msg);
        Alert.alert('Verification Failed', msg);
      }
    } catch (err: any) {
      const msg = err.message || 'Network error submitting readiness.';
      setReadinessError(msg);
      Alert.alert('Network Error', msg);
    } finally {
      setReadinessSubmitting(false);
    }
  };

  const handleSaveLogistics = async () => {
    if (campDetails?.status === 'COMPLETED' || campDetails?.status === 'CANCELLED') {
      Alert.alert('Editing Blocked', `Cannot modify logistics for a camp in ${campDetails?.status} state.`);
      return;
    }

    const donorsNum = Number(logisticsForm.expectedDonors);
    if (logisticsForm.expectedDonors && (isNaN(donorsNum) || donorsNum <= 0)) {
      setLogisticsError('Expected donors must be a positive integer.');
      Alert.alert('Invalid Input', 'Expected donors must be a positive number greater than 0.');
      return;
    }

    if (logisticsForm.targetDate) {
      const parsed = new Date(logisticsForm.targetDate);
      if (isNaN(parsed.getTime())) {
        setLogisticsError('Target date must be a valid date in YYYY-MM-DD format.');
        Alert.alert('Invalid Date', 'Please enter a valid target date (YYYY-MM-DD).');
        return;
      }
    }

    Alert.alert(
      'Confirm Logistics Update',
      'Are you sure you want to update the operational logistics for this camp? Changes will take effect immediately across all clinical and staff portals.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save Changes',
          onPress: async () => {
            setLogisticsSubmitting(true);
            setLogisticsError(null);
            try {
              const res = await ApiClient.editCamp(campId, {
                title: logisticsForm.title.trim() || undefined,
                venue: logisticsForm.venue.trim() || undefined,
                targetDate: logisticsForm.targetDate.trim() || undefined,
                timeSlot: logisticsForm.timeSlot.trim() || undefined,
                expectedDonors: donorsNum > 0 ? donorsNum : undefined,
                coordinatorContact: logisticsForm.coordinatorContact.trim() || undefined,
              });

              if (res.success) {
                Alert.alert('Logistics Updated', 'Camp operational details updated successfully.');
                await loadCampData();
              } else {
                const msg = res.error?.message || 'Failed to update camp logistics.';
                setLogisticsError(msg);
                Alert.alert('Update Failed', msg);
              }
            } catch (err: any) {
              const msg = err.message || 'Network error updating logistics.';
              setLogisticsError(msg);
              Alert.alert('Network Error', msg);
            } finally {
              setLogisticsSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Not scheduled';
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoString;
    }
  };

  const formatTime = (isoString?: string | null) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <View style={styles.container}>
      {/* Top Operations Navigation Bar */}
      <View style={styles.topBar}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {onBackToSelector && (
            <TouchableOpacity style={styles.backBtn} onPress={onBackToSelector}>
              <Text style={styles.backBtnText}>← All Camps</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.returnBtn} onPress={onReturnToDonor}>
            <Text style={styles.returnBtnText}>← Donor Home</Text>
          </TouchableOpacity>
        </View>
        <Badge label="OPERATIONS" variant="info" />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#991B1B']} />
        }
      >
        {/* Camp Identity Header */}
        <Card style={styles.headerCard} variant="elevated">
          <View style={styles.headerRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={styles.campTitle}>
                {campDetails?.title || currentAssignment?.title || 'Camp Operations'}
              </Text>
              <Text style={styles.campCode}>
                Code: {campDetails?.campCode || currentAssignment?.campCode || campId}
              </Text>
            </View>
            <View style={styles.badgeCol}>
              <Badge
                label={campDetails?.status || currentAssignment?.status || 'PENDING'}
                variant={
                  campDetails?.status === 'APPROVED'
                    ? 'success'
                    : campDetails?.status === 'COMPLETED'
                    ? 'neutral'
                    : 'warning'
                }
              />
              <View style={{ marginTop: 4 }}>
                <Badge
                  label={currentAssignment?.role.replace('_', ' ') || 'CAMP STAFF'}
                  variant="info"
                />
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          {/* Quick Identity Grid */}
          <View style={styles.infoGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>📅 Schedule</Text>
              <Text style={styles.gridValue}>
                {formatDate(campDetails?.targetDate || currentAssignment?.targetDate)}
                {campDetails?.timeSlot ? `\n${campDetails.timeSlot}` : ''}
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>📍 Venue</Text>
              <Text style={styles.gridValue} numberOfLines={2}>
                {campDetails?.venue || currentAssignment?.venue || 'TBD'}
              </Text>
            </View>
          </View>

          <View style={styles.infoGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>🏦 Parent Blood Bank</Text>
              <Text style={styles.gridValue}>
                {campDetails?.organisation?.name || currentAssignment?.parentOrganisation?.name || 'Local Blood Bank'}
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>⚡ Operational Readiness</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: campDetails?.isReadyForCollection ? '#10B981' : '#F59E0B' },
                  ]}
                />
                <Text
                  style={[
                    styles.readinessStatusText,
                    { color: campDetails?.isReadyForCollection ? '#065F46' : '#92400E' },
                  ]}
                >
                  {campDetails?.isReadyForCollection ? 'Ready for Collection' : 'Pending Verification'}
                </Text>
              </View>
            </View>
          </View>

          {/* Multiple Camps Switcher */}
          {assignments.length > 1 && (
            <View style={styles.campSwitcherContainer}>
              <Text style={styles.switcherLabel}>Assigned Camps ({assignments.length}):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.switcherScroll}>
                {assignments.map((a) => {
                  const isCurrent = a.campId === campId;
                  return (
                    <TouchableOpacity
                      key={a.campId}
                      style={[styles.switcherChip, isCurrent && styles.switcherChipActive]}
                      onPress={() => onSelectCamp(a.campId)}
                    >
                      <Text
                        style={[styles.switcherChipText, isCurrent && styles.switcherChipTextActive]}
                      >
                        {a.title} ({a.campCode})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
        </Card>

        {/* Global Error Banner */}
        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>⚠️ {error}</Text>
            <TouchableOpacity onPress={handleRefresh}>
              <Text style={styles.retryLink}>Tap to Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Navigation Tabs (5 Segmented Tabs) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
          <View style={styles.tabsRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'OVERVIEW' && styles.tabBtnActive]}
              onPress={() => setActiveTab('OVERVIEW')}
            >
              <Text style={[styles.tabBtnText, activeTab === 'OVERVIEW' && styles.tabBtnTextActive]}>
                📊 Overview
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'ROSTER' && styles.tabBtnActive]}
              onPress={() => setActiveTab('ROSTER')}
            >
              <Text style={[styles.tabBtnText, activeTab === 'ROSTER' && styles.tabBtnTextActive]}>
                📋 Roster ({attendanceRoster.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'LOOKUP' && styles.tabBtnActive]}
              onPress={() => setActiveTab('LOOKUP')}
            >
              <Text style={[styles.tabBtnText, activeTab === 'LOOKUP' && styles.tabBtnTextActive]}>
                🔍 Walk-In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'READINESS' && styles.tabBtnActive]}
              onPress={() => setActiveTab('READINESS')}
            >
              <Text style={[styles.tabBtnText, activeTab === 'READINESS' && styles.tabBtnTextActive]}>
                ✅ Readiness
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'LOGISTICS' && styles.tabBtnActive]}
              onPress={() => setActiveTab('LOGISTICS')}
            >
              <Text style={[styles.tabBtnText, activeTab === 'LOGISTICS' && styles.tabBtnTextActive]}>
                ⚙️ Logistics
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {loading && !refreshing && (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color="#991B1B" />
            <Text style={styles.loadingText}>Fetching authoritative metrics from server...</Text>
          </View>
        )}

        {/* =========================================================================
            TAB 1: OVERVIEW & REAL-TIME ANALYTICS
           ========================================================================= */}
        {activeTab === 'OVERVIEW' && !loading && (
          <View style={styles.tabContent}>
            {/* Quick Action Navigation Bar */}
            <View style={styles.quickActionRow}>
              <Button
                title="🔍 Look Up / Register Donor →"
                variant="primary"
                size="sm"
                onPress={() => setActiveTab('LOOKUP')}
                style={{ flex: 1 }}
              />
              <Button
                title={`📋 View Roster (${attendanceRoster.length})`}
                variant="outline"
                size="sm"
                onPress={() => setActiveTab('ROSTER')}
                style={{ flex: 1 }}
              />
            </View>

            {/* KPI Metrics Tiles */}
            <View style={styles.kpiGrid}>
              <Card style={styles.kpiTile} variant="outlined">
                <Text style={styles.kpiValue}>{analytics?.registeredDonors ?? attendanceRoster.length}</Text>
                <Text style={styles.kpiLabel}>Registered Donors</Text>
                <Text style={styles.kpiSub}>Pre-drive & Walk-in</Text>
              </Card>

              <Card style={styles.kpiTile} variant="outlined">
                <Text style={[styles.kpiValue, { color: '#2563EB' }]}>
                  {analytics?.checkedInDonors ?? attendanceRoster.filter((a) => a.status === 'CHECKED_IN').length}
                </Text>
                <Text style={styles.kpiLabel}>Checked In</Text>
                <Text style={styles.kpiSub}>Arrived at Venue</Text>
              </Card>

              <Card style={styles.kpiTile} variant="outlined">
                <Text style={[styles.kpiValue, { color: '#059669' }]}>
                  {analytics?.screenedDonors ?? 0}
                </Text>
                <Text style={styles.kpiLabel}>Clinically Screened</Text>
                <Text style={styles.kpiSub}>
                  {analytics?.clearedScreeningDonors ?? 0} Cleared • {analytics?.deferredScreeningDonors ?? 0} Deferred
                </Text>
              </Card>

              <Card style={styles.kpiTile} variant="outlined">
                <Text style={[styles.kpiValue, { color: '#DC2626' }]}>
                  {analytics?.completedDonations ?? 0}
                </Text>
                <Text style={styles.kpiLabel}>Units Collected</Text>
                <Text style={styles.kpiSub}>
                  {analytics?.totalVolumeLiters ? `${analytics.totalVolumeLiters} L` : '0 L'} Total Vol
                </Text>
              </Card>
            </View>

            {/* Target Progress Bar */}
            {campDetails?.expectedDonors && campDetails.expectedDonors > 0 && (
              <Card style={styles.progressCard} variant="flat">
                <View style={styles.progressHeaderRow}>
                  <Text style={styles.progressTitle}>Drive Target Progress</Text>
                  <Text style={styles.progressPercent}>
                    {analytics?.targetCompletionPercentage ?? 0}%
                  </Text>
                </View>
                <View style={styles.progressBarTrack}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(analytics?.targetCompletionPercentage ?? 0, 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={styles.progressDesc}>
                  {analytics?.completedDonations ?? 0} units collected of {campDetails.expectedDonors} expected
                  units target.
                </Text>
              </Card>
            )}

            {/* Blood-Group Breakdown Table */}
            <Card style={styles.breakdownCard} variant="elevated">
              <Text style={styles.breakdownTitle}>🩸 Blood Group Breakdown (Server-Authoritative)</Text>
              <Text style={styles.breakdownSub}>
                Aggregated collection units verified through barcode and phlebotomy records.
              </Text>

              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 1.2 }]}>Group</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>Registered</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'center' }]}>Screened</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Units</Text>
              </View>

              {analytics?.bloodGroups && analytics.bloodGroups.length > 0 ? (
                analytics.bloodGroups.map((g) => (
                  <View key={g.bloodGroup} style={styles.tableRow}>
                    <View style={[{ flex: 1.2 }, styles.groupCell]}>
                      <Badge label={g.label} variant="neutral" size="sm" />
                    </View>
                    <Text style={[styles.td, { flex: 1, textAlign: 'center' }]}>
                      {g.registeredDonors}
                    </Text>
                    <Text style={[styles.td, { flex: 1, textAlign: 'center' }]}>
                      {g.screenedDonors}
                    </Text>
                    <Text
                      style={[
                        styles.td,
                        { flex: 1, textAlign: 'right', fontWeight: '700', color: '#B91C1C' },
                      ]}
                    >
                      {g.confirmedUnits}
                    </Text>
                  </View>
                ))
              ) : (
                <Text style={styles.emptyTableText}>No blood units logged yet for this camp.</Text>
              )}
            </Card>

            {/* Read-Only Safety Notice */}
            <Card style={styles.safetyCard} variant="flat">
              <Text style={styles.safetyTitle}>🛡️ Clinical Boundary Note</Text>
              <Text style={styles.safetyText}>
                Medical screening results, medical fitness clearances, deferrals, and collection bag barcodes
                are entered exclusively by licensed Clinical and Phlebotomy staff. Figures above are displayed
                read-only for logistical and operational coordination.
              </Text>
            </Card>
          </View>
        )}

        {/* =========================================================================
            TAB 2: ATTENDANCE ROSTER & ARRIVAL CHECK-IN (Milestone 04D)
           ========================================================================= */}
        {activeTab === 'ROSTER' && (
          <View style={styles.tabContent}>
            {/* Roster Header & Search Card */}
            <Card style={styles.rosterSearchCard} variant="elevated">
              <View style={styles.rosterHeaderRow}>
                <View>
                  <Text style={styles.rosterTitle}>
                    📋 Camp Attendance Roster ({attendanceRoster.length})
                  </Text>
                  <Text style={styles.rosterSubtitle}>
                    {attendanceRoster.filter((a) => a.status === 'CHECKED_IN').length} arrived & checked in
                  </Text>
                </View>
                <Button
                  title="+ Walk-in Donor"
                  variant="primary"
                  size="sm"
                  onPress={() => setActiveTab('LOOKUP')}
                />
              </View>

              {/* Search Input */}
              <View style={styles.searchInputWrapper}>
                <Text style={{ fontSize: 16 }}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  value={rosterSearch}
                  onChangeText={setRosterSearch}
                  placeholder="Search by donor name, phone or blood group..."
                  placeholderTextColor="#94A3B8"
                />
                {rosterSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setRosterSearch('')}>
                    <Text style={{ color: '#94A3B8', fontWeight: '700' }}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Status Filter Chips */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterChipScroll}>
                <TouchableOpacity
                  style={[styles.filterChip, rosterFilter === 'ALL' && styles.filterChipActive]}
                  onPress={() => setRosterFilter('ALL')}
                >
                  <Text style={[styles.filterChipText, rosterFilter === 'ALL' && styles.filterChipTextActive]}>
                    All ({attendanceRoster.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, rosterFilter === 'REGISTERED' && styles.filterChipActive]}
                  onPress={() => setRosterFilter('REGISTERED')}
                >
                  <Text style={[styles.filterChipText, rosterFilter === 'REGISTERED' && styles.filterChipTextActive]}>
                    Registered ({attendanceRoster.filter((a) => a.status === 'REGISTERED').length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, rosterFilter === 'CHECKED_IN' && styles.filterChipActive]}
                  onPress={() => setRosterFilter('CHECKED_IN')}
                >
                  <Text style={[styles.filterChipText, rosterFilter === 'CHECKED_IN' && styles.filterChipTextActive]}>
                    Checked In ({attendanceRoster.filter((a) => a.status === 'CHECKED_IN').length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.filterChip, rosterFilter === 'CANCELLED' && styles.filterChipActive]}
                  onPress={() => setRosterFilter('CANCELLED')}
                >
                  <Text style={[styles.filterChipText, rosterFilter === 'CANCELLED' && styles.filterChipTextActive]}>
                    Cancelled ({attendanceRoster.filter((a) => a.status === 'CANCELLED').length})
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </Card>

            {/* Readiness Warning if not ready */}
            {!campDetails?.isReadyForCollection && (
              <View style={styles.readinessAlertBanner}>
                <Text style={styles.readinessAlertText}>
                  ⚠️ Camp operational readiness is pending. Physical arrival check-in is blocked until readiness is verified.
                </Text>
                <TouchableOpacity onPress={() => setActiveTab('READINESS')}>
                  <Text style={styles.readinessAlertLink}>Complete Readiness →</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Attendance Roster List */}
            {filteredRoster.length === 0 ? (
              <EmptyState
                icon="📋"
                title={attendanceRoster.length === 0 ? 'No Donors Registered Yet' : 'No Matching Donors'}
                description={
                  attendanceRoster.length === 0
                    ? 'No donors have registered for this camp drive yet. Use the Walk-in tab to register arriving donors.'
                    : 'No attendance records match your current search or filter query.'
                }
                actionTitle={attendanceRoster.length === 0 ? 'Register First Walk-in Donor' : 'Clear Filters'}
                onAction={
                  attendanceRoster.length === 0
                    ? () => setActiveTab('LOOKUP')
                    : () => {
                        setRosterSearch('');
                        setRosterFilter('ALL');
                      }
                }
              />
            ) : (
              filteredRoster.map((item) => {
                const isCheckedIn = item.status === 'CHECKED_IN';
                const isCancelled = item.status === 'CANCELLED';
                const isActionLoading = actionLoadingId === item.id;
                const hasClearedScreening = item.screening?.status === 'CLEARED';
                const hasCompletedDonation = item.donationEvent?.outcome === 'COMPLETED';
                const canCancel = !hasClearedScreening && !hasCompletedDonation && !isCancelled;

                return (
                  <Card key={item.id} style={styles.attendanceCard} variant="outlined">
                    <View style={styles.attendanceHeaderRow}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.donorNameText}>{item.donorName}</Text>
                        <Text style={styles.donorPhoneText}>📞 {item.donorPhone}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end', gap: 4 }}>
                        <Badge
                          label={item.bloodGroup || 'UNKNOWN'}
                          variant={item.bloodGroup ? 'neutral' : 'warning'}
                          size="sm"
                        />
                        <Badge
                          label={item.status}
                          variant={
                            isCheckedIn
                              ? 'success'
                              : isCancelled
                              ? 'neutral'
                              : 'info'
                          }
                          size="sm"
                        />
                      </View>
                    </View>

                    <View style={styles.attendanceMetaRow}>
                      <Text style={styles.attendanceMetaText}>
                        Registered: {formatDate(item.registeredAt)} at {formatTime(item.registeredAt)}
                      </Text>
                      {item.checkedInAt && (
                        <Text style={[styles.attendanceMetaText, { color: '#059669', fontWeight: '700' }]}>
                          ✓ Checked In: {formatTime(item.checkedInAt)}
                        </Text>
                      )}
                      {item.cancelledAt && (
                        <Text style={[styles.attendanceMetaText, { color: '#DC2626' }]}>
                          ✕ Cancelled: {item.cancellationReason || 'Reason not specified'}
                        </Text>
                      )}
                    </View>

                    {/* Read-Only Clinical Progress Indicators */}
                    {(item.screening || item.donationEvent) && (
                      <View style={styles.clinicalProgressRow}>
                        {item.screening && (
                          <Badge
                            label={`Screening: ${item.screening.status}`}
                            variant={item.screening.status === 'CLEARED' ? 'success' : 'warning'}
                            size="sm"
                          />
                        )}
                        {item.donationEvent && (
                          <Badge
                            label={`Donation: ${item.donationEvent.outcome}`}
                            variant={item.donationEvent.outcome === 'COMPLETED' ? 'success' : 'neutral'}
                            size="sm"
                          />
                        )}
                      </View>
                    )}

                    {/* Action Buttons */}
                    <View style={styles.attendanceActionRow}>
                      {item.status === 'REGISTERED' && (
                        <Button
                          title={isActionLoading ? 'Checking in...' : '✓ Check In (Arrived)'}
                          variant="primary"
                          size="sm"
                          disabled={isActionLoading || !campDetails?.isReadyForCollection}
                          loading={isActionLoading}
                          onPress={() => handleCheckIn(item)}
                          style={{ flex: 1.2 }}
                        />
                      )}

                      {canCancel && (
                        <Button
                          title="✕ Cancel"
                          variant="outline"
                          size="sm"
                          disabled={isActionLoading}
                          onPress={() => openCancelModal(item)}
                          style={{ flex: 0.8 }}
                        />
                      )}

                      {isCancelled && (
                        <Button
                          title="Re-register Donor"
                          variant="outline"
                          size="sm"
                          disabled={isActionLoading}
                          onPress={() =>
                            handleRegisterDonor(
                              item.userId,
                              item.donorName,
                              item.bloodGroup || undefined
                            )
                          }
                          style={{ flex: 1 }}
                        />
                      )}

                      {hasClearedScreening && (
                        <Text style={styles.lockedActionNote}>
                          🔒 Clinically cleared: Cancellation locked.
                        </Text>
                      )}
                    </View>
                  </Card>
                );
              })
            )}
          </View>
        )}

        {/* =========================================================================
            TAB 3: PHONE-FIRST DONOR LOOKUP & WALK-IN REGISTRATION (Milestone 04D)
           ========================================================================= */}
        {activeTab === 'LOOKUP' && (
          <View style={styles.tabContent}>
            <Card style={styles.lookupCard} variant="elevated">
              <Text style={styles.lookupTitle}>🔍 Phone-First Donor Lookup</Text>
              <Text style={styles.lookupSubtitle}>
                Look up an existing voluntary donor across the national directory, or register a new walk-in donor for this camp.
              </Text>

              {/* Phone Lookup Input */}
              <View style={styles.phoneInputRow}>
                <View style={styles.phonePrefixBox}>
                  <Text style={styles.phonePrefixText}>🇮🇳 +91</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  keyboardType="phone-pad"
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#94A3B8"
                  value={lookupPhoneInput}
                  onChangeText={(val) => {
                    setLookupPhoneInput(val);
                    setLookupError(null);
                  }}
                  maxLength={13}
                />
              </View>

              {lookupError && (
                <View style={styles.lookupErrorBanner}>
                  <Text style={styles.lookupErrorText}>⚠️ {lookupError}</Text>
                </View>
              )}

              <View style={styles.lookupBtnRow}>
                <Button
                  title={lookupLoading ? 'Searching directory...' : 'Search Donor'}
                  variant="primary"
                  size="md"
                  loading={lookupLoading}
                  disabled={lookupLoading || lookupPhoneInput.trim().length === 0}
                  onPress={handlePerformLookup}
                  style={{ flex: 1 }}
                />
                {hasSearched && (
                  <Button
                    title="Reset"
                    variant="outline"
                    size="md"
                    onPress={resetLookupFlow}
                  />
                )}
              </View>
            </Card>

            {/* Registration Success Banner */}
            {registrationSuccess && (
              <Card style={styles.successRegistrationCard} variant="flat">
                <Text style={styles.successRegistrationTitle}>🎉 Donor Registered Successfully!</Text>
                <Text style={styles.successRegistrationSub}>
                  {registrationSuccess.donorName} is registered for this drive.
                  Registration status: <Text style={{ fontWeight: '800' }}>REGISTERED</Text>.
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <Button
                    title="✓ Check In Donor Now"
                    variant="primary"
                    size="sm"
                    onPress={() => handleCheckIn(registrationSuccess)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    title="View Roster"
                    variant="outline"
                    size="sm"
                    onPress={() => setActiveTab('ROSTER')}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            )}

            {/* LOOKUP RESULT: STATE A - DONOR FOUND IN DIRECTORY */}
            {hasSearched && lookupResult && lookupResult.found && lookupResult.donor && (
              <Card style={styles.resultCard} variant="elevated">
                {lookupResult.alreadyRegistered ? (
                  <View style={styles.alreadyRegBanner}>
                    <Text style={styles.alreadyRegText}>
                      ℹ️ This donor is ALREADY registered for this camp drive.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.foundRegBanner}>
                    <Text style={styles.foundRegText}>
                      ✓ Existing Donor Account Located in RaktaSetu Directory
                    </Text>
                  </View>
                )}

                <View style={styles.donorProfileRow}>
                  <View style={styles.donorAvatarBox}>
                    <Text style={{ fontSize: 24 }}>🩸</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.donorProfileName}>{lookupResult.donor.name}</Text>
                    <Text style={styles.donorProfilePhone}>
                      Masked Phone: {lookupResult.donor.maskedPhone}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <Badge
                        label={lookupResult.donor.bloodGroup || 'UNKNOWN'}
                        variant={lookupResult.donor.bloodGroup ? 'neutral' : 'warning'}
                      />
                      <Text style={styles.provenanceText}>
                        {lookupResult.donor.provenanceLabel || 'Profile Blood Group'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Authoritative Server Eligibility Card */}
                <Card
                  style={[
                    styles.eligibilityBanner,
                    lookupResult.donor.isEligible
                      ? styles.eligibilityBannerGreen
                      : styles.eligibilityBannerAmber,
                  ]}
                  variant="flat"
                >
                  <Text style={styles.eligibilityTitle}>
                    {lookupResult.donor.isEligible
                      ? '🩺 Eligible for Voluntary Donation'
                      : '⚠️ Clinical / Interval Recovery Notice'}
                  </Text>
                  {lookupResult.donor.eligibilityWarning ? (
                    <Text style={styles.eligibilityWarningText}>
                      {lookupResult.donor.eligibilityWarning}
                    </Text>
                  ) : (
                    <Text style={styles.eligibilityDescText}>
                      Donor satisfies whole blood donation recovery intervals. Clinical screening will verify vital signs.
                    </Text>
                  )}
                </Card>

                {/* Existing Attendance Status if already registered */}
                {lookupResult.existingAttendance && (
                  <View style={styles.existingAttBox}>
                    <Text style={styles.existingAttTitle}>Current Attendance Status:</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                      <Badge
                        label={lookupResult.existingAttendance.status}
                        variant={
                          lookupResult.existingAttendance.status === 'CHECKED_IN'
                            ? 'success'
                            : lookupResult.existingAttendance.status === 'CANCELLED'
                            ? 'neutral'
                            : 'info'
                        }
                      />
                      <Text style={styles.existingAttDate}>
                        Registered on {formatDate(lookupResult.existingAttendance.registeredAt)}
                      </Text>
                    </View>
                  </View>
                )}

                {/* Actions for Found Donor */}
                <View style={styles.resultActionBox}>
                  {!lookupResult.alreadyRegistered ? (
                    <Button
                      title={registerSubmitting ? 'Registering...' : 'Register for this Camp Drive'}
                      variant="primary"
                      size="md"
                      loading={registerSubmitting}
                      disabled={registerSubmitting || !campDetails?.isReadyForCollection}
                      onPress={() =>
                        handleRegisterDonor(
                          lookupResult.donor!.userId,
                          lookupResult.donor!.name,
                          lookupResult.donor!.bloodGroup || undefined
                        )
                      }
                    />
                  ) : lookupResult.existingAttendance?.status === 'REGISTERED' ? (
                    <Button
                      title="✓ Check In Donor Now (Physically Arrived)"
                      variant="primary"
                      size="md"
                      disabled={!campDetails?.isReadyForCollection}
                      onPress={() =>
                        handleCheckIn({
                          id: lookupResult.existingAttendance!.id,
                          campId,
                          userId: lookupResult.donor!.userId,
                          donorName: lookupResult.donor!.name,
                          donorPhone: lookupResult.donor!.phoneNumber || lookupResult.donor!.maskedPhone,
                          bloodGroup: lookupResult.donor!.bloodGroup,
                          status: lookupResult.existingAttendance!.status,
                          registeredAt: lookupResult.existingAttendance!.registeredAt,
                        })
                      }
                    />
                  ) : (
                    <Button
                      title="View in Attendance Roster →"
                      variant="outline"
                      size="md"
                      onPress={() => setActiveTab('ROSTER')}
                    />
                  )}
                </View>
              </Card>
            )}

            {/* LOOKUP RESULT: STATE B - DONOR NOT FOUND (NEW WALK-IN FORM) */}
            {hasSearched && lookupResult && !lookupResult.found && (
              <Card style={styles.walkInFormCard} variant="elevated">
                <View style={styles.walkInHeader}>
                  <Text style={styles.walkInTitle}>📝 New Walk-In Donor Registration</Text>
                  <Text style={styles.walkInSub}>
                    No account found for this mobile number. Register the donor directly for today's voluntary drive:
                  </Text>
                </View>

                {registerError && (
                  <View style={styles.lookupErrorBanner}>
                    <Text style={styles.lookupErrorText}>⚠️ {registerError}</Text>
                  </View>
                )}

                <Input
                  label="Donor Full Name *"
                  value={registerName}
                  onChangeText={setRegisterName}
                  placeholder="e.g. Ramesh Kulkarni"
                />

                <Input
                  label="Mobile Number (Verified)"
                  value={lookupResult.normalizedPhone || lookupPhoneInput}
                  editable={false}
                  helper="Normalized Indian mobile format (+91)"
                />

                <View style={{ marginBottom: 14 }}>
                  <Text style={styles.fieldLabel}>Blood Group (Optional / Unknown if unverified):</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bgChipScroll}>
                    {STANDARD_BLOOD_GROUPS.map((bg) => {
                      const isSelected = registerBloodGroup === bg.value;
                      return (
                        <TouchableOpacity
                          key={bg.value}
                          style={[styles.bgChip, isSelected && styles.bgChipActive]}
                          onPress={() => setRegisterBloodGroup(bg.value)}
                        >
                          <Text style={[styles.bgChipText, isSelected && styles.bgChipTextActive]}>
                            {bg.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>

                {/* Consent & Clinical Boundary Disclaimer */}
                <View style={styles.registrationNoticeBox}>
                  <Text style={styles.registrationNoticeText}>
                    ℹ️ <Text style={{ fontWeight: '700' }}>Voluntary Participation Notice:</Text> Registration confirms
                    the donor's intent to participate in this camp. Pre-donation counselling, vital signs examination,
                    haemoglobin testing, and clinical fitness will be verified by the Medical Officer before any collection.
                  </Text>
                </View>

                <Button
                  title={registerSubmitting ? 'Registering Walk-in...' : 'Register Walk-in Donor'}
                  variant="primary"
                  size="md"
                  loading={registerSubmitting}
                  disabled={registerSubmitting || registerName.trim().length === 0 || !campDetails?.isReadyForCollection}
                  onPress={() =>
                    handleRegisterDonor(
                      lookupResult.normalizedPhone || lookupPhoneInput,
                      registerName.trim(),
                      registerBloodGroup
                    )
                  }
                  style={{ marginTop: 6 }}
                />
              </Card>
            )}
          </View>
        )}

        {/* =========================================================================
            TAB 4: OPERATIONAL READINESS VERIFICATION
           ========================================================================= */}
        {activeTab === 'READINESS' && (
          <View style={styles.tabContent}>
            {/* Status Summary Banner */}
            <Card
              style={[
                styles.readinessBanner,
                campDetails?.isReadyForCollection
                  ? styles.readinessBannerGreen
                  : styles.readinessBannerAmber,
              ]}
              variant="flat"
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 24 }}>
                  {campDetails?.isReadyForCollection ? '✅' : '⚠️'}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.readinessBannerTitle}>
                    {campDetails?.isReadyForCollection
                      ? 'Camp is Officially READY FOR COLLECTION'
                      : 'Operational Readiness Verification Required'}
                  </Text>
                  <Text style={styles.readinessBannerSub}>
                    {campDetails?.isReadyForCollection
                      ? `Verified at ${formatDate(campDetails.readinessVerifiedAt)}`
                      : 'Before donor check-in begins, all 5 logistics and safety criteria must be confirmed.'}
                  </Text>
                </View>
              </View>
            </Card>

            {readinessError && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>⚠️ {readinessError}</Text>
              </View>
            )}

            {/* Checklist Card */}
            <Card style={styles.checklistCard} variant="elevated">
              <Text style={styles.checklistTitle}>Mandatory Readiness Criteria (5 of 5 Required)</Text>
              <Text style={styles.checklistSub}>
                Confirm each operational component prior to commencing blood collection.
              </Text>

              {/* 1. Staff Assigned */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => toggleChecklistItem('staffAssigned')}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.checkbox,
                    checklist.staffAssigned && styles.checkboxChecked,
                  ]}
                >
                  {checklist.staffAssigned && <Text style={styles.checkCheck}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>1. Medical & Phlebotomy Staff Assigned</Text>
                  <Text style={styles.checkDesc}>
                    Medical officer, licensed phlebotomists, and registration desk coordinators are present on site.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 2. Cold Chain Verified */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => toggleChecklistItem('coldChainVerified')}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.checkbox,
                    checklist.coldChainVerified && styles.checkboxChecked,
                  ]}
                >
                  {checklist.coldChainVerified && <Text style={styles.checkCheck}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>2. Cold Chain & Storage Boxes Verified</Text>
                  <Text style={styles.checkDesc}>
                    Calibrated blood transport containers (+2°C to +6°C / +20°C to +24°C), phase-change ice packs, and active digital temperature loggers verified.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 3. Emergency Kit Available */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => toggleChecklistItem('emergencyKitAvailable')}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.checkbox,
                    checklist.emergencyKitAvailable && styles.checkboxChecked,
                  ]}
                >
                  {checklist.emergencyKitAvailable && <Text style={styles.checkCheck}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>3. Emergency Kit & Adverse Reaction Support</Text>
                  <Text style={styles.checkDesc}>
                    First-aid kit, emergency syncope recovery couch, oxygen cylinder, adrenaline, IV sets, and transport vehicle ready.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 4. Consumables Stocked */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => toggleChecklistItem('consumablesStocked')}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.checkbox,
                    checklist.consumablesStocked && styles.checkboxChecked,
                  ]}
                >
                  {checklist.consumablesStocked && <Text style={styles.checkCheck}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>4. Consumables & Collection Bags Stocked</Text>
                  <Text style={styles.checkDesc}>
                    Sterile blood bags (CPDA/SAGM), vacutainer tubes, alcohol swabs, lancets, biohazard waste bins, and donor refreshment packs stocked.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* 5. Space Sanitized */}
              <TouchableOpacity
                style={styles.checkItem}
                onPress={() => toggleChecklistItem('spaceSanitized')}
                activeOpacity={0.8}
              >
                <View
                  style={[
                    styles.checkbox,
                    checklist.spaceSanitized && styles.checkboxChecked,
                  ]}
                >
                  {checklist.spaceSanitized && <Text style={styles.checkCheck}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.checkLabel}>5. Venue Demarcated & Sanitized</Text>
                  <Text style={styles.checkDesc}>
                    Dedicated donor waiting, confidential screening, blood collection, and post-donation recovery areas clearly separated and sanitized.
                  </Text>
                </View>
              </TouchableOpacity>

              {/* Readiness Notes */}
              <View style={styles.notesContainer}>
                <Text style={styles.notesLabel}>Readiness Notes & Environmental Observations:</Text>
                <TextInput
                  style={styles.notesInput}
                  multiline
                  numberOfLines={3}
                  value={readinessNotes}
                  onChangeText={setReadinessNotes}
                  placeholder="e.g. Venue AC operating at 22°C; power backup verified; 150 blood bags in stock..."
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Action Buttons */}
              <View style={styles.actionRow}>
                <Button
                  title={
                    readinessSubmitting
                      ? 'Submitting...'
                      : campDetails?.isReadyForCollection
                      ? 'Update Verified Checklist'
                      : 'Verify & Declare Ready for Collection'
                  }
                  variant="primary"
                  size="md"
                  disabled={readinessSubmitting || campDetails?.status !== 'APPROVED'}
                  onPress={() => handleSaveReadiness(true)}
                  style={{ flex: 1 }}
                />
              </View>

              {campDetails?.isReadyForCollection && (
                <TouchableOpacity
                  style={styles.revertBtn}
                  onPress={() => handleSaveReadiness(false)}
                  disabled={readinessSubmitting}
                >
                  <Text style={styles.revertBtnText}>Mark Readiness Incomplete / Revoke Ready Status</Text>
                </TouchableOpacity>
              )}
            </Card>
          </View>
        )}

        {/* =========================================================================
            TAB 5: CAMP LOGISTICS MANAGEMENT & STAFF ROSTER
           ========================================================================= */}
        {activeTab === 'LOGISTICS' && (
          <View style={styles.tabContent}>
            {/* Logistics Form Card */}
            <Card style={styles.formCard} variant="elevated">
              <Text style={styles.formTitle}>⚙️ Camp Operational Logistics</Text>
              <Text style={styles.formSub}>
                Update venue, operational schedule, donor targets, and coordinator emergency contact.
              </Text>

              {campDetails?.status === 'COMPLETED' || campDetails?.status === 'CANCELLED' ? (
                <View style={styles.lockedBanner}>
                  <Text style={styles.lockedText}>
                    🔒 Editing is locked because this camp is in {campDetails.status} state.
                  </Text>
                </View>
              ) : null}

              {logisticsError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>⚠️ {logisticsError}</Text>
                </View>
              )}

              <Input
                label="Camp Title"
                value={logisticsForm.title}
                onChangeText={(text) => setLogisticsForm((p) => ({ ...p, title: text }))}
                placeholder="e.g. Annual Community Blood Donation Drive"
                editable={campDetails?.status !== 'COMPLETED' && campDetails?.status !== 'CANCELLED'}
              />

              <Input
                label="Venue & Address"
                value={logisticsForm.venue}
                onChangeText={(text) => setLogisticsForm((p) => ({ ...p, venue: text }))}
                placeholder="e.g. Town Hall, Main Auditorium, 2nd Floor"
                multiline
                numberOfLines={2}
                editable={campDetails?.status !== 'COMPLETED' && campDetails?.status !== 'CANCELLED'}
              />

              <View style={styles.inputRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Input
                    label="Target Date (YYYY-MM-DD)"
                    value={logisticsForm.targetDate}
                    onChangeText={(text) => setLogisticsForm((p) => ({ ...p, targetDate: text }))}
                    placeholder="2026-11-15"
                    editable={campDetails?.status !== 'COMPLETED' && campDetails?.status !== 'CANCELLED'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Time Slot"
                    value={logisticsForm.timeSlot}
                    onChangeText={(text) => setLogisticsForm((p) => ({ ...p, timeSlot: text }))}
                    placeholder="09:00 AM - 04:00 PM"
                    editable={campDetails?.status !== 'COMPLETED' && campDetails?.status !== 'CANCELLED'}
                  />
                </View>
              </View>

              <View style={styles.inputRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Input
                    label="Expected Donors"
                    value={logisticsForm.expectedDonors}
                    onChangeText={(text) => setLogisticsForm((p) => ({ ...p, expectedDonors: text }))}
                    placeholder="100"
                    keyboardType="numeric"
                    editable={campDetails?.status !== 'COMPLETED' && campDetails?.status !== 'CANCELLED'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Coordinator Contact"
                    value={logisticsForm.coordinatorContact}
                    onChangeText={(text) =>
                      setLogisticsForm((p) => ({ ...p, coordinatorContact: text }))
                    }
                    placeholder="+91 98765 43210"
                    keyboardType="phone-pad"
                    editable={campDetails?.status !== 'COMPLETED' && campDetails?.status !== 'CANCELLED'}
                  />
                </View>
              </View>

              <Button
                title={logisticsSubmitting ? 'Saving Changes...' : 'Save Logistics Changes'}
                variant="primary"
                size="md"
                disabled={
                  logisticsSubmitting ||
                  campDetails?.status === 'COMPLETED' ||
                  campDetails?.status === 'CANCELLED'
                }
                onPress={handleSaveLogistics}
                style={{ marginTop: 8 }}
              />
            </Card>

            {/* Assigned Staff Team Roster Card */}
            <Card style={styles.teamCard} variant="elevated">
              <View style={styles.teamHeaderRow}>
                <Text style={styles.rosterTitle}>
                  👥 Assigned Operational Personnel ({staffRoster.length})
                </Text>
                <Badge label="AUTHORITATIVE" variant="neutral" size="sm" />
              </View>
              <Text style={styles.teamSub}>
                Staff roster is assigned and authenticated by the parent blood bank administration.
              </Text>

              {staffRoster.length === 0 ? (
                <EmptyState
                  icon="🧑‍⚕️"
                  title="No Staff Assigned Yet"
                  description="No clinical officers or phlebotomists have been formally assigned to this drive by the parent blood bank."
                />
              ) : (
                staffRoster.map((item) => (
                  <View key={item.id} style={styles.staffItem}>
                    <View style={styles.staffAvatar}>
                      <Text style={{ fontSize: 18 }}>
                        {item.role.includes('CLINICAL') || item.role.includes('MEDICAL')
                          ? '🩺'
                          : item.role.includes('COLLECTION')
                          ? '🩸'
                          : '📋'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.staffName}>
                        {item.user?.name || `Staff #${item.userId.substring(0, 8)}`}
                      </Text>
                      <Text style={styles.staffRole}>{item.role.replace('_', ' ')}</Text>
                      {item.user?.phoneNumber && (
                        <Text style={styles.staffPhone}>📞 {item.user.phoneNumber}</Text>
                      )}
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Badge
                        label={item.isActive ? 'ACTIVE' : 'INACTIVE'}
                        variant={item.isActive ? 'success' : 'neutral'}
                        size="sm"
                      />
                      <Text style={styles.staffDate}>
                        Assigned {formatDate(item.assignedAt)}
                      </Text>
                    </View>
                  </View>
                ))
              )}
            </Card>
          </View>
        )}
      </ScrollView>

      {/* CANCELLATION MODAL (Android & iOS Compatible) */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard} variant="elevated">
            <Text style={styles.modalTitle}>Cancel Attendance Registration</Text>
            <Text style={styles.modalDesc}>
              Are you sure you want to cancel the camp registration for{' '}
              <Text style={{ fontWeight: '800' }}>{cancelTarget?.donorName}</Text>?
            </Text>
            <Text style={styles.modalWarning}>
              This will remove the donor from the active queue. Medical officers and phlebotomists will no longer see this donor in their intake queue.
            </Text>

            <Text style={styles.modalInputLabel}>Cancellation Reason (Required):</Text>
            <TextInput
              style={styles.modalInput}
              multiline
              numberOfLines={3}
              value={cancelReason}
              onChangeText={setCancelReason}
              placeholder="e.g. Donor left venue before screening; personal emergency..."
              placeholderTextColor="#94A3B8"
            />

            <View style={styles.modalBtnRow}>
              <Button
                title="Keep Active"
                variant="outline"
                size="md"
                onPress={() => setCancelModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title={actionLoadingId === cancelTarget?.id ? 'Cancelling...' : 'Confirm Cancel'}
                variant="danger"
                size="md"
                disabled={actionLoadingId === cancelTarget?.id || cancelReason.trim().length === 0}
                onPress={handleConfirmCancellation}
                style={{ flex: 1.2 }}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </View>
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
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
  },
  backBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  returnBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  returnBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  headerCard: {
    padding: 16,
    marginBottom: 14,
    borderColor: '#E2E8F0',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  campTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  campCode: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  badgeCol: {
    alignItems: 'flex-end',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  infoGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
  },
  gridItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  gridLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  gridValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 16,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  readinessStatusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  campSwitcherContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  switcherLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  switcherScroll: {
    flexDirection: 'row',
  },
  switcherChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  switcherChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  switcherChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  switcherChipTextActive: {
    color: '#1E40AF',
    fontWeight: '800',
  },
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    flex: 1,
    fontWeight: '600',
  },
  retryLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginLeft: 8,
  },
  tabsScroll: {
    marginBottom: 14,
  },
  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 3,
  },
  tabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tabBtnTextActive: {
    color: '#0F172A',
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  tabContent: {
    gap: 14,
  },
  quickActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiTile: {
    width: '48%',
    padding: 14,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },
  progressCard: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
  },
  progressHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '900',
    color: '#059669',
  },
  progressBarTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 4,
  },
  progressDesc: {
    fontSize: 11,
    color: '#64748B',
  },
  breakdownCard: {
    padding: 14,
    borderColor: '#E2E8F0',
  },
  breakdownTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  breakdownSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 12,
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 6,
  },
  th: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  groupCell: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  td: {
    fontSize: 12,
    color: '#1E293B',
    fontWeight: '600',
  },
  emptyTableText: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    paddingVertical: 14,
  },
  safetyCard: {
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  safetyTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 4,
  },
  safetyText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  rosterSearchCard: {
    padding: 14,
    borderColor: '#E2E8F0',
  },
  rosterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rosterTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  rosterSubtitle: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
  },
  filterChipScroll: {
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#DBEAFE',
    borderColor: '#2563EB',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#1E40AF',
    fontWeight: '800',
  },
  readinessAlertBanner: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  readinessAlertText: {
    fontSize: 11,
    color: '#92400E',
    flex: 1,
    fontWeight: '600',
  },
  readinessAlertLink: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  attendanceCard: {
    padding: 14,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  attendanceHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  donorNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  donorPhoneText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  attendanceMetaRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    gap: 2,
  },
  attendanceMetaText: {
    fontSize: 11,
    color: '#64748B',
  },
  clinicalProgressRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  attendanceActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'center',
  },
  lockedActionNote: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
  },
  lookupCard: {
    padding: 16,
    borderColor: '#E2E8F0',
  },
  lookupTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  lookupSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
    lineHeight: 16,
  },
  phoneInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  phonePrefixBox: {
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  phonePrefixText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#FFFFFF',
    color: '#0F172A',
    height: 44,
  },
  lookupErrorBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#F87171',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  lookupErrorText: {
    fontSize: 11,
    color: '#991B1B',
    fontWeight: '600',
  },
  lookupBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  successRegistrationCard: {
    backgroundColor: '#ECFDF5',
    borderColor: '#6EE7B7',
    borderWidth: 1,
    padding: 14,
    borderRadius: 10,
  },
  successRegistrationTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#065F46',
  },
  successRegistrationSub: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  resultCard: {
    padding: 16,
    borderColor: '#E2E8F0',
  },
  alreadyRegBanner: {
    backgroundColor: '#EFF6FF',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  alreadyRegText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
  },
  foundRegBanner: {
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  foundRegText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  donorProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  donorAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donorProfileName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  donorProfilePhone: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  provenanceText: {
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
  },
  eligibilityBanner: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  eligibilityBannerGreen: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
  },
  eligibilityBannerAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
  },
  eligibilityTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  eligibilityWarningText: {
    fontSize: 11,
    color: '#92400E',
    marginTop: 4,
    lineHeight: 15,
    fontWeight: '600',
  },
  eligibilityDescText: {
    fontSize: 11,
    color: '#065F46',
    marginTop: 2,
    lineHeight: 15,
  },
  existingAttBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  existingAttTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  existingAttDate: {
    fontSize: 11,
    color: '#475569',
  },
  resultActionBox: {
    gap: 8,
  },
  walkInFormCard: {
    padding: 16,
    borderColor: '#E2E8F0',
  },
  walkInHeader: {
    marginBottom: 14,
  },
  walkInTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  walkInSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  bgChipScroll: {
    flexDirection: 'row',
  },
  bgChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  bgChipActive: {
    backgroundColor: '#FEE2E2',
    borderColor: '#DC2626',
  },
  bgChipText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  bgChipTextActive: {
    color: '#991B1B',
    fontWeight: '800',
  },
  registrationNoticeBox: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  registrationNoticeText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  readinessBanner: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
  },
  readinessBannerGreen: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  readinessBannerAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  readinessBannerTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  readinessBannerSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
  },
  checklistCard: {
    padding: 16,
    borderColor: '#E2E8F0',
  },
  checklistTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  checklistSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  checkCheck: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 14,
  },
  checkLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  checkDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  notesContainer: {
    marginTop: 14,
    marginBottom: 14,
  },
  notesLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    fontSize: 12,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  revertBtn: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  revertBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  formCard: {
    padding: 16,
    borderColor: '#E2E8F0',
  },
  formTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  formSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  lockedBanner: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    marginBottom: 14,
  },
  lockedText: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
  },
  teamCard: {
    padding: 16,
    borderColor: '#E2E8F0',
  },
  teamHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  teamSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 14,
  },
  staffItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  staffAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  staffName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  staffRole: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  staffPhone: {
    fontSize: 10,
    color: '#2563EB',
    marginTop: 2,
  },
  staffDate: {
    fontSize: 9,
    color: '#94A3B8',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalDesc: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 6,
  },
  modalWarning: {
    fontSize: 11,
    color: '#DC2626',
    backgroundColor: '#FEF2F2',
    padding: 8,
    borderRadius: 6,
    marginBottom: 14,
    lineHeight: 15,
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    minHeight: 70,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: 'row',
    gap: 10,
  },
});
