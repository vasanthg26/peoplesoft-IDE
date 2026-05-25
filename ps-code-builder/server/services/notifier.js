/**
 * server/services/notifier.js
 * Manages WebSocket broadcasts for real-time agent trace updates.
 */

import { WebSocketServer } from 'ws';

class Notifier {
  constructor() {
    this.wss = null;
  }

  /**
   * Initialize the WebSocket server
   * @param {import('http').Server} server 
   */
  init(server) {
    this.wss = new WebSocketServer({ server });
    console.log('[notifier] WebSocket server initialized');

    this.wss.on('connection', (ws) => {
      console.log('[notifier] Client connected');
      ws.send(JSON.stringify({ type: 'STATUS', message: 'Connected to Sparky Intelligence Trace' }));
      
      ws.on('close', () => console.log('[notifier] Client disconnected'));
    });
  }

  /**
   * Broadcast a message to all connected clients
   * @param {string} type - Message type (e.g., 'TRACE', 'STATUS')
   * @param {string} message - The content string
   */
  send(type, message) {
    if (!this.wss) return;

    const payload = JSON.stringify({
      type,
      message,
      timestamp: new Date().toISOString()
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) { // 1 = OPEN
        client.send(payload);
      }
    });
  }

  /** Specific helper for trace messages */
  trace(message) {
    console.log(`[trace] ${message}`);
    this.send('TRACE', message);
  }
}

// Singleton instance
const notifier = new Notifier();
export default notifier;
