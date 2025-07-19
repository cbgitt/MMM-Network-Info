/*
 * MagicMirror² Module: MMM-Network-Info
 *
 * By [Your Name]
 * MIT Licensed.
 */

// MMM-Network-Info.js

Module.register("MMM-Network-Info", {
    // Default module config.
    defaults: {
        updateInterval: 10 * 60, // in seconds, default 10 minutes
        animationSpeed: 1,       // in seconds
        initialLoadDelay: 2.5,   // in seconds
        title: "Network & System Info",
        show: {
            hostname: true,
            internalIp: true,
            publicIp: true,
            tailscaleIp: true,
            geolocation: true,
            networkDeviceCount: true,
            moduleCount: true,
            listDevices: false // Set to true to show the device list
        }
    },

    // Define start sequence.
    start: function() {
        Log.info("Starting module: " + this.name);
        this.loaded = false;
        this.data.header = this.config.title;
        this.networkInfo = {};
        this.scheduleUpdate(this.config.initialLoadDelay);
        this.updateTimer = null;
    },

    // Override dom generator.
    getDom: function() {
        var wrapper = document.createElement("div");

        if (!this.loaded) {
            wrapper.innerHTML = "Loading network info...";
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        // Main container for tables
        var tablesContainer = document.createElement("div");
        tablesContainer.className = "MMM-Network-Info-wrapper";

        // --- Info Table (First Table) ---
        var infoTable = document.createElement("table");
        infoTable.className = "small info-table";

        var info = this.networkInfo;
        var config = this.config;

        var rows = [
            { label: "Hostname", value: info.hostname, show: config.show.hostname },
            { label: "Internal", value: info.internalIp, show: config.show.internalIp },
            { label: "Public", value: info.publicIp, show: config.show.publicIp },
            { label: "Tailscale", value: info.tailscaleIp, show: config.show.tailscaleIp },
            { label: "Location", value: info.geolocation, show: config.show.geolocation },
            { label: "Devices", value: info.networkDeviceCount, show: config.show.networkDeviceCount },
            { label: "Modules", value: info.moduleCount, show: config.show.moduleCount }
        ];

        rows.forEach(function(row) {
            if (row.show && row.value) {
                var tr = document.createElement("tr");
                infoTable.appendChild(tr);

                var tdLabel = document.createElement("td");
                tdLabel.className = "label";
                tdLabel.innerHTML = row.label;
                tr.appendChild(tdLabel);

                var tdValue = document.createElement("td");
                tdValue.className = "value";
                tdValue.innerHTML = row.value;
                tr.appendChild(tdValue);
            }
        });
        tablesContainer.appendChild(infoTable);


        // --- Device List Table (Second Table) ---
        if (config.show.listDevices && info.deviceList && info.deviceList.length > 0) {
            var deviceTable = document.createElement("table");
            deviceTable.className = "small device-table";

            // Table Header
            var headerRow = document.createElement("tr");
            var th_ip = document.createElement("th");
            th_ip.innerHTML = "Device IP";

            var th_hostname = document.createElement("th");
            th_hostname.innerHTML = "Hostname";

            headerRow.appendChild(th_ip);
            headerRow.appendChild(th_hostname);
            deviceTable.appendChild(headerRow);

            // Table Body
            info.deviceList.forEach(function(device) {
                var tr = document.createElement("tr");
                var ipCell = document.createElement("td");
                ipCell.innerHTML = device.ip;

                var hostnameCell = document.createElement("td");
                hostnameCell.innerHTML = device.hostname;
                
                // Add classes for special hostnames
                if (device.hostname === 'Gateway') {
                    hostnameCell.className = 'gateway';
                } else if (device.hostname === 'Unknown') {
                    hostnameCell.className = 'unknown';
                }

                tr.appendChild(ipCell);
                tr.appendChild(hostnameCell);
                deviceTable.appendChild(tr);
            });
            tablesContainer.appendChild(deviceTable);
        }

        return tablesContainer;
    },

    // Override notification handler.
    socketNotificationReceived: function(notification, payload) {
        if (notification === "NETWORK_INFO_RESULT") {
            this.networkInfo = payload;
            this.loaded = true;
            this.updateDom(this.config.animationSpeed * 1000);
        }
    },

    // Schedule the next update.
    scheduleUpdate: function(delay) {
        var nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
            nextLoad = delay;
        }

        var self = this;
        clearTimeout(this.updateTimer);
        this.updateTimer = setTimeout(function() {
            self.getNetworkInfo();
        }, nextLoad * 1000);
    },

    // Request network info from node_helper.
    getNetworkInfo: function() {
        this.sendSocketNotification("GET_NETWORK_INFO", this.config);
    },

    // Add a custom CSS file.
    getStyles: function() {
        return ["MMM-Network-Info.css"];
    }
});
