import { io } from 'socket.io-client';
import { BASE_URL } from './api.js';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(BASE_URL, { autoConnect: false, transports: ['websocket', 'polling'] });
  }
  return socket;
}
