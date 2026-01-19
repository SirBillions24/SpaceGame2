import { useEffect, useCallback } from 'react';
import { useSocket } from '../lib/SocketContext';

/**
 * Hook for subscribing to WebSocket events with automatic cleanup.
 * @param event - The event name to listen for
 * @param handler - Callback function to handle the event data
 */
export function useSocketEvent<T>(event: string, handler: (data: T) => void) {
    const { socket } = useSocket();
    const stableHandler = useCallback(handler, [handler]);

    useEffect(() => {
        if (!socket) return;
        socket.on(event, stableHandler);
        return () => {
            socket.off(event, stableHandler);
        };
    }, [socket, event, stableHandler]);
}
