// Dashboard JavaScript
class DevOpsDashboard {
  constructor() {
    this.charts = {};
    this.eventSource = null;
    this.metricsHistory = [];
    this.maxHistoryLength = 50;

    this.initializeDashboard();
  }

  initializeDashboard() {
    this.initializeCharts();
    this.setupEventListeners();
    this.connectToMetricsStream();
    this.loadInitialData();
    this.startUptimeCounter();
  }

  initializeCharts() {
    // Requests Chart
    const requestsCtx = document
      .getElementById("requestsChart")
      .getContext("2d");
    this.charts.requests = new Chart(requestsCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Requests per Minute",
            data: [],
            borderColor: "#2563eb",
            backgroundColor: "rgba(37, 99, 235, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
            },
            ticks: {
              color: "#94a3b8",
            },
          },
          x: {
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
            },
            ticks: {
              color: "#94a3b8",
            },
          },
        },
      },
    });

    // Connections Chart
    const connectionsCtx = document
      .getElementById("connectionsChart")
      .getContext("2d");
    this.charts.connections = new Chart(connectionsCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Active Connections",
            data: [],
            borderColor: "#059669",
            backgroundColor: "rgba(5, 150, 105, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0.4,
          },
          {
            label: "Peak Connections",
            data: [],
            borderColor: "#d97706",
            backgroundColor: "rgba(217, 119, 6, 0.1)",
            borderWidth: 1,
            borderDash: [5, 5],
            fill: false,
            tension: 0.4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
            },
            ticks: {
              color: "#94a3b8",
            },
          },
          x: {
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
            },
            ticks: {
              color: "#94a3b8",
            },
          },
        },
      },
    });
  }

  setupEventListeners() {
    // Navigation
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => {
        const section = item.getAttribute("data-section");
        this.showSection(section);
      });
    });
  }

  connectToMetricsStream() {
    try {
      this.eventSource = new EventSource("/api/admin/metrics/stream");

      this.eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        this.updateDashboard(data);
      };

      this.eventSource.onerror = (event) => {
        console.error("EventSource failed:", event);
        this.setStatus("offline", "Connection lost");

        // Attempt reconnection after 5 seconds
        setTimeout(() => {
          this.connectToMetricsStream();
        }, 5000);
      };

      this.setStatus("online", "Connected");
    } catch (error) {
      console.error("Failed to connect to metrics stream:", error);
      this.setStatus("offline", "Connection failed");
    }
  }

  updateDashboard(data) {
    // Store metrics for history
    this.metricsHistory.push({
      timestamp: new Date(),
      data: data,
    });

    if (this.metricsHistory.length > this.maxHistoryLength) {
      this.metricsHistory.shift();
    }

    // Update statistics
    this.updateStats(data);

    // Update charts
    this.updateCharts(data);

    // Update security events
    this.updateSecurityEvents(data.security);

    // Update system information
    this.updateSystemInfo(data);
  }

  updateStats(data) {
    const app = data.application;
    const perf = data.performance;

    // Total Requests
    document.getElementById("total-requests").textContent =
      app.requests.total.toLocaleString();

    // Active Connections
    document.getElementById("active-connections").textContent =
      app.connections.active;
    document.getElementById("peak-connections").textContent =
      app.connections.peak;

    // Pairing Stats
    document.getElementById("active-pairs").textContent =
      app.pairing.activePairs;
    document.getElementById("total-pairs").textContent =
      app.pairing.totalPairs.toLocaleString();

    // Response Times
    document.getElementById("avg-response").textContent =
      Math.round(perf.responseTime.average) + "ms";
    document.getElementById("p95-response").textContent =
      Math.round(perf.responseTime.p95) + "ms";

    // Success Rate
    const successRate =
      (app.requests.successful / Math.max(app.requests.total, 1)) * 100;
    document.getElementById("success-rate").textContent =
      successRate.toFixed(1) + "%";
    document.getElementById("failed-requests").textContent =
      app.requests.failed.toLocaleString();

    // Security Events
    document.getElementById("security-events-count").textContent =
      data.security.suspiciousActivities;
    document.getElementById("blocked-ips").textContent =
      data.security.blockedIPs.length;
  }

  updateCharts(data) {
    const now = new Date().toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    // Update requests chart
    const requestsChart = this.charts.requests;
    requestsChart.data.labels.push(now);
    requestsChart.data.datasets[0].data.push(
      data.performance.throughput.requestsPerMinute
    );

    if (requestsChart.data.labels.length > 15) {
      requestsChart.data.labels.shift();
      requestsChart.data.datasets[0].data.shift();
    }
    requestsChart.update("none");

    // Update connections chart
    const connectionsChart = this.charts.connections;
    connectionsChart.data.labels.push(now);
    connectionsChart.data.datasets[0].data.push(
      data.application.connections.active
    );
    connectionsChart.data.datasets[1].data.push(
      data.application.connections.peak
    );

    if (connectionsChart.data.labels.length > 15) {
      connectionsChart.data.labels.shift();
      connectionsChart.data.datasets[0].data.shift();
      connectionsChart.data.datasets[1].data.shift();
    }
    connectionsChart.update("none");
  }

  updateSecurityEvents(securityData) {
    const eventsList = document.getElementById("security-events-list");
    const eventsBadge = document.getElementById("security-events-badge");

    eventsBadge.textContent = securityData.recentEvents.length;

    if (securityData.recentEvents.length === 0) {
      eventsList.innerHTML =
        '<div class="empty-state">No security events in the last hour</div>';
      return;
    }

    eventsList.innerHTML = securityData.recentEvents
      .map(
        (event) => `
            <div class="event-item ${event.severity}">
                <div class="event-header">
                    <span class="event-type">${this.formatEventType(
                      event.type
                    )}</span>
                    <span class="event-time">${new Date(
                      event.timestamp
                    ).toLocaleTimeString()}</span>
                </div>
                <div class="event-details">
                    ${
                      event.details.reason ||
                      event.details.message ||
                      "No details available"
                    }
                </div>
            </div>
        `
      )
      .join("");
  }

  updateSystemInfo(data) {
    document.getElementById("node-version").textContent =
      data.application.version || "Unknown";
    document.getElementById("platform").textContent =
      data.system.platform.type + " " + data.system.platform.release;
    document.getElementById("memory-usage").textContent =
      Math.round(data.system.memory.usage) + "%";
    document.getElementById("cpu-usage").textContent =
      Math.round(data.system.cpu.load[0] * 100) + "%";
    document.getElementById("environment").textContent =
      data.application.environment || "Unknown";
  }

  formatEventType(type) {
    const eventTypes = {
      failed_login: "Failed Login",
      rate_limit: "Rate Limit Hit",
      ip_blocked: "IP Blocked",
      suspicious_activity: "Suspicious Activity",
    };
    return eventTypes[type] || type;
  }

  setStatus(status, message) {
    const indicator = document.getElementById("status-indicator");
    const text = document.getElementById("status-text");

    indicator.className = `status-dot ${status}`;
    text.textContent = message;
  }

  showSection(sectionName) {
    // Update navigation
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.remove("active");
    });
    document
      .querySelector(`[data-section="${sectionName}"]`)
      .classList.add("active");

    // Update sections
    document.querySelectorAll(".section").forEach((section) => {
      section.classList.remove("active");
    });
    document.getElementById(`${sectionName}-section`).classList.add("active");

    // Update title
    document.getElementById("section-title").textContent =
      this.getSectionTitle(sectionName);
  }

  getSectionTitle(sectionName) {
    const titles = {
      overview: "System Overview",
      performance: "Performance Metrics",
      security: "Security Monitoring",
      errors: "Error Tracking",
      users: "User Management",
      settings: "System Settings",
    };
    return titles[sectionName] || "Dashboard";
  }

  async loadInitialData() {
    try {
      const response = await fetch("/api/admin/metrics");
      const data = await response.json();

      if (data.status === "success") {
        this.updateDashboard(data.data);
      }
    } catch (error) {
      console.error("Failed to load initial data:", error);
    }
  }

  startUptimeCounter() {
    setInterval(() => {
      const uptimeElement = document.getElementById("uptime-display");
      if (uptimeElement) {
        const startTime = Date.now();
        const updateUptime = () => {
          const elapsed = Date.now() - startTime;
          const hours = Math.floor(elapsed / 3600000);
          const minutes = Math.floor((elapsed % 3600000) / 60000);
          const seconds = Math.floor((elapsed % 60000) / 1000);

          uptimeElement.textContent = `${hours
            .toString()
            .padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds
            .toString()
            .padStart(2, "0")}`;
        };
        updateUptime();
      }
    }, 1000);
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
    }
  }
}

// Global functions
let dashboard;

function refreshData() {
  dashboard.loadInitialData();
}

async function resetMetrics() {
  if (
    confirm(
      "Are you sure you want to reset all metrics? This action cannot be undone."
    )
  ) {
    try {
      const response = await fetch("/api/admin/actions/reset-metrics", {
        method: "POST",
      });
      const result = await response.json();

      if (result.status === "success") {
        alert("Metrics reset successfully");
        refreshData();
      }
    } catch (error) {
      alert("Failed to reset metrics: " + error.message);
    }
  }
}

// Initialize dashboard when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  dashboard = new DevOpsDashboard();
});

// Cleanup on page unload
window.addEventListener("beforeunload", function () {
  if (dashboard) {
    dashboard.disconnect();
  }
});
