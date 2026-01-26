# Frontend WebSocket Integration Guide

## Installation

Install Socket.IO client:

```bash
npm install socket.io-client
```

## Basic Setup

### 1. Create WebSocket Service

```javascript
// src/services/websocketService.js
import io from "socket.io-client";

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token) {
    const SOCKET_URL =
      process.env.REACT_APP_SOCKET_URL || "http://localhost:3000";

    this.socket = io(SOCKET_URL, {
      auth: {
        token: token,
      },
      transports: ["websocket", "polling"],
    });

    this.socket.on("connect", () => {
      console.log("✅ WebSocket connected:", this.socket.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("❌ WebSocket disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("WebSocket connection error:", error.message);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.listeners.clear();
    }
  }

  on(event, callback) {
    if (!this.socket) {
      console.warn("Socket not connected. Call connect() first.");
      return;
    }

    this.socket.on(event, callback);

    // Store listener for cleanup
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.socket) return;

    this.socket.off(event, callback);

    // Remove from stored listeners
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (!this.socket) {
      console.warn("Socket not connected. Call connect() first.");
      return;
    }

    this.socket.emit(event, data);
  }
}

export default new WebSocketService();
```

### 2. React Integration Example

```javascript
// src/hooks/useNotifications.js
import { useState, useEffect, useCallback } from "react";
import websocketService from "../services/websocketService";
import axios from "axios";

const useNotifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Fetch initial notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axios.get("/api/notifications", {
        params: { limit: 50 },
      });

      setNotifications(response.data.data);

      // Count unread
      const unread = response.data.data.filter((n) => !n.read).length;
      setUnreadCount(unread);
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle new notification from WebSocket
  const handleNewNotification = useCallback((notification) => {
    console.log("📬 New notification received:", notification);

    setNotifications((prev) => [notification, ...prev]);
    setUnreadCount((prev) => prev + 1);

    // Show browser notification if permission granted
    if (Notification.permission === "granted") {
      new Notification(notification.title, {
        body: notification.message,
        icon: "/notification-icon.png",
      });
    }

    // Play notification sound (optional)
    const audio = new Audio("/notification.mp3");
    audio.play().catch((e) => console.log("Audio play failed:", e));
  }, []);

  // Mark notification as read
  const markAsRead = useCallback(async (notificationId) => {
    try {
      await axios.patch(`/api/notifications/${notificationId}/read`);

      setNotifications((prev) =>
        prev.map((n) => (n._id === notificationId ? { ...n, read: true } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      // Also emit to WebSocket for real-time sync
      websocketService.emit("mark_notification_read", { notificationId });
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    try {
      await axios.patch("/api/notifications/read-all");

      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error("Error marking all as read:", error);
    }
  }, []);

  // Archive notification
  const archiveNotification = useCallback(async (notificationId) => {
    try {
      await axios.patch(`/api/notifications/${notificationId}/archive`);

      setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
    } catch (error) {
      console.error("Error archiving notification:", error);
    }
  }, []);

  // Setup WebSocket listeners
  useEffect(() => {
    fetchNotifications();

    // Listen for new notifications
    websocketService.on("notification", handleNewNotification);

    // Cleanup
    return () => {
      websocketService.off("notification", handleNewNotification);
    };
  }, [fetchNotifications, handleNewNotification]);

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
    refresh: fetchNotifications,
  };
};

export default useNotifications;
```

### 3. App-Level WebSocket Connection

```javascript
// src/App.js
import { useEffect } from "react";
import websocketService from "./services/websocketService";
import { useAuth } from "./contexts/AuthContext";

function App() {
  const { token, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated && token) {
      // Connect WebSocket
      websocketService.connect(token);

      // Request notification permission
      if (Notification.permission === "default") {
        Notification.requestPermission();
      }

      return () => {
        websocketService.disconnect();
      };
    }
  }, [isAuthenticated, token]);

  return <div className="App">{/* Your app content */}</div>;
}

export default App;
```

### 4. Notification Component Example

```javascript
// src/components/NotificationCenter.jsx
import React from "react";
import useNotifications from "../hooks/useNotifications";
import { formatDistanceToNow } from "date-fns";

const NotificationCenter = () => {
  const {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    archiveNotification,
  } = useNotifications();

  const getTypeIcon = (type) => {
    switch (type) {
      case "success":
        return "✅";
      case "warning":
        return "⚠️";
      case "error":
        return "❌";
      default:
        return "ℹ️";
    }
  };

  if (loading) {
    return <div>Loading notifications...</div>;
  }

  return (
    <div className="notification-center">
      <div className="notification-header">
        <h3>Notifications {unreadCount > 0 && `(${unreadCount})`}</h3>
        {unreadCount > 0 && (
          <button onClick={markAllAsRead}>Mark all as read</button>
        )}
      </div>

      <div className="notification-list">
        {notifications.length === 0 ? (
          <p>No notifications</p>
        ) : (
          notifications.map((notification) => (
            <div
              key={notification._id}
              className={`notification-item ${!notification.read ? "unread" : ""}`}
            >
              <div className="notification-icon">
                {getTypeIcon(notification.type)}
              </div>
              <div className="notification-content">
                <h4>{notification.title}</h4>
                <p>{notification.message}</p>
                <span className="notification-time">
                  {formatDistanceToNow(new Date(notification.createdAt), {
                    addSuffix: true,
                  })}
                </span>
              </div>
              <div className="notification-actions">
                {!notification.read && (
                  <button onClick={() => markAsRead(notification._id)}>
                    Mark as read
                  </button>
                )}
                <button onClick={() => archiveNotification(notification._id)}>
                  Archive
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
```

## Event Types and Data Structures

### Notification Event

**Event Name:** `notification`

**Data Structure:**

```typescript
{
  id: string;           // Notification ID
  title: string;        // Notification title
  message: string;      // Notification message
  type: 'info' | 'success' | 'warning' | 'error' | 'challenge_received' | 'challenge_result' | 'reward_earned';
  metadata: {           // Additional event-specific data
    resourceId?: string;
    resourceTitle?: string;
    expiryDate?: Date;
    hoursRemaining?: number;
    eventType?: string;
    // ... other custom fields
  };
  createdAt: Date;
  read: boolean;
}
```

### Borrow-Specific Event Types

**1. Borrow Success**

```javascript
{
  type: 'success',
  metadata: {
    eventType: 'borrow_success',
    resourceId: '...',
    resourceTitle: 'Introduction to React',
    expiryDate: '2026-02-08T00:00:00.000Z'
  }
}
```

**2. Expiry Reminder**

```javascript
{
  type: 'warning',
  metadata: {
    eventType: 'borrow_expiry_reminder',
    resourceId: '...',
    resourceTitle: 'Introduction to React',
    expiryDate: '2026-02-08T00:00:00.000Z',
    hoursRemaining: 12
  }
}
```

**3. Auto-Return**

```javascript
{
  type: 'info',
  metadata: {
    eventType: 'auto_return',
    resourceId: '...',
    resourceTitle: 'Introduction to React'
  }
}
```

## REST API Endpoints

### Get Notifications

```
GET /api/notifications
Query params: ?unread=true&type=warning&page=1&limit=20
```

### Mark as Read

```
PATCH /api/notifications/:id/read
```

### Mark All as Read

```
PATCH /api/notifications/read-all
```

### Archive Notification

```
PATCH /api/notifications/:id/archive
```

### Get Statistics

```
GET /api/notifications/stats
```

### Get Borrows

```
GET /api/borrows
Query params: ?status=active&page=1&limit=10
```

### Create Borrow

```
POST /api/borrows
Body: {
  resourceId: string,
  resourceType: 'course' | 'book' | 'material' | 'equipment',
  resourceTitle: string,
  borrowDurationDays: number (default: 14)
}
```

### Return Borrow

```
PATCH /api/borrows/:id/return
```

### Renew Borrow

```
PATCH /api/borrows/:id/renew
Body: { extensionDays: number (default: 7) }
```
