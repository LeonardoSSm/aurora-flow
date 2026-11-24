import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyPendingApprovals, useUnreadCount } from '../api/queries';
import ApprovalsScreen from '../screens/ApprovalsScreen';
import HomeScreen from '../screens/HomeScreen';
import InboxScreen from '../screens/InboxScreen';
import NewRequestScreen from '../screens/NewRequestScreen';
import ProcessesScreen from '../screens/ProcessesScreen';
import { Icon, type IconName } from '../ui/primitives';
import { makeStyles, useTheme } from '../ui/theme';
import type { TabParamList } from './types';

const Tab = createBottomTabNavigator<TabParamList>();

function tabIcon(name: IconName) {
  return ({ color }: { color: string }) => <Icon name={name} size={22} color={color} />;
}

export default function AppNavigator() {
  const { colors } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const pending = useMyPendingApprovals();
  const unread = useUnreadCount();
  const pendingCount = pending.data?.length ?? 0;
  const unreadCount = unread.data ?? 0;

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandText,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: [styles.bar, { height: 62 + insets.bottom, paddingBottom: 8 + insets.bottom }],
        tabBarLabelStyle: styles.label,
        tabBarBadgeStyle: styles.badge,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Início', tabBarIcon: tabIcon('home') }} />
      <Tab.Screen name="Processes" component={ProcessesScreen} options={{ title: 'Processos', tabBarIcon: tabIcon('trello') }} />
      <Tab.Screen name="NewRequest" component={NewRequestScreen} options={{ title: 'Novo', tabBarIcon: tabIcon('plus-circle') }} />
      <Tab.Screen
        name="Approvals"
        component={ApprovalsScreen}
        options={{
          title: 'Aprovações',
          tabBarIcon: tabIcon('check-circle'),
          tabBarBadge: pendingCount > 0 ? pendingCount : undefined,
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          title: 'Avisos',
          tabBarIcon: tabIcon('bell'),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
        }}
      />
    </Tab.Navigator>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    bar: {
      backgroundColor: colors.surface,
      borderTopColor: colors.border,
      borderTopWidth: StyleSheet.hairlineWidth,
      paddingTop: 6,
    },
    label: { fontSize: 11, fontWeight: '600' },
    badge: { backgroundColor: colors.danger, fontSize: 10, fontWeight: '700' },
  }),
);
