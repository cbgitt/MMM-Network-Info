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
        // The payload is now the module's config object
        if (notification === "GET_NETWORK_INFO") {
            this.getNetworkInfo(payload);
        }
    },

    getNetworkInfo: function(config) {
        var self = this;
        var commands = {};
        const show = config.show;

        // Conditionally build the commands object based on the config
        if (show.hostname) commands.hostname = "hostname";
        if (show.internalIp) commands.internalIp = "hostname -I | awk '{print $1}'";
        // We need the public IP if we want to show it OR if we want to show geolocation
        if (show.publicIp || show.geolocation) commands.publicIp = "dig +short myip.opendns.com @resolver1.opendns.com";
        if (show.tailscaleIp) commands.tailscaleIp = "tailscale ip -4";
        if (show.networkDeviceCount) commands.networkDeviceCount = "arp -a | wc -l";
        if (show.moduleCount) commands.moduleCount = `ls -d ${path.resolve(global.root_path, "modules")}/*/ | wc -l`;

        // If nothing is enabled, send an empty result
        if (Object.keys(commands).length === 0) {
            self.sendSocketNotification("NETWORK_INFO_RESULT", {});
            return;
        }

        var promises = Object.keys(commands).map(key => {
            return new Promise((resolve) => {
                exec(commands[key], (error, stdout, stderr) => {
                    if (error) {
                        console.error(`MMM-Network-Info: Error executing command for '${key}': ${error.message}`);
                        resolve({ key: key, value: "Not available" });
                        return;
                    }
                    if (stderr) {
                        // Stderr is not always an error, so we log it for debugging.
                        console.log(`MMM-Network-Info: Stderr for '${key}': ${stderr}`);
                    }
                    resolve({ key: key, value: stdout.trim() });
                });
            });
        });

        Promise.all(promises).then(results => {
            var networkInfo = {};
            results.forEach(result => {
                if (result.value) {
                    networkInfo[result.key] = result.value;
                }
            });

            // Handle geolocation separately
            if (show.geolocation && networkInfo.publicIp && networkInfo.publicIp !== "Not available") {
                this.getGeolocation(networkInfo.publicIp, (geolocation) => {
                    networkInfo.geolocation = geolocation;
                    // If public IP was only fetched for geolocation, remove it from the final payload
                    if (!show.publicIp) {
                        delete networkInfo.publicIp;
                    }
                    self.sendSocketNotification("NETWORK_INFO_RESULT", networkInfo);
                });
            } else {
                // If public IP was only fetched for geolocation, remove it from the final payload
                if (!show.publicIp && networkInfo.hasOwnProperty('publicIp')) {
                    delete networkInfo.publicIp;
                }
                self.sendSocketNotification("NETWORK_INFO_RESULT", networkInfo);
            }
        });
    },

    getGeolocation: function(ip, callback) {
        exec(`curl -s http://ip-api.com/json/${ip}`, (error, stdout, stderr) => {
            if (error) {
                console.error(`Geolocation error: ${error.message}`);
                callback("N/A");
                return;
            }
            try {
                const geoData = JSON.parse(stdout);
                if (geoData.status === "success") {
                    callback(`${geoData.city}, ${geoData.regionName}, ${geoData.country}`);
                } else {
                    callback("N/A");
                }
            } catch (e) {
                console.error("Error parsing geolocation data:", e);
                callback("N/A");
            }
        });
    }
});
```
I've updated the code as you requested. Now, in your `config.js` file, you can specify exactly which items you want to see. For example, to only show the hostname, public IP, and module count, your config would look like this:

```javascript
{
    module: "MMM-Network-Info",
    position: "top_left",
    config: {
        title: "My Custom Network Info",
        show: {
            hostname: true,
            internalIp: false, // This will be hidden
            publicIp: true,
            tailscaleIp: false, // This will be hidden
            geolocation: false, // This will be hidden
            networkDeviceCount: false, // This will be hidden
            moduleCount: true
        }
    }
},
```

Let me know if you'd like any more adjustmen