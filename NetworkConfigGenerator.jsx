// Part 1: Core Setup and State Management
import React, { useState } from 'react';
import { Network, Plus, Trash2, Settings2, Save, Sun, Moon } from 'lucide-react';

// Interface type definitions with their specific configuration options
const interfaceTypes = {
  physical: { name: 'Physical Interface', hasVlan: false },
  bond: { name: 'Network Bond', hasSlaves: true, hasBondMode: true },
  bridge: { name: 'Network Bridge', hasSlaves: true },
  vlan: { name: 'VLAN Interface', hasParent: true, hasVlanId: true }
};

// Bond modes with detailed descriptions
const bondModes = {
  'balance-rr': '0 - Round Robin (Sequential packet distribution)',
  'active-backup': '1 - Active Backup (Failover)',
  'balance-xor': '2 - XOR (Based on MAC address)',
  'broadcast': '3 - Broadcast (All interfaces active)',
  '802.3ad': '4 - LACP (Dynamic link aggregation)',
  'balance-tlb': '5 - Adaptive TLB (Outbound load balancing)',
  'balance-alb': '6 - Adaptive Load Balancing (Bidirectional)'
};

const NetworkConfigGenerator = () => {
  // Initialize state with dark mode as default
  const [darkMode, setDarkMode] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Initial interface configuration
  const [interfaces, setInterfaces] = useState([{
    id: '1',
    name: 'eth0',
    type: 'physical',
    method: 'static',
    ip: '',
    netmask: '',
    gateway: '',
    dns: ['', '', ''],
    mtu: '1500',
    slaves: [],
    bondMode: '',
    vlanId: '',
    parentInterface: '',
    enabled: true
  }]);

  // IP address validation with detailed error feedback
  const validateIP = (ip) => {
    if (!ip) return { valid: true, message: '' };
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) {
      return { valid: false, message: 'Invalid IP format' };
    }
    const parts = ip.split('.');
    const validParts = parts.every(part => {
      const num = parseInt(part);
      return num >= 0 && num <= 255;
    });
    return {
      valid: validParts,
      message: validParts ? '' : 'IP octets must be between 0 and 255'
    };
  };

  // Add a new interface with type-specific defaults
  const addInterface = () => {
    const newId = (interfaces.length + 1).toString();
    setInterfaces([...interfaces, {
      id: newId,
      name: `eth${newId}`,
      type: 'physical',
      method: 'static',
      ip: '',
      netmask: '',
      gateway: '',
      dns: ['', '', ''],
      mtu: '1500',
      slaves: [],
      bondMode: '',
      vlanId: '',
      parentInterface: '',
      enabled: true
    }]);
  };
  // Remove an interface and update related configurations
  const removeInterface = (id) => {
    setInterfaces(prevInterfaces => {
      // First, find the interface that's being removed
      const removedInterface = prevInterfaces.find(i => i.id === id);
      
      // Filter out the removed interface and update any dependencies
      return prevInterfaces
        .filter(i => i.id !== id)
        .map(i => {
          // For bonds and bridges, remove the interface from slave lists
          if ((i.type === 'bond' || i.type === 'bridge') && i.slaves) {
            return {
              ...i,
              slaves: i.slaves.filter(slave => slave !== removedInterface.name)
            };
          }
          // For VLANs, clear parent interface if it was the removed interface
          if (i.type === 'vlan' && i.parentInterface === removedInterface.name) {
            return {
              ...i,
              parentInterface: ''
            };
          }
          return i;
        });
    });
  };

  // Handle updates to interface configuration with validation
  const updateInterface = (id, field, value) => {
    setInterfaces(interfaces.map(iface => {
      if (iface.id === id) {
        // Handle special cases for different field types
        switch (field) {
          case 'dns':
            // DNS updates come as [index, value] pairs
            const [index, dnsValue] = value;
            const newDns = [...iface.dns];
            newDns[index] = dnsValue;
            return { ...iface, dns: newDns };
          
          case 'slaves':
            // Convert comma-separated string to array and clean up
            return {
              ...iface,
              slaves: value.split(',')
                .map(s => s.trim())
                .filter(s => s)
            };
          
          case 'type':
            // Reset type-specific fields when changing interface type
            return {
              ...iface,
              [field]: value,
              bondMode: value === 'bond' ? iface.bondMode : '',
              slaves: value === 'bond' || value === 'bridge' ? iface.slaves : [],
              vlanId: value === 'vlan' ? iface.vlanId : '',
              parentInterface: value === 'vlan' ? iface.parentInterface : ''
            };
          
          default:
            return { ...iface, [field]: value };
        }
      }
      return iface;
    }));
  };

  // Generate the network configuration file
  const generateConfig = () => {
    let config = `# Network Configuration
# Generated on ${new Date().toLocaleString()}
# This file should be placed in /etc/network/interfaces

# The loopback network interface
auto lo
iface lo inet loopback\n\n`;

    // Helper function to add common interface configuration
    const addCommonConfig = (prefix = '', iface) => {
      if (iface.method === 'static') {
        config += `${prefix}address ${iface.ip}/${iface.netmask}\n`;
        if (iface.gateway) {
          config += `${prefix}gateway ${iface.gateway}\n`;
        }
        const validDns = iface.dns.filter(d => d);
        if (validDns.length) {
          config += `${prefix}dns-nameservers ${validDns.join(' ')}\n`;
        }
      }
      if (iface.mtu) {
        config += `${prefix}mtu ${iface.mtu}\n`;
      }
    };

    // Process each interface based on its type
    interfaces.forEach(iface => {
      if (!iface.enabled) return;

      switch (iface.type) {
        case 'physical':
          config += `# ${iface.name} - Physical Interface\n`;
          config += `auto ${iface.name}\n`;
          config += `iface ${iface.name} inet ${iface.method}\n`;
          addCommonConfig('    ', iface);
          break;

        case 'bond':
          // Configure the bond interface
          config += `# ${iface.name} - Bond Interface\n`;
          config += `auto ${iface.name}\n`;
          config += `iface ${iface.name} inet ${iface.method}\n`;
          addCommonConfig('    ', iface);
          if (iface.bondMode) {
            config += `    bond-mode ${iface.bondMode.split(' - ')[0]}\n`;
            config += `    bond-miimon 100\n`;
            if (iface.slaves?.length) {
              config += `    bond-slaves ${iface.slaves.join(' ')}\n`;
              config += `    bond-xmit-hash-policy layer2+3\n`;
            }
          }
          
          // Configure slave interfaces
          if (iface.slaves?.length) {
            iface.slaves.forEach(slave => {
              config += `\nauto ${slave}\n`;
              config += `iface ${slave} inet manual\n`;
              config += `    bond-master ${iface.name}\n`;
            });
          }
          break;

        case 'bridge':
          // Configure the bridge interface
          config += `# ${iface.name} - Bridge Interface\n`;
          config += `auto ${iface.name}\n`;
          config += `iface ${iface.name} inet ${iface.method}\n`;
          addCommonConfig('    ', iface);
          if (iface.slaves?.length) {
            config += `    bridge-ports ${iface.slaves.join(' ')}\n`;
            config += `    bridge-stp on\n`;
            config += `    bridge-fd 0\n`;
          }
          
          // Configure bridge ports
          if (iface.slaves?.length) {
            iface.slaves.forEach(slave => {
              config += `\nauto ${slave}\n`;
              config += `iface ${slave} inet manual\n`;
              config += `    bridge-master ${iface.name}\n`;
            });
          }
          break;

        case 'vlan':
          if (iface.parentInterface && iface.vlanId) {
            config += `# ${iface.name} - VLAN Interface\n`;
            config += `auto ${iface.name}\n`;
            config += `iface ${iface.name} inet ${iface.method}\n`;
            addCommonConfig('    ', iface);
            config += `    vlan-raw-device ${iface.parentInterface}\n`;
            config += `    vlan-id ${iface.vlanId}\n`;
          }
          break;
      }
      config += '\n';
    });

    return config;
  };

  // Copy configuration to clipboard with feedback
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(generateConfig());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  // Render individual interface configuration card
  const renderInterfaceCard = (iface) => (
    <div
      key={iface.id}
      className={`p-6 rounded-lg border ${
        darkMode 
          ? 'bg-gray-800 border-gray-700 text-gray-100' 
          : 'bg-white border-gray-200'
      }`}
    >
      {/* Interface Header with Name and Remove Button */}
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <Network className="w-5 h-5" />
          <input
            type="text"
            value={iface.name}
            onChange={(e) => updateInterface(iface.id, 'name', e.target.value)}
            className={`border rounded p-2 w-48 ${
              darkMode 
                ? 'bg-gray-700 border-gray-600 text-white' 
                : 'bg-white border-gray-300'
            }`}
            placeholder="Interface Name"
          />
        </div>
        <button
          onClick={() => removeInterface(iface.id)}
          className="text-red-500 hover:text-red-600 p-1 rounded"
          title="Remove Interface"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>

      {/* Interface Configuration Options */}
      <div className="space-y-4">
        {/* Type and Method Selection */}
        <div className="grid grid-cols-2 gap-4">
          <select
            value={iface.type}
            onChange={(e) => updateInterface(iface.id, 'type', e.target.value)}
            className={`p-2 border rounded w-full ${
              darkMode 
                ? 'bg-gray-700 border-gray-600 text-white' 
                : 'bg-white border-gray-300'
            }`}
          >
            {Object.entries(interfaceTypes).map(([type, config]) => (
              <option key={type} value={type}>{config.name}</option>
            ))}
          </select>

          <select
            value={iface.method}
            onChange={(e) => updateInterface(iface.id, 'method', e.target.value)}
            className={`p-2 border rounded w-full ${
              darkMode 
                ? 'bg-gray-700 border-gray-600 text-white' 
                : 'bg-white border-gray-300'
            }`}
          >
            <option value="static">Static IP</option>
            <option value="dhcp">DHCP</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        {/* Static IP Configuration */}
        {iface.method === 'static' && (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="IP Address (e.g., 192.168.1.100)"
              value={iface.ip}
              onChange={(e) => updateInterface(iface.id, 'ip', e.target.value)}
              className={`p-2 border rounded w-full ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              } ${!validateIP(iface.ip).valid ? 'border-red-500' : ''}`}
            />
            <input
              type="text"
              placeholder="Netmask (CIDR notation, e.g., 24)"
              value={iface.netmask}
              onChange={(e) => updateInterface(iface.id, 'netmask', e.target.value)}
              className={`p-2 border rounded w-full ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
            />
            <input
              type="text"
              placeholder="Gateway (e.g., 192.168.1.1)"
              value={iface.gateway}
              onChange={(e) => updateInterface(iface.id, 'gateway', e.target.value)}
              className={`p-2 border rounded w-full ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
            />
            {/* DNS Server Inputs */}
            {iface.dns.map((dns, index) => (
              <input
                key={index}
                type="text"
                placeholder={`DNS Server ${index + 1}`}
                value={dns}
                onChange={(e) => updateInterface(iface.id, 'dns', [index, e.target.value])}
                className={`p-2 border rounded w-full ${
                  darkMode 
                    ? 'bg-gray-700 border-gray-600 text-white' 
                    : 'bg-white border-gray-300'
                }`}
              />
            ))}
          </div>
        )}

        {/* Bond-specific Configuration */}
        {iface.type === 'bond' && (
          <div className="space-y-4">
            <select
              value={iface.bondMode}
              onChange={(e) => updateInterface(iface.id, 'bondMode', e.target.value)}
              className={`p-2 border rounded w-full ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
            >
              <option value="">Select Bond Mode</option>
              {Object.entries(bondModes).map(([mode, desc]) => (
                <option key={mode} value={mode}>{desc}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Slave Interfaces (comma-separated, e.g., eth0, eth1)"
              value={iface.slaves?.join(', ')}
              onChange={(e) => updateInterface(iface.id, 'slaves', e.target.value)}
              className={`p-2 border rounded w-full ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
            />
          </div>
        )}

        {/* Bridge-specific Configuration */}
        {iface.type === 'bridge' && (
          <input
            type="text"
            placeholder="Bridge Ports (comma-separated, e.g., eth0, eth1)"
            value={iface.slaves?.join(', ')}
            onChange={(e) => updateInterface(iface.id, 'slaves', e.target.value)}
            className={`p-2 border rounded w-full ${
              darkMode 
                ? 'bg-gray-700 border-gray-600 text-white' 
                : 'bg-white border-gray-300'
            }`}
          />
        )}

        {/* VLAN-specific Configuration */}
        {iface.type === 'vlan' && (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Parent Interface (e.g., eth0)"
              value={iface.parentInterface}
              onChange={(e) => updateInterface(iface.id, 'parentInterface', e.target.value)}
              className={`p-2 border rounded w-full ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
            />
            <input
              type="text"
              placeholder="VLAN ID (e.g., 100)"
              value={iface.vlanId}
              onChange={(e) => updateInterface(iface.id, 'vlanId', e.target.value)}
              className={`p-2 border rounded w-full ${
                darkMode 
                  ? 'bg-gray-700 border-gray-600 text-white' 
                  : 'bg-white border-gray-300'
              }`}
            />
          </div>
        )}
      </div>
    </div>
  );

  // Main component render
  return (
    <div className={`min-h-screen p-8 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50'}`}>
      <div className="max-w-6xl mx-auto">
        {/* Header with Title and Theme Toggle */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold mb-2">Network Configuration Generator</h1>
            <p className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
              Generate Ubuntu network interface configurations for any scenario
            </p>
          </div>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full hover:bg-gray-700"
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
          </button>
        </div>

        {/* Add Interface Button */}
        <button
          onClick={addInterface}
          className="mb-6 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Interface
        </button>

        {/* Interface Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {interfaces.map(renderInterfaceCard)}
        </div>

        {/* Generate Configuration Section */}
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
          >
            <Settings2 className="w-5 h-5" />
            {showConfig ? 'Hide' : 'Show'} Configuration
          </button>

          {showConfig && (
            <div className={`w-full p-6 rounded-lg ${
              darkMode ? 'bg-gray-800' : 'bg-white'
            } border ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">Generated Configuration</h2>
                <button
                  onClick={copyToClipboard}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
                >
                  <Save className="w-5 h-5" />
                  Copy to Clipboard
                </button>
              </div>
              <pre className={`p-4 rounded-md overflow-x-auto ${
                darkMode ? 'bg-gray-900' : 'bg-gray-100'
              }`}>
                {generateConfig()}
              </pre>
              {copied && (
                <div className="mt-4 p-2 bg-green-600 text-white rounded-md text-center">
                  Configuration copied to clipboard!
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NetworkConfigGenerator;