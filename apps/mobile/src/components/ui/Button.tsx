import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  textStyle,
  icon,
  size = 'md',
}) => {
  const getStyles = () => {
    switch (variant) {
      case 'secondary':
        return {
          container: styles.secondaryContainer,
          text: styles.secondaryText,
          spinner: '#374151',
        };
      case 'outline':
        return {
          container: styles.outlineContainer,
          text: styles.outlineText,
          spinner: '#DC2626',
        };
      case 'danger':
        return {
          container: styles.dangerContainer,
          text: styles.dangerText,
          spinner: '#FFFFFF',
        };
      case 'ghost':
        return {
          container: styles.ghostContainer,
          text: styles.ghostText,
          spinner: '#4B5563',
        };
      case 'primary':
      default:
        return {
          container: styles.primaryContainer,
          text: styles.primaryText,
          spinner: '#FFFFFF',
        };
    }
  };

  const current = getStyles();

  const getHeight = () => {
    if (size === 'sm') return 38;
    if (size === 'lg') return 52;
    return 46;
  };

  return (
    <TouchableOpacity
      style={[
        styles.base,
        current.container,
        { height: getHeight() },
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading ? (
        <ActivityIndicator color={current.spinner} size="small" />
      ) : (
        <Text style={[styles.baseText, current.text, textStyle]}>
          {icon ? `${icon} ` : ''}
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  baseText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  primaryContainer: {
    backgroundColor: '#DC2626',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryContainer: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  secondaryText: {
    color: '#1F2937',
  },
  outlineContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#DC2626',
  },
  outlineText: {
    color: '#DC2626',
  },
  dangerContainer: {
    backgroundColor: '#EF4444',
  },
  dangerText: {
    color: '#FFFFFF',
  },
  ghostContainer: {
    backgroundColor: 'transparent',
  },
  ghostText: {
    color: '#4B5563',
  },
  disabled: {
    opacity: 0.5,
  },
});

