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
} from 'react-native';
import { Header } from '../components/Header';
import { StatusBadge, SharingStatusType } from '../components/StatusBadge';
import { ConsentModal } from '../components/ConsentModal';
import { AuthStorage, StoredDonorUser } from '../services/authStorage';
import { ApiClient } from '../services/apiClient';
import { LocationTracking, LocationPermissionsStatus } from '../services/locationTracking';
import { subscribeLocationStatus, LocationUpdateStatus } from '../services/locationTask';

interface DonorHomeScreenProps {
  onLogout: () => void;
}

export const DonorHomeScreen: React.FC<DonorHomeScreenProps> = ({ onLogout }) => {
  const [donorUser, setDonorUser] = useState<StoredDonorUser | null>(null);
  const [status, setStatus] = useState<SharingStatusType>('NOT_SHARING');
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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

  // Reconcile user and tracking state on load
  const reconcileState = useCallback(async () => {
    const user = await AuthStorage.getUser();
    setDonorUser(user);

    // Refresh user profile details from backend
    try {
      const profileRes = await ApiClient.getProfile();
      if (profileRes.success && profileRes.data) {
        const u = profileRes.data;
        const updated: StoredDonorUser = {
          id: u.id,
          phoneNumber: u.phoneNumber,
          name: u.name,
          bloodGroup: u.donorProfile?.bloodGroup || null,
          stateCode: u.donorProfile?.stateCode ?? null,
          districtCode: u.donorProfile?.districtCode ?? null,
          cityOrLocality: u.donorProfile?.cityOrLocality ?? null,
        };
        await AuthStorage.saveUser(updated);
        setDonorUser(updated);
      }
    } catch {}

    const perm = await LocationTracking.getPermissions();
    setPermissions(perm);

    const isTracking = await LocationTracking.isTrackingActive();
    const storedSessionId = await AuthStorage.getActiveSessionId();

    if (storedSessionId && isTracking) {
      setActiveSessionId(storedSessionId);
      setStatus('SHARING');
    } else if (storedSessionId && !isTracking) {
      // Re-engage tracking if stored session exists
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

    // Subscribe to updates from background location task
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
        'To keep sharing active while your phone is locked or you are using other apps, please allow "Allow all the time" in Android location settings. Foreground-only tracking will still function when the app is open.',
        [{ text: 'Continue Anyway', onPress: () => setShowConsentModal(true) }, { text: 'Cancel', style: 'cancel' }]
      );
      return;
    }

    // Permissions granted -> Open explicit consent modal
    setShowConsentModal(true);
  };

  // Step 2: User accepts explicit consent in modal -> Start session on backend & launch native task
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

      // Launch native background tracking
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

  // Step 3: User taps "Stop Sharing" -> Stop native updates & inform server
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

            // 1. Stop native location task immediately
            await LocationTracking.stopTracking();

            // 2. Notify backend to close session
            try {
              const res = await ApiClient.stopLocationSession({ reason: 'DONOR_STOPPED' });
              if (res.success) {
                setActiveSessionId(null);
                setStatus('STOPPED');
              } else {
                console.warn('[DonorHome] Stop session warning on server:', res.error);
                // Keep local session cleared to prevent further device uploads
                await AuthStorage.removeActiveSessionId();
                setActiveSessionId(null);
                setStatus('STOPPED');
              }
            } catch (err) {
              console.warn('[DonorHome] Server stop request network exception:', err);
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

  return (
    <View style={styles.container}>
      <Header subtitle="Donor Dashboard & Live Coordination" />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Donor Profile Summary Card */}
        <View style={styles.profileCard}>
          <View style={styles.profileHeader}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {donorUser?.name ? donorUser.name.charAt(0).toUpperCase() : 'D'}
              </Text>
            </View>
            <View style={styles.profileDetails}>
              <Text style={styles.profileName}>{donorUser?.name || 'Verified Donor'}</Text>
              <Text style={styles.profilePhone}>{donorUser?.phoneNumber || 'No phone'}</Text>
            </View>
            {donorUser?.bloodGroup && (
              <View style={styles.bloodGroupBadge}>
                <Text style={styles.bloodGroupText}>
                  {donorUser.bloodGroup.replace('_POS', '+').replace('_NEG', '-')}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.profileFooter}>
            <Text style={styles.districtText}>
              📍 {donorUser?.cityOrLocality ? `${donorUser.cityOrLocality}, ` : ''}
              {donorUser?.districtCode ? `District Code ${donorUser.districtCode}` : 'Maharashtra'}
            </Text>
          </View>
        </View>

        {/* Live Location Sharing Card */}
        <View style={styles.statusCard}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Live Location Status</Text>
            <StatusBadge status={status} />
          </View>

          <Text style={styles.cardDescription}>
            {status === 'SHARING'
              ? 'Your live coordinates are actively transmitting to Platform Administrators for emergency blood coordination.'
              : 'Start a revocable session when you are available to assist with nearby blood emergencies.'}
          </Text>

          {/* Metrics section */}
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
            <TouchableOpacity
              style={[styles.stopBtn, actionLoading && styles.btnDisabled]}
              onPress={handleStopSharing}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.stopBtnText}>⏹ Stop Location Sharing</Text>
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.startBtn, actionLoading && styles.btnDisabled]}
              onPress={handleInitiateSharing}
              disabled={actionLoading}
            >
              {actionLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.startBtnText}>▶ Start Location Sharing</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Permissions & Security Banner */}
        <View style={styles.securityCard}>
          <Text style={styles.securityTitle}>🔒 Privacy & Security Protections</Text>
          <View style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.bulletText}>
              <Text style={styles.bold}>Zero Route History:</Text> RaktaSetu stores only your single latest coordinate. Movement tracks are never created.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.bulletText}>
              <Text style={styles.bold}>Admin Restricted:</Text> Visible only to Platform/System Administrators on the central map.
            </Text>
          </View>
          <View style={styles.bulletRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.bulletText}>
              <Text style={styles.bold}>Revocable Anytime:</Text> Stop sharing instantly with a single tap.
            </Text>
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutBtnText}>Sign Out</Text>
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
    padding: 20,
    gap: 16,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  profileHeader: {
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
  profileDetails: {
    flex: 1,
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
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  bloodGroupText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '800',
  },
  profileFooter: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  districtText: {
    fontSize: 12,
    color: '#4B5563',
    fontWeight: '500',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  cardDescription: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
    marginBottom: 16,
  },
  metricsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 16,
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
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 14,
    color: '#111827',
    fontWeight: '700',
  },
  warningBox: {
    backgroundColor: '#FEF3C7',
    padding: 10,
    borderRadius: 8,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningText: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
  },
  startBtn: {
    backgroundColor: '#16A34A',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  stopBtn: {
    backgroundColor: '#DC2626',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  securityCard: {
    backgroundColor: '#EFF6FF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E40AF',
    marginBottom: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 6,
    gap: 6,
  },
  bullet: {
    color: '#2563EB',
    fontSize: 14,
    fontWeight: '700',
  },
  bulletText: {
    flex: 1,
    fontSize: 12,
    color: '#1E3A8A',
    lineHeight: 16,
  },
  bold: {
    fontWeight: '700',
    color: '#1E3A8A',
  },
  logoutBtn: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 20,
  },
  logoutBtnText: {
    color: '#6B7280',
    fontSize: 13,
    fontWeight: '600',
  },
});
