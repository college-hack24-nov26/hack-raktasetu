import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Switch,
} from 'react-native';
import { Header } from '../components/Header';
import { StatusBadge, SharingStatusType } from '../components/StatusBadge';
import { ConsentModal } from '../components/ConsentModal';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { AuthStorage, StoredDonorUser } from '../services/authStorage';
import { ApiClient, CampAssignmentDTO } from '../services/apiClient';
import { LocationTracking, LocationPermissionsStatus } from '../services/locationTracking';
import { subscribeLocationStatus, LocationUpdateStatus } from '../services/locationTask';
import { displayBloodGroup, MAHARASHTRA_DISTRICTS } from '../config/constants';

interface DonorDashboardScreenProps {
  onLogout: () => void;
  onNavigateHistory: () => void;
  onNavigateFindBlood: () => void;
  onNavigateDonors: () => void;
  onNavigateRequests: () => void;
  onNavigateProfile: () => void;
  campAssignments?: CampAssignmentDTO[];
  assignmentsLoading?: boolean;
  assignmentsError?: string | null;
  isAssignmentsServerVerified?: boolean;
  onRetryAssignments?: () => void;
  onOpenOperations?: () => void;
}

export const DonorDashboardScreen: React.FC<DonorDashboardScreenProps> = ({
  onLogout,
  onNavigateHistory,
  onNavigateFindBlood,
  onNavigateDonors,
  onNavigateRequests,
  onNavigateProfile,
  campAssignments = [],
  assignmentsLoading = false,
  assignmentsError = null,
  isAssignmentsServerVerified = false,
  onRetryAssignments,
  onOpenOperations,
}) => {
  const [donorUser, setDonorUser] = useState<StoredDonorUser | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [status, setStatus] = useState<SharingStatusType>('NOT_SHARING');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Incoming matched blood requests/invitations
  const [invitations, setInvitations] = useState<any[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Live location metrics received from background task or foreground updates
  const [locationMetrics, setLocationMetrics] = useState<LocationUpdateStatus>({
    lastUpdated: null,
    latitude: null,
    longitude: null,
    accuracy: null,
    lastError: null,
  });

  const [permissions, setPermissions] = useState<LocationPermissionsStatus>({
    foregroundGranted: false,
    backgroundGranted: false,
    canAskAgain: true,
  });

  // Reconcile user profile, invitations, and tracking state on load
  const reconcileState = useCallback(async () => {
    const user = await AuthStorage.getUser();
    setDonorUser(user);

    // Refresh user profile details & eligibility from backend
    try {
      const profileRes = await ApiClient.getProfile();
      if (profileRes.success && profileRes.data) {
        const u = profileRes.data.user || profileRes.data;
        const dp = profileRes.data.donorProfile || u.donorProfile;
        setProfileData(profileRes.data);

        const updated: StoredDonorUser = {
          id: u.id,
          phoneNumber: u.phoneNumber,
          name: u.name || dp?.fullName,
          bloodGroup: dp?.bloodGroup || null,
          stateCode: dp?.stateCode ?? 27,
          districtCode: dp?.districtCode ?? null,
          cityOrLocality: dp?.cityOrLocality ?? null,
        };
        await AuthStorage.saveUser(updated);
        setDonorUser(updated);
      }
    } catch {}

    // Refresh incoming invitations
    try {
      setInvitationsLoading(true);
      const invRes = await ApiClient.getEligibleRequests();
      if (invRes.success && Array.isArray(invRes.data?.requests)) {
        setInvitations(invRes.data.requests);
      }
    } catch {} finally {
      setInvitationsLoading(false);
    }

    // Reconcile location tracking status
    const perm = await LocationTracking.getPermissions();
    setPermissions(perm);

    const isTracking = await LocationTracking.isTrackingActive();
    const storedSessionId = await AuthStorage.getActiveSessionId();

    if (storedSessionId && isTracking) {
      setActiveSessionId(storedSessionId);
      setStatus('SHARING');
    } else if (storedSessionId && !isTracking) {
      setActiveSessionId(storedSessionId);
      const resumed = await LocationTracking.startTracking(storedSessionId);
      setStatus(resumed ? 'SHARING' : 'OFFLINE');
    } else {
      setActiveSessionId(null);
      setStatus('NOT_SHARING');
    }
  }, []);

  useEffect(() => {
    reconcileState();

    const unsubscribe = subscribeLocationStatus((metrics) => {
      setLocationMetrics(metrics);
    });

    return () => {
      unsubscribe();
    };
  }, [reconcileState]);

  const onRefresh = async () => {
    setRefreshing(true);
    await reconcileState();
    setRefreshing(false);
  };

  // Step 1: User taps "Start Sharing" -> Verify permissions first
  const handleInitiateSharing = async () => {
    const perm = await LocationTracking.requestPermissions();
    setPermissions(perm);

    if (!perm.foregroundGranted) {
      Alert.alert(
        'Location Permission Required',
        'RaktaSetu requires location permissions to share your live coordinates with Platform Admins for emergency donation requests.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!perm.backgroundGranted) {
      Alert.alert(
        'Background Location Notice',
        'To keep sharing active while your phone is locked or you are using other apps, please allow "Allow all the time" in Android location settings. Foreground tracking will still function when the app is open.',
        [{ text: 'Continue Anyway', onPress: () => setShowConsentModal(true) }, { text: 'Cancel', style: 'cancel' }]
      );
      return;
    }

    setShowConsentModal(true);
  };

  // Step 2: User accepts explicit consent in modal
  const handleAcceptConsent = async (consentVersion: string) => {
    setActionLoading(true);
    setStatus('STARTING');

    try {
      const res = await ApiClient.startLocationSession({
        consentGranted: true,
        consentVersion,
      });

      if (!res.success || !res.data) {
        setStatus('NOT_SHARING');
        setShowConsentModal(false);
        Alert.alert(
          'Failed to Start Session',
          res.error?.message || 'Server rejected location session initiation.'
        );
        return;
      }

      const session = res.data;
      setActiveSessionId(session.id);
      await AuthStorage.saveActiveSessionId(session.id);
      await AuthStorage.saveConsent({
        consentGranted: true,
        consentVersion,
        consentGrantedAt: new Date().toISOString(),
      });

      const started = await LocationTracking.startTracking(session.id);
      if (started) {
        setStatus('SHARING');
      } else {
        setStatus('OFFLINE');
        Alert.alert(
          'Background Tracking Warning',
          'Session registered on server, but background location service could not be started.'
        );
      }
      setShowConsentModal(false);
    } catch (err: any) {
      setStatus('NOT_SHARING');
      setShowConsentModal(false);
      Alert.alert('Session Error', err.message || 'An error occurred starting location sharing.');
    } finally {
      setActionLoading(false);
    }
  };

  // Step 3: User taps "Stop Sharing"
  const handleStopSharing = async () => {
    Alert.alert(
      'Stop Location Sharing?',
      'Your live coordinates will no longer be visible to Platform Administrators.',
      [
        { text: 'Keep Sharing', style: 'cancel' },
        {
          text: 'Stop Sharing',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            setStatus('STOPPING');

            await LocationTracking.stopTracking();

            try {
              const res = await ApiClient.stopLocationSession({ reason: 'DONOR_STOPPED' });
              if (res.success) {
                setActiveSessionId(null);
                setStatus('STOPPED');
              } else {
                await AuthStorage.removeActiveSessionId();
                setActiveSessionId(null);
                setStatus('STOPPED');
              }
            } catch (err) {
              await AuthStorage.removeActiveSessionId();
              setActiveSessionId(null);
              setStatus('STOPPED');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Step 4: Donor responds to an incoming blood request invitation
  const handleRespondToInvitation = async (requestId: string, action: 'ACCEPT' | 'DECLINE') => {
    setRespondingId(requestId);
    try {
      const res = await ApiClient.respondToRequest(requestId, action);
      if (res.success) {
        Alert.alert(
          action === 'ACCEPT' ? 'Request Accepted' : 'Request Declined',
          action === 'ACCEPT'
            ? 'Thank you! The requester and hospital centre have been notified. Please coordinate your visit.'
            : 'You have declined this request. Your status remains available for other requests.'
        );
        reconcileState();
      } else {
        Alert.alert('Response Failed', res.error?.message || 'Could not register response.');
      }
    } catch (err: any) {
      Alert.alert('Network Error', err.message || 'Failed to submit response.');
    } finally {
      setRespondingId(null);
    }
  };

  const handleLogout = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out from RaktaSetu?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          if (status === 'SHARING') {
            await LocationTracking.stopTracking();
            await ApiClient.stopLocationSession({ reason: 'DONOR_STOPPED' }).catch(() => {});
          }
          await AuthStorage.clearAll();
          onLogout();
        },
      },
    ]);
  };

  const eligibility = profileData?.donorProfile?.eligibility;
  const districtName =
    MAHARASHTRA_DISTRICTS.find((d) => d.code === donorUser?.districtCode)?.name ||
    (donorUser?.districtCode ? `District ${donorUser.districtCode}` : 'Maharashtra');

  return (
    <View style={styles.container}>
      <Header subtitle="Donor Dashboard & Live Coordination" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* 1. Donor Profile Summary Card */}
        <Card style={styles.profileCard} variant="elevated">
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {donorUser?.name ? donorUser.name.charAt(0).toUpperCase() : 'D'}
              </Text>
            </View>
            <View style={styles.profileDetails}>
              <View style={styles.nameRow}>
                <Text style={styles.profileName}>{donorUser?.name || 'Verified Donor'}</Text>
                <Badge label="VERIFIED" variant="success" size="sm" />
              </View>
              <Text style={styles.profilePhone}>{donorUser?.phoneNumber || 'No phone'}</Text>
            </View>
            <View style={styles.bloodGroupBadge}>
              <Text style={styles.bloodGroupText}>
                {displayBloodGroup(donorUser?.bloodGroup)}
              </Text>
            </View>
          </View>

          <View style={styles.profileFooter}>
            <Text style={styles.districtText}>
              📍 {donorUser?.cityOrLocality ? `${donorUser.cityOrLocality}, ` : ''}
              {districtName}
            </Text>
            <TouchableOpacity onPress={onNavigateProfile}>
              <Text style={styles.editProfileLink}>Edit Profile →</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {/* Operations Workspace Entry Point (Strictly Gated by Server Verification) */}
        {campAssignments && campAssignments.length > 0 && (
          isAssignmentsServerVerified && onOpenOperations ? (
            <Card style={styles.opsEntryCard} variant="elevated">
              <View style={styles.opsHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <View style={styles.opsIconBadge}>
                    <Text style={{ fontSize: 18 }}>🏥</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.opsCardTitle}>Camp Coordinator Workspace</Text>
                    <Text style={styles.opsCardSubtitle}>
                      {campAssignments.length} active drive assignment{campAssignments.length > 1 ? 's' : ''} authorized
                    </Text>
                  </View>
                </View>
                <Badge label="STAFF" variant="info" size="sm" />
              </View>

              <View style={styles.opsCampSnippet}>
                <Text style={styles.opsSnippetLabel}>Assigned Drive:</Text>
                <Text style={styles.opsSnippetValue} numberOfLines={1}>
                  {campAssignments[0].title} ({campAssignments[0].campCode})
                </Text>
              </View>

              <Button
                title="Open Operations Workspace →"
                variant="primary"
                size="md"
                onPress={onOpenOperations}
                style={{ marginTop: 8 }}
              />
            </Card>
          ) : (
            <Card style={[styles.opsEntryCard, { borderColor: '#F59E0B' }]} variant="outlined">
              <View style={styles.opsHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                  <Text style={{ fontSize: 18 }}>⚠️</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.opsCardTitle}>Camp Staff (Verification Required)</Text>
                    <Text style={[styles.opsCardSubtitle, { color: '#B45309' }]}>
                      Cached assignments cannot independently grant operations access. Live server authorization required.
                    </Text>
                  </View>
                </View>
                <Badge label="UNVERIFIED" variant="warning" size="sm" />
              </View>

              {onRetryAssignments && (
                <Button
                  title={assignmentsLoading ? 'Verifying with Server...' : 'Verify Assignments with Server'}
                  variant="outline"
                  size="sm"
                  loading={assignmentsLoading}
                  onPress={onRetryAssignments}
                  style={{ marginTop: 8 }}
                />
              )}
            </Card>
          )
        )}

        {/* Retryable Operations Error notice if fetch failed */}
        {assignmentsError && !assignmentsLoading && (
          <View style={styles.opsErrorBanner}>
            <Text style={styles.opsErrorText}>⚠️ {assignmentsError}</Text>
            {onRetryAssignments && (
              <TouchableOpacity onPress={onRetryAssignments}>
                <Text style={styles.opsRetryLink}>Tap to Retry</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 2. Authoritative Donation Eligibility Card */}
        <Card style={styles.eligibilityCard}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 18 }}>🩺</Text>
              <Text style={styles.cardTitle}>Donation Eligibility</Text>
            </View>
            {eligibility ? (
              eligibility.isEligible ? (
                <Badge label="ELIGIBLE FOR SCREENING" variant="success" size="sm" />
              ) : (
                <Badge
                  label={
                    eligibility.daysRemaining > 0
                      ? `WAITING: ${eligibility.daysRemaining} DAYS`
                      : 'NOT CURRENTLY ELIGIBLE'
                  }
                  variant="warning"
                  size="sm"
                />
              )
            ) : (
              <Badge label="ELIGIBLE" variant="success" size="sm" />
            )}
          </View>

          <View style={styles.eligibilityDetails}>
            <View style={styles.eligibilityMetric}>
              <Text style={styles.eligibilityLabel}>Last Recorded Donation</Text>
              <Text style={styles.eligibilityValue}>
                {eligibility?.lastDonationDate
                  ? new Date(eligibility.lastDonationDate).toLocaleDateString()
                  : 'No past donation on record'}
              </Text>
            </View>

            {eligibility?.nextEligibleDate && (
              <View style={styles.eligibilityMetric}>
                <Text style={styles.eligibilityLabel}>Next Eligible Date</Text>
                <Text style={[styles.eligibilityValue, { color: '#B45309' }]}>
                  {new Date(eligibility.nextEligibleDate).toLocaleDateString()}
                </Text>
              </View>
            )}

            <View style={styles.eligibilityMetric}>
              <Text style={styles.eligibilityLabel}>Lifetime Completed Donations</Text>
              <Text style={styles.eligibilityValue}>
                {profileData?.stats?.completedDonationsCount ?? profileData?.donorProfile?.donationCount ?? 0} units
              </Text>
            </View>
          </View>

          <Text style={styles.eligibilityDisclaimer}>
            * Authoritative rule: 90-day minimum whole-blood interval. Final clinical fitness screening is conducted in-person by medical staff at collection.
          </Text>

          <TouchableOpacity
            style={styles.historyLinkRow}
            onPress={onNavigateHistory}
            activeOpacity={0.7}
          >
            <Text style={styles.historyLinkText}>View Authoritative Donation Records</Text>
            <Text style={styles.historyLinkArrow}>→</Text>
          </TouchableOpacity>
        </Card>

        {/* 3. Live Location Sharing Card (Preserved & Verified) */}
        <Card style={styles.statusCard} variant="elevated">
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 18 }}>🛰️</Text>
              <Text style={styles.cardTitle}>Live Location Sharing</Text>
            </View>
            <StatusBadge status={status} />
          </View>

          <Text style={styles.cardDescription}>
            {status === 'SHARING'
              ? 'Your live coordinates are actively transmitting to Platform Administrators for emergency blood coordination.'
              : 'Start a revocable session when you are available to assist with nearby blood emergencies.'}
          </Text>

          {/* Metrics */}
          <View style={styles.metricsContainer}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Last Upload</Text>
              <Text style={styles.metricValue}>
                {locationMetrics.lastUpdated ? locationMetrics.lastUpdated : '—'}
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>GPS Accuracy</Text>
              <Text style={styles.metricValue}>
                {locationMetrics.accuracy ? `±${Math.round(locationMetrics.accuracy)}m` : '—'}
              </Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>Session</Text>
              <Text style={styles.metricValue} numberOfLines={1}>
                {activeSessionId ? activeSessionId.slice(0, 8) : 'None'}
              </Text>
            </View>
          </View>

          {locationMetrics.lastError && (
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⚠️ {locationMetrics.lastError}</Text>
            </View>
          )}

          {/* Action Button */}
          {status === 'SHARING' ? (
            <Button
              title="Stop Location Sharing"
              onPress={handleStopSharing}
              variant="danger"
              size="lg"
              loading={actionLoading}
              icon="⏹"
            />
          ) : (
            <Button
              title="Start Location Sharing"
              onPress={handleInitiateSharing}
              variant="primary"
              size="lg"
              loading={actionLoading}
              icon="▶"
            />
          )}
        </Card>

        {/* 4. Incoming Blood Requests & Invitations */}
        <Card style={styles.invitationsCard}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 18 }}>🔔</Text>
              <Text style={styles.cardTitle}>Emergency Requests Nearby</Text>
            </View>
            <Badge
              label={`${invitations.length} MATCHED`}
              variant={invitations.length > 0 ? 'primary' : 'neutral'}
              size="sm"
            />
          </View>

          {invitationsLoading ? (
            <ActivityIndicator color="#DC2626" style={{ marginVertical: 20 }} />
          ) : invitations.length === 0 ? (
            <View style={styles.emptyInvitationsBox}>
              <Text style={styles.emptyInvitationsIcon}>👍</Text>
              <Text style={styles.emptyInvitationsTitle}>No Pending Emergency Requests</Text>
              <Text style={styles.emptyInvitationsSubtitle}>
                You are registered for {displayBloodGroup(donorUser?.bloodGroup)} in {districtName}. We will notify you when a nearby emergency request arises.
              </Text>
            </View>
          ) : (
            <View style={styles.invitationsList}>
              {invitations.map((inv) => (
                <View key={inv.id} style={styles.invitationItem}>
                  <View style={styles.invitationTopRow}>
                    <View style={styles.invitationBloodBadge}>
                      <Text style={styles.invitationBloodText}>
                        {displayBloodGroup(inv.bloodGroup)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.invitationHospital}>
                        {inv.hospitalName || 'Admitted Patient'}
                      </Text>
                      <Text style={styles.invitationComponent}>
                        {inv.component} • {inv.unitsRequested} Unit(s)
                      </Text>
                    </View>
                    <Badge
                      label={inv.matchTier || 'DISTRICT'}
                      variant="info"
                      size="sm"
                    />
                  </View>

                  {inv.message && (
                    <Text style={styles.invitationNote}>"{inv.message}"</Text>
                  )}

                  {inv.hospitalAddress && (
                    <Text style={{ fontSize: 10, color: '#64748B', marginTop: 2 }}>
                      📍 Recommended Centre: {inv.hospitalName} ({inv.hospitalAddress})
                    </Text>
                  )}
                  <Text style={{ fontSize: 9, color: '#94A3B8', marginTop: 2, fontStyle: 'italic' }}>
                    Medical Safety: Coordinate at the blood centre. Do not bring blood directly to the patient or hospital.
                  </Text>

                  {inv.myResponse?.status === 'ACCEPTED' ? (
                    <View style={{ backgroundColor: '#ECFDF5', padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#A7F3D0', marginTop: 8 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#065F46' }}>
                        ✅ You accepted this coordination invitation
                      </Text>
                      <Text style={{ fontSize: 10, color: '#047857', marginTop: 2 }}>
                        Please visit {inv.hospitalName} for clinical screening and donation intake.
                      </Text>
                      {inv.hospitalPhone ? (
                        <Text style={{ fontSize: 11, fontWeight: '600', color: '#065F46', marginTop: 4 }}>
                          📞 Blood Centre Contact: {inv.hospitalPhone}
                        </Text>
                      ) : null}
                    </View>
                  ) : inv.myResponse?.status === 'DECLINED' ? (
                    <View style={{ backgroundColor: '#F1F5F9', padding: 8, borderRadius: 6, marginTop: 8 }}>
                      <Text style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic' }}>
                        You declined this request.
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.invitationActionRow}>
                      <Button
                        title="Accept & Assist"
                        onPress={() => handleRespondToInvitation(inv.id, 'ACCEPT')}
                        variant="primary"
                        size="sm"
                        loading={respondingId === inv.id}
                        style={{ flex: 1 }}
                      />
                      <Button
                        title="Decline"
                        onPress={() => handleRespondToInvitation(inv.id, 'DECLINE')}
                        variant="secondary"
                        size="sm"
                        disabled={respondingId === inv.id}
                        style={{ flex: 1 }}
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          )}
        </Card>

        {/* 5. Quick Service Actions Grid */}
        <View style={styles.quickActionsGrid}>
          <TouchableOpacity
            style={styles.quickActionTile}
            onPress={onNavigateFindBlood}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionEmoji}>🏥</Text>
            <Text style={styles.quickActionTitle}>Find Blood</Text>
            <Text style={styles.quickActionSubtitle}>Bank stock directory</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionTile}
            onPress={onNavigateDonors}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionEmoji}>👥</Text>
            <Text style={styles.quickActionTitle}>Find Donors</Text>
            <Text style={styles.quickActionSubtitle}>Nearby community</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionTile}
            onPress={onNavigateRequests}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionEmoji}>📋</Text>
            <Text style={styles.quickActionTitle}>My Requests</Text>
            <Text style={styles.quickActionSubtitle}>Patient blood needs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.quickActionTile}
            onPress={onNavigateHistory}
            activeOpacity={0.8}
          >
            <Text style={styles.quickActionEmoji}>📜</Text>
            <Text style={styles.quickActionTitle}>History</Text>
            <Text style={styles.quickActionSubtitle}>Donation records</Text>
          </TouchableOpacity>
        </View>

        {/* 6. Privacy & Security Summary */}
        <Card style={styles.securityCard} variant="flat">
          <Text style={styles.securityTitle}>🔒 Privacy & Protections Active</Text>
          <Text style={styles.securityBullet}>
            • Single coordinate storage with zero historical track retention.
          </Text>
          <Text style={styles.securityBullet}>
            • Visible only to Platform Administrators for emergency blood coordination.
          </Text>
          <Text style={styles.securityBullet}>
            • Revocable at any time with a single tap.
          </Text>
        </Card>

        {/* Sign Out */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Sign Out from RaktaSetu</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Explicit Consent Modal */}
      <ConsentModal
        visible={showConsentModal}
        onAccept={handleAcceptConsent}
        onDecline={() => setShowConsentModal(false)}
        loading={actionLoading}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollContent: {
    padding: 16,
    gap: 14,
    paddingBottom: 32,
  },
  profileCard: {
    padding: 16,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
  },
  profileDetails: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  profilePhone: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  bloodGroupBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  bloodGroupText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '800',
  },
  profileFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  districtText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '600',
  },
  editProfileLink: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '700',
  },
  eligibilityCard: {
    padding: 16,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  eligibilityDetails: {
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  eligibilityMetric: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eligibilityLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
  },
  eligibilityValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
  eligibilityDisclaimer: {
    fontSize: 11,
    color: '#9CA3AF',
    fontStyle: 'italic',
    marginTop: 10,
    lineHeight: 15,
  },
  historyLinkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  historyLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  historyLinkArrow: {
    fontSize: 14,
    color: '#DC2626',
    fontWeight: '800',
  },
  statusCard: {
    padding: 16,
  },
  cardDescription: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 17,
    marginBottom: 14,
  },
  metricsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingVertical: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricDivider: {
    width: 1,
    backgroundColor: '#E5E7EB',
  },
  metricLabel: {
    fontSize: 10,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 2,
  },
  metricValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '700',
  },
  warningBox: {
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  invitationsCard: {
    padding: 16,
  },
  emptyInvitationsBox: {
    alignItems: 'center',
    paddingVertical: 18,
    gap: 4,
  },
  emptyInvitationsIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  emptyInvitationsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  emptyInvitationsSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 16,
  },
  invitationsList: {
    gap: 12,
  },
  invitationItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  invitationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  invitationBloodBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  invitationBloodText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  invitationHospital: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  invitationComponent: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  invitationNote: {
    fontSize: 12,
    color: '#4B5563',
    fontStyle: 'italic',
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 8,
  },
  invitationActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickActionTile: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  quickActionEmoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  quickActionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  quickActionSubtitle: {
    fontSize: 11,
    color: '#6B7280',
  },
  securityCard: {
    padding: 14,
  },
  securityTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E40AF',
    marginBottom: 6,
  },
  securityBullet: {
    fontSize: 11,
    color: '#1E3A8A',
    lineHeight: 16,
  },
  logoutBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  logoutBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  opsEntryCard: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderLeftWidth: 4,
    borderLeftColor: '#2563EB',
    borderColor: '#DBEAFE',
  },
  opsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  opsIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  opsCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  opsCardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  opsCampSnippet: {
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  opsSnippetLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
  },
  opsSnippetValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    marginTop: 2,
  },
  opsErrorBanner: {
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  opsErrorText: {
    fontSize: 12,
    color: '#991B1B',
    flex: 1,
  },
  opsRetryLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
    textDecorationLine: 'underline',
    marginLeft: 8,
  },
});

