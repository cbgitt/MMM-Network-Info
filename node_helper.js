// node_helper.js for MMM-Network-Info

const NodeHelper = require("node_helper");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

module.exports = NodeHelper.create({
    start: function() {
        console.log("Starting node_helper for: " + this.name);
    },

    socketNotificationReceived: function(notification, payload) {
        if (notification === "GET_NETWORK_INFO") {
            this.getNetworkInfo(payload);
        }
    },

    executeCommand: function(command, key) {
        return new Promise((resolve) => {
            exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
                if (error) {
                    console.error(`MMM-Network-Info: Error executing command for '${key}': ${error.message}`);
                    resolve({ key: key, value: "Not available" });
                    return;
                }
                if (stderr && key !== 'arp') { // arp command often outputs to stderr on some systems
                    console.log(`MMM-Network-Info: Stderr for '${key}': ${stderr.trim()}`);
                }
                resolve({ key: key, value: stdout.trim() });
            });
        });
    },

    getNetworkInfo: async function(config) {
        var self = this;
        const show = config.show;
        console.log("MMM-Network-Info: Received request to get network info.");

        var promises = [];
        var commands = {};

        if (show.hostname) commands.hostname = "hostname";
        if (show.internalIp) commands.internalIp = "hostname -I | awk '{print $1}'";
        if (show.publicIp || show.geolocation) commands.publicIp = "dig +short myip.opendns.com @resolver1.opendns.com";
        if (show.tailscaleIp) commands.tailscaleIp = "tailscale ip -4";

        if (show.listDevices || show.networkDeviceCount) {
            commands.deviceList = "arp -a";
        }
        
        for (const [key, command] of Object.entries(commands)) {
            promises.push(this.executeCommand(command, key));
        }

        if (show.moduleCount) {
            const modulePath = path.resolve(global.root_path, "modules");
            const modulePromise = new Promise((resolve) => {
                fs.readdir(modulePath, { withFileTypes: true }, (err, files) => {
                    if (err) {
                        console.error("MMM-Network-Info: Could not read modules directory:", err);
                        resolve({ key: 'moduleCount', value: 'N/A' });
                    } else {
                        const directoryCount = files.filter(dirent => dirent.isDirectory()).length;
                        resolve({ key: 'moduleCount', value: directoryCount.toString() });
                    }
                });
            });
            promises.push(modulePromise);
        }

        if (promises.length === 0) {
            self.sendSocketNotification("NETWORK_INFO_RESULT", {});
            return;
        }

        const results = await Promise.all(promises);
        
        var networkInfo = {};
        results.forEach(result => {
            if (result.value) {
                networkInfo[result.key] = result.value;
            }
        });

        if (networkInfo.deviceList) {
            const lines = networkInfo.deviceList.split('\n');
            const initialDevices = [];
            const ipRegex = /\(([^)]+)\)/;
            const macRegex = /([0-9a-fA-F]{1,2}:){5}[0-9a-fA-F]{1,2}/;

            lines.forEach(line => {
                const ipMatch = line.match(ipRegex);
                const macMatch = line.match(macRegex);

                if (ipMatch && macMatch) {
                    initialDevices.push({ ip: ipMatch[1] });
                }
            });
            
            const devicePromises = initialDevices.map(device => {
                // Check for specific custom IPs first
                if (device.ip === '192.168.86.1') {
                    return Promise.resolve({ ip: device.ip, hostname: 'Gateway/Mesh' });
                } else if (device.ip === '192.168.86.42') {
                    // MODIFIED
                    return Promise.resolve({ ip: device.ip, hostname: 'Mesh-MBR' });
                } else if (device.ip === '192.168.86.43') {
                    // MODIFIED
                    return Promise.resolve({ ip: device.ip, hostname: 'Mesh-BSMT' });
                } else if (device.ip.endsWith('.1')) { // General gateway fallback
                    return Promise.resolve({ ip: device.ip, hostname: 'Gateway' });
                }
                
                // If not a special IP, perform the reverse lookup
                return this.executeCommand(`dig +short -x ${device.ip}`, 'dig-reverse').then(result => {
                    let hostname = 'Unknown';
                    if (result.value && result.value !== 'Not available') {
                        hostname = result.value.slice(0, -1); // Remove trailing dot
                        if (hostname.endsWith('.lan')) {
                            hostname = hostname.slice(0, -4);
                        }
                    }
                    return { ip: device.ip, hostname: hostname };
                });
            });

            const devicesWithHostnames = await Promise.all(devicePromises);
            
            devicesWithHostnames.sort((a, b) => {
                // Sort by IP address numerically.
                const a_parts = a.ip.split('.').map(Number);
                const b_parts = b.ip.split('.').map(Number);

                for (let i = 0; i < 4; i++) {
                    const diff = a_parts[i] - b_parts[i];
                    if (diff !== 0) {
                        return diff;
                    }
                }
                return 0;
            });
            
            networkInfo.deviceList = devicesWithHostnames;

            if (show.networkDeviceCount) {
                networkInfo.networkDeviceCount = devicesWithHostnames.length.toString();
            }
        }

        if (show.geolocation && networkInfo.publicIp && networkInfo.publicIp !== "Not available") {
            this.getGeolocation(networkInfo.publicIp, (geolocation) => {
                networkInfo.geolocation = geolocation;
                if (!show.publicIp) delete networkInfo.publicIp;
                self.sendSocketNotification("NETWORK_INFO_RESULT", networkInfo);
            });
        } else {
            if (!show.publicIp && networkInfo.hasOwnProperty('publicIp')) delete networkInfo.publicIp;
            self.sendSocketNotification("NETWORK_INFO_RESULT", networkInfo);
        }
    },

    getGeolocation: function(ip, callback) {
        this.executeCommand(`curl -s http://ip-api.com/json/${ip}`, 'geolocation').then(result => {
            if (result.value === "Not available") {
                callback("N/A"); return;
            }
            try {
                const geoData = JSON.parse(result.value);
                if (geoData.status === "success") {
                    callback(`${geoData.city}, ${geoData.regionName}`);
                } else {
                    callback("N/A");
                }
            } catch (e) {
                callback("N/A");
            }
        });
    }
});
