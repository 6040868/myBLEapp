import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, Button, TextInput, StyleSheet, Platform, PermissionsAndroid, Alert,
} from 'react-native';
import { BleManager } from 'react-native-ble-plx';
import { Buffer } from 'buffer';npx expo run:android

const manager = new BleManager();

export default function App() {
  const [devices, setDevices] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [connectedDevice, setConnectedDevice] = useState(null);
  const [command, setCommand] = useState('');

  const requestPermissions = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      if (
        granted[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] !== PermissionsAndroid.RESULTS.GRANTED ||
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] !== PermissionsAndroid.RESULTS.GRANTED ||
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] !== PermissionsAndroid.RESULTS.GRANTED
      ) {
        Alert.alert('Permission Denied', 'Bluetooth permissions are required to use this app.');
        return false;
      }
    }
    return true;
  };

  const startScan = async () => {
    const hasPermissions = await requestPermissions();
    if (!hasPermissions) return;

    setDevices([]);
    setScanning(true);
    setConnectedDevice(null);

    const scanTimeout = setTimeout(() => {
      manager.stopDeviceScan();
      setScanning(false);
    }, 10000);

    manager.startDeviceScan(null, null, async (error, device) => {
      if (error) {
        console.log('❌ Scan error:', error);
        setScanning(false);
        clearTimeout(scanTimeout);
        return;
      }

      if (device?.name?.includes('HMSoft')) {
        console.log('✅ HMSoft found:', device.name);
        manager.stopDeviceScan();
        setScanning(false);
        clearTimeout(scanTimeout);

        try {
          const connected = await device.connect();
          await connected.discoverAllServicesAndCharacteristics();
          setConnectedDevice(connected);
          Alert.alert('Connected', 'Connected to ' + device.name);
        } catch (err) {
          console.log('❌ Connection error:', err);
          Alert.alert('Error', 'Could not connect to HMSoft device');
        }
      }

      if (device && device.name && !devices.find(d => d.id === device.id)) {
        setDevices(prev => [...prev, device]);
      }
    });
  };

  const sendCommand = async () => {
    if (!connectedDevice) {
      Alert.alert('No Device', 'Please connect to a device first.');
      return;
    }
    try {
      const services = await connectedDevice.services();
      for (const service of services) {
        if (service.uuid.toUpperCase().includes('FFE0')) {
          const characteristics = await service.characteristics();
          for (const char of characteristics) {
            if (char.uuid.toUpperCase().includes('FFE1') && char.isWritableWithResponse) {
              const base64Command = Buffer.from(command, 'utf-8').toString('base64');
              await char.writeWithResponse(base64Command);
              Alert.alert('Command Sent', 'Command "' + command + '" sent successfully.');
              return;
            }
          }
        }
      }
      Alert.alert('Characteristic Not Found', 'No writable characteristic (FFE1) found.');
    } catch (err) {
      console.log('❌ Error sending command:', err);
      Alert.alert('Error', 'Failed to send command. Please try again.');
    }
  };

  useEffect(() => {
    requestPermissions().then((granted) => {
      if (!granted) {
        console.log('Permissions not granted. Exiting.');
      }
    });

    // Cleanup logic
    return () => {
      manager.stopDeviceScan();
      if (connectedDevice) {
        connectedDevice.cancelConnection();
      }
      manager.destroy();
    };
  }, [connectedDevice]);

  return (
    <View style={styles.container}>
      <Button
        title={scanning ? 'Scanning for Devices...' : 'Scan for HMSoft'}
        onPress={startScan}
        disabled={scanning}
      />

      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Text style={styles.device}>
            {item.name} ({item.id}) - RSSI: {item.rssi || 'N/A'}
          </Text>
        )}
        style={{ marginTop: 20, maxHeight: 200, width: '100%' }}
      />

      {connectedDevice && (
        <View style={styles.commandBox}>
          <TextInput
            placeholder="Type a command, e.g., 1"
            style={styles.input}
            value={command}
            onChangeText={setCommand}
          />
          <Button title="Send" onPress={sendCommand} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 50,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  device: {
    padding: 6,
    fontSize: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  commandBox: {
    marginTop: 30,
    width: '100%',
    gap: 10,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#aaa',
    borderRadius: 6,
    padding: 10,
    width: '100%',
  },
});