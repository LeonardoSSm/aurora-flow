import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useAuth } from '../context/auth-context';
import ApprovalLinkScreen from '../screens/ApprovalLinkScreen';
import BoardScreen from '../screens/BoardScreen';
import CardScreen from '../screens/card/CardScreen';
import FormDoneScreen from '../screens/FormDoneScreen';
import FormFillScreen from '../screens/FormFillScreen';
import LoginScreen from '../screens/LoginScreen';
import ProfileScreen from '../screens/ProfileScreen';
import SolicitationsScreen from '../screens/SolicitationsScreen';
import { makeStyles, useTheme } from '../ui/theme';
import AppNavigator from './AppNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const logo = require('../../assets/splash-icon.png') as number;

export default function RootNavigator() {
  const { colors, isDark } = useTheme();
  const styles = useStyles();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // Mesma cara do splash enquanto a sessão é renovada.
    return (
      <View style={styles.splash}>
        <Image source={logo} style={[styles.logo, isDark && { tintColor: colors.text }]} resizeMode="contain" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: colors.bg } }}>
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Tabs" component={AppNavigator} />
          <Stack.Screen name="Card" component={CardScreen} />
          <Stack.Screen name="Board" component={BoardScreen} />
          <Stack.Screen name="Solicitations" component={SolicitationsScreen} />
          <Stack.Screen name="ApprovalLink" component={ApprovalLinkScreen} />
          <Stack.Screen name="FormFill" component={FormFillScreen} />
          <Stack.Screen name="FormDone" component={FormDoneScreen} options={{ gestureEnabled: false, animation: 'fade' }} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} options={{ animation: 'fade' }} />
      )}
    </Stack.Navigator>
  );
}

const useStyles = makeStyles((colors) =>
  StyleSheet.create({
    splash: { flex: 1, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    logo: { width: 200, height: 130 },
  }),
);
