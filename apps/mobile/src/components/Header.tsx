import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface HeaderProps {
  subtitle?: string;
}

export const Header: React.FC<HeaderProps> = ({ subtitle }) => {
  return (
    <View style={styles.container}>
      <View style={styles.brandRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>🩸</Text>
        </View>
        <Text style={styles.title}>RaktaSetu</Text>
      </View>
      <Text style={styles.subtitle}>{subtitle || 'Donor Live-Location Network'}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    fontSize: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#DC2626',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    fontWeight: '500',
  },
});
