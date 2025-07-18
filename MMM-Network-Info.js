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
        updateInterval: 10 * 60 * 1000, // every 10 minutes
        animationSpeed: 1000,
        initialLoadDelay: 2500,
        title: "Network & System Info",
        show: {
            hostname: true,
            internalIp: true,
            publicIp: true,
            tailscaleIp: true,
            geolocation: true,
            networkDeviceCount: true,
            moduleCount: true
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

        var table = document.createElement("table");
        table.className = "small";

        var info = this.networkInfo;
        var config = this.config;

        // Build rows based on config and available data
        var rows = [
            { label: "Hostname", value: info.hostname, show: config.show.hostname },
            { label: "Internal IP", value: info.internalIp, show: config.show.internalIp },
            { label: "Public IP", value: info.publicIp, show: config.show.publicIp },
            { label: "Tailscale IP", value: info.tailscaleIp, show: config.show.tailscaleIp },
            { label: "IP Geolocation", value: info.geolocation, show: config.show.geolocation },
            { label: "Devices on Network", value: info.networkDeviceCount, show: config.show.networkDeviceCount },
            { label: "Installed Modules", value: info.moduleCount, show: config.show.moduleCount }
        ];

        rows.forEach(function(row) {
            // Only create the table row if the 'show' flag is true and a value exists
            if (row.show && row.value) {
                var tr = document.createElement("tr");
                table.appendChild(tr);

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

        wrapper.appendChild(table);
        return wrapper;
    },

    // Override notification handler.
    socketNotificationReceived: function(notification, payload) {
        if (notification === "NETWORK_INFO_RESULT") {
            this.networkInfo = payload;
            this.loaded = true;
            this.updateDom(this.config.animationSpeed);
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
        }, nextLoad);
    },

    // Request network info from node_helper.
    getNetworkInfo: function() {
        // Pass the entire config to the node_helper
        this.sendSocketNotification("GET_NETWORK_INFO", this.config);
    },

    // Add a custom CSS file.
    getStyles: function() {
        return ["MMM-Network-Info.css"];
    }
});
