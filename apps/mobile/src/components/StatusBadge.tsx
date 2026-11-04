import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type SharingStatusType =
  | 'NOT_SHARING'
  | 'STARTING'
  | 'SHARING'
  | 'STOPPING'
  | 'OFFLINE'
  | 'STALE'
  | 'STOPPED';

interface StatusBadgeProps {
  status: SharingStatusType;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const getBadgeConfig = () => {
    switch (status) {
      case 'SHARING':
        return {
          label: 'Active & Sharing',
          bg: '#DCFCE7',
          text: '#15803D',
          dot: '#16A34A',
        };
      case 'STARTING':
        return {
          label: 'Starting Session...',
          bg: '#FEF3C7',
          text: '#B45309',
          dot: '#F59E0B',
        };
      case 'STOPPING':
        return {
          label: 'Stopping Session...',
          bg: '#FEF3C7',
          text: '#B45309',
          dot: '#F59E0B',
        };
      case 'STALE':
        return {
          label: 'Stale (Inactive >15m)',
          bg: '#FFEDD5',
          text: '#C2410C',
          dot: '#EA580C',
        };
      case 'OFFLINE':
        return {
          label: 'Connection Offline',
          bg: '#FEE2E2',
          text: '#B91C1C',
          dot: '#EF4444',
        };
      case 'STOPPED':
        return {
          label: 'Session Stopped',
          bg: '#F1F5F9',
          text: '#475569',
          dot: '#64748B',
        };
      case 'NOT_SHARING':
      default:
        return {
          label: 'Not Sharing',
          bg: '#F3F4F6',
          text: '#4B5563',
          dot: '#9CA3AF',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <View style={[styles.dot, { backgroundColor: config.dot }]} />
      <Text style={[styles.label, { color: config.text }]}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'flex-start',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
  },
});
