import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';

interface SocketContextType {
    socket: Socket | null;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextType>({ socket: null, isConnected: false });

/**
 * Derive WebSocket URL from API URL.
 * VITE_API_URL may include /api suffix which needs to be stripped for socket.io
 */
function getWebSocketUrl(): string {
    // Prefer explicit WS URL if set
    if (import.meta.env.VITE_WS_URL) {
        return import.meta.env.VITE_WS_URL;
    }
    
    // Fall back to API URL, stripping /api suffix if present
    const apiUrl = import.meta.env.VITE_API_URL || '';
    if (apiUrl) {
        // Remove /api or /api/ suffix to get base URL for socket.io
        return apiUrl.replace(/\/api\/?$/, '');
    }
    
    // Local development: empty string means same origin
    return '';
}

export function SocketProvider({ children }: { children: ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('authToken');
        if (!token) return;

        const wsUrl = getWebSocketUrl();

        const newSocket = io(wsUrl, {
            auth: { token },
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        newSocket.on('connect', () => {
            console.log('🔌 WebSocket connected');
            setIsConnected(true);
        });

        newSocket.on('disconnect', (reason) => {
            console.log('🔌 WebSocket disconnected:', reason);
            setIsConnected(false);
        });

        newSocket.on('connect_error', (err) => {
            console.error('🔌 WebSocket error:', err.message);
            if (err.message === 'Invalid token') {
                localStorage.removeItem('authToken');
                window.location.href = '/';
            }
        });

        setSocket(newSocket);
        return () => {
            newSocket.close();
        };
    }, []);

    return (
        <SocketContext.Provider value={{ socket, isConnected }}>
            {children}
        </SocketContext.Provider>
    );
}

export const useSocket = () => useContext(SocketContext);
