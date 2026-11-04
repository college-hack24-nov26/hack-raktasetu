import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type BadgeVariant =
  | 'primary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'neutral',
  size = 'md',
}) => {
  const getColors = () => {
    switch (variant) {
      case 'primary':
        return { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5' };
      case 'success':
        return { bg: '#DCFCE7', text: '#15803D', border: '#86EFAC' };
      case 'warning':
        return { bg: '#FEF3C7', text: '#B45309', border: '#FDE68A' };
      case 'danger':
        return { bg: '#FEE2E2', text: '#B91C1C', border: '#F87171' };
      case 'info':
        return { bg: '#EFF6FF', text: '#1D4ED8', border: '#BFDBFE' };
      case 'neutral':
      default:
        return { bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' };
    }
  };

  const colors = getColors();

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          paddingVertical: size === 'sm' ? 2 : 4,
          paddingHorizontal: size === 'sm' ? 8 : 10,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: colors.text,
            fontSize: size === 'sm' ? 11 : 12,
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});

