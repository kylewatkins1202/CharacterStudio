import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Text } from "react-native";
import { AppStore } from "../stores/AppStore";
import { getTheme } from "../lib/theme";

import GenerateScreen  from "../screens/GenerateScreen";
import GalleryScreen   from "../screens/GalleryScreen";
import UpscaleScreen   from "../screens/UpscaleScreen";
import TagsScreen      from "../screens/TagsScreen";
import AssetsScreen    from "../screens/AssetsScreen";
import SettingsScreen  from "../screens/SettingsScreen";

const Tab   = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_ICONS = { Generate: "✦", Gallery: "⊞", Upscale: "⤢", Tags: "◈", Assets: "⬡" };

function Tabs() {
  const theme  = AppStore.useState().theme;
  const colors = getTheme(theme);

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor:  colors.border,
          borderTopWidth:  1,
        },
        tabBarActiveTintColor:   colors.primary,
        tabBarInactiveTintColor: colors.textGhost,
        tabBarLabelStyle: { fontFamily: "Courier New", fontSize: 10 },
        tabBarIcon: ({ focused, color }) => (
          <Text style={{ color, fontSize: focused ? 18 : 16 }}>
            {TAB_ICONS[route.name] ?? "•"}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Generate" component={GenerateScreen} />
      <Tab.Screen name="Gallery"  component={GalleryScreen} />
      <Tab.Screen name="Upscale"  component={UpscaleScreen} />
      <Tab.Screen name="Tags"     component={TagsScreen} />
      <Tab.Screen name="Assets"   component={AssetsScreen} />
    </Tab.Navigator>
  );
}

const Test= () => {
  return (<></>)
}

export default function Navigation() {/* 
  const theme  = AppStore.useState().theme;
  const colors = getTheme(theme);
 */
let colors = {}
  return (
    <NavigationContainer
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Main" component={Tabs} />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            headerShown:       true,
            title:             "Settings",
            presentation:      "modal",
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
