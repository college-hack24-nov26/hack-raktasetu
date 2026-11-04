import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { CURRENT_CONSENT_VERSION } from '../config/api';

interface ConsentModalProps {
  visible: boolean;
  onAccept: (version: string) => void;
  onDecline: () => void;
  loading?: boolean;
}

export const ConsentModal: React.FC<ConsentModalProps> = ({
  visible,
  onAccept,
  onDecline,
  loading = false,
}) => {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconText}>📍</Text>
              </View>
              <Text style={styles.title}>Live Location Sharing Consent</Text>
              <Text style={styles.versionBadge}>Policy Version {CURRENT_CONSENT_VERSION}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionHeader}>Purpose & Intended Use</Text>
              <Text style={styles.bodyText}>
                Your device will transmit real-time GPS coordinates to RaktaSetu exclusively to help coordinate urgent, life-saving blood requests with nearby blood centres across Maharashtra.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionHeader}>Restricted Platform Visibility</Text>
              <Text style={styles.bodyText}>
                Exact coordinates are visible <Text style={styles.bold}>ONLY to authorized Platform and System Administrators</Text> on the official monitoring dashboard. Individual patients, requesting hospitals, and commercial entities cannot view your location.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionHeader}>Zero Route History</Text>
              <Text style={styles.bodyText}>
                RaktaSetu preserves only your single latest coordinate while your sharing session is active. Route history, breadcrumb tracks, and historical movement logs are <Text style={styles.bold}>strictly forbidden and never stored</Text>.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionHeader}>Full Revocation Control</Text>
              <Text style={styles.bodyText}>
                You remain in full control. You can stop or revoke this sharing session at any time with a single tap of the "Stop Sharing" button.
              </Text>
            </View>

            <Text style={styles.footerNote}>
              By tapping "I Agree & Start Sharing", you explicitly record consent under Version {CURRENT_CONSENT_VERSION}.
            </Text>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.btn, styles.acceptBtn, loading && styles.btnDisabled]}
              onPress={() => onAccept(CURRENT_CONSENT_VERSION)}
              disabled={loading}
            >
              <Text style={styles.acceptBtnText}>
                {loading ? 'Initializing Session...' : 'I Agree & Start Sharing'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.declineBtn]}
              onPress={onDecline}
              disabled={loading}
            >
              <Text style={styles.declineBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 24,
  },
  content: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconText: {
    fontSize: 26,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
  },
  versionBadge: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    marginTop: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  card: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 4,
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#4B5563',
  },
  bold: {
    fontWeight: '700',
    color: '#111827',
  },
  footerNote: {
    fontSize: 12,
    lineHeight: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  actions: {
    paddingHorizontal: 24,
    gap: 10,
  },
  btn: {
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  acceptBtn: {
    backgroundColor: '#DC2626',
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  declineBtn: {
    backgroundColor: '#F3F4F6',
  },
  declineBtnText: {
    color: '#4B5563',
    fontSize: 15,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
