import { io } from 'socket.io-client';
import { BASE_URL } from './api.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(BASE_URL, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      // The server rejects sockets without a valid token. Read at connect time so a fresh login works.
      auth: (cb) => cb({ token: localStorage.getItem('rescom_token') })
    });
  }
  return socket;
}