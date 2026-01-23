import { useEffect, useRef } from 'react';
import { useSocket } from '../lib/SocketContext';

/**
 * Hook for subscribing to WebSocket events with automatic cleanup.
 * Uses a ref to store the handler to avoid re-subscribing on every render
 * while still calling the latest handler version.
 * 
 * @param event - The event name to listen for
 * @param handler - Callback function to handle the event data
 */
export function useSocketEvent<T>(event: string, handler: (data: T) => void) {
    const { socket } = useSocket();
    const handlerRef = useRef(handler);
    
    // Always keep ref updated with latest handler
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    useEffect(() => {
        if (!socket) return;
        
        // Wrapper that always calls the latest handler
        const eventHandler = (data: T) => {
            handlerRef.current(data);
        };
        
        socket.on(event, eventHandler);
        return () => {
            socket.off(event, eventHandler);
        };
    }, [socket, event]);
}
