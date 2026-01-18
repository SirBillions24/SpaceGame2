import { useState, useEffect, useRef } from 'react';
import { api, getCurrentUser } from '../lib/api';
import './CoalitionPanel.css';

interface CoalitionPanelProps {
    onClose: () => void;
}

interface Member {
    id: string;
    username: string;
    level: number;
    xp: number;
    coalitionRole: 'LEADER' | 'OFFICER' | 'MEMBER';
}

interface Coalition {
    id: string;
    name: string;
    tag: string;
    description: string | null;
    founderId: string;
    isLocked: boolean;
    members: Member[];
    _count?: { members: number };
}

interface RankingCoalition {
    id: string;
    name: string;
    tag: string;
    founderId: string;
    memberCount: number;
    totalXp: number;
}

interface ChatMessage {
    id: string;
    userId: string;
    content: string;
    createdAt: string;
    user: {
        username: string;
    };
}

export default function CoalitionPanel({ onClose }: CoalitionPanelProps) {
    const [coalition, setCoalition] = useState<Coalition | null>(null);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'info' | 'chat' | 'search' | 'rankings' | 'settings'>('info');
    const [searchResults, setSearchResults] = useState<Coalition[]>([]);
    const [rankings, setRankings] = useState<RankingCoalition[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [inviteUsername, setInviteUsername] = useState('');
    const [foundingName, setFoundingName] = useState('');
    const [foundingTag, setFoundingTag] = useState('');
    const [foundingDesc, setFoundingDesc] = useState('');
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    // Settings state
    const [settingsLocked, setSettingsLocked] = useState(false);
    const [settingsDesc, setSettingsDesc] = useState('');

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const chatEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const dmChatEndRef = useRef<HTMLDivElement>(null);
    const dmContainerRef = useRef<HTMLDivElement>(null);
    const pollInterval = useRef<NodeJS.Timeout | null>(null);
    const [chatCursor, setChatCursor] = useState<string | undefined>(undefined);
    const [hasMoreChat, setHasMoreChat] = useState(false);
    const [loadingMoreChat, setLoadingMoreChat] = useState(false);

    // DM state
    const [selectedDmPartner, setSelectedDmPartner] = useState<Member | null>(null);
    const [dmMessages, setDmMessages] = useState<any[]>([]);
    const [newDmMessage, setNewDmMessage] = useState('');
    const [sendingDm, setSendingDm] = useState(false);
    const [dmUnreadCounts, setDmUnreadCounts] = useState<Map<string, number>>(new Map());
    const [dmCursor, setDmCursor] = useState<string | undefined>(undefined);
    const [hasMoreDm, setHasMoreDm] = useState(false);
    const [loadingMoreDm, setLoadingMoreDm] = useState(false);

    // Server-synced constants
    const [maxMembers, setMaxMembers] = useState<number>(15); // Default fallback

    const currentUser = getCurrentUser();
    const myMember = coalition?.members.find(m => m.id === currentUser?.userId);
    const myRole = myMember?.coalitionRole;
    const isLeadership = myRole === 'LEADER' || myRole === 'OFFICER';

    useEffect(() => {
        loadMyCoalition();
        loadRankings();
        loadConstants();
        return () => {
            if (pollInterval.current) clearInterval(pollInterval.current);
        };
    }, []);

    const loadConstants = async () => {
        try {
            const data = await api.getCoalitionConstants();
            setMaxMembers(data.maxMembers);
        } catch (e) {
            // Fallback to default if fetch fails
        }
    };

    useEffect(() => {
        if (tab === 'chat' && coalition) {
            loadChat();
            loadDmConversations();
            if (pollInterval.current) clearInterval(pollInterval.current);
            pollInterval.current = setInterval(() => {
                loadChat();
                loadDmConversations();
                if (selectedDmPartner) loadDmMessages(selectedDmPartner.id);
            }, 5000);
        } else {
            if (pollInterval.current) {
                clearInterval(pollInterval.current);
                pollInterval.current = null;
            }
        }
        if (tab === 'rankings') loadRankings();
        if (tab === 'settings' && coalition) {
            setSettingsLocked(coalition.isLocked);
            setSettingsDesc(coalition.description || '');
        }
    }, [tab, coalition?.id]);

    // Helper: check if user is scrolled near bottom
    const isNearBottom = (container: HTMLDivElement | null) => {
        if (!container) return true;
        const threshold = 100; // px from bottom
        return container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    };

    // Only auto-scroll if user was already at bottom
    const shouldAutoScrollChat = useRef(true);
    const shouldAutoScrollDm = useRef(true);

    useEffect(() => {
        if (shouldAutoScrollChat.current) {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    useEffect(() => {
        if (shouldAutoScrollDm.current) {
            dmChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [dmMessages]);

    const loadMyCoalition = async () => {
        try {
            setLoading(true);
            const data = await api.getMyCoalition();
            setCoalition(data.coalition);
            if (!data.coalition && tab === 'info') setTab('rankings');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const loadRankings = async () => {
        try {
            const data = await api.getCoalitionRankings();
            setRankings(data.rankings);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleSearch = async () => {
        try {
            const data = await api.searchCoalitions(searchQuery);
            setSearchResults(data.coalitions);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleCreate = async () => {
        if (!foundingName || !foundingTag) {
            setError('Name and Tag are required');
            return;
        }
        try {
            setCreating(true);
            setError(null);
            await api.createCoalition(foundingName, foundingTag, foundingDesc);
            await loadMyCoalition();
            setTab('info');
        } catch (e: any) {
            setError(e.message);
        } finally {
            setCreating(false);
        }
    };

    const handleJoin = async (id: string) => {
        try {
            setError(null);
            await api.joinCoalition(id);
            await loadMyCoalition();
            setTab('info');
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleLeave = async () => {
        if (!window.confirm('Are you sure you want to leave this coalition?')) return;
        try {
            await api.leaveCoalition();
            setCoalition(null);
            setTab('rankings');
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleInvite = async () => {
        if (!inviteUsername.trim()) return;
        try {
            setError(null);
            setSuccess(null);
            await api.inviteToCoalition(inviteUsername.trim());
            setSuccess(`Invitation sent to ${inviteUsername}`);
            setInviteUsername('');
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handlePromote = async (userId: string) => {
        try {
            await api.promoteCoalitionMember(userId);
            await loadMyCoalition();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleDemote = async (userId: string) => {
        try {
            await api.demoteCoalitionMember(userId);
            await loadMyCoalition();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleKick = async (userId: string) => {
        if (!window.confirm('Are you sure you want to kick this member?')) return;
        try {
            await api.kickCoalitionMember(userId);
            await loadMyCoalition();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleUpdateSettings = async () => {
        try {
            setError(null);
            setSuccess(null);
            await api.updateCoalitionSettings({ isLocked: settingsLocked, description: settingsDesc });
            setSuccess('Settings updated successfully');
            await loadMyCoalition();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const loadChat = async (loadMore = false) => {
        try {
            const cursor = loadMore ? chatCursor : undefined;
            const data = await api.getCoalitionChat(cursor);
            const newMessages = [...data.messages].reverse(); // oldest first

            if (loadMore) {
                // Disable auto-scroll when loading more
                shouldAutoScrollChat.current = false;

                // Prepend older messages, with deduplication
                setMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
                    return uniqueNew.concat(prev);
                });
            } else {
                // Polling update: merge new messages at the end, keep old ones
                shouldAutoScrollChat.current = isNearBottom(chatContainerRef.current);
                setMessages(prev => {
                    if (prev.length === 0) return newMessages;

                    // Find the newest message ID in our current list
                    const lastExistingId = prev[prev.length - 1]?.id;

                    // Find messages in newMessages that are newer than our last one
                    const lastExistingIndex = newMessages.findIndex(m => m.id === lastExistingId);

                    if (lastExistingIndex === -1) {
                        // If we can't find overlap, keep old messages and add all new ones
                        // But be careful not to duplicate - use a Set
                        const existingIds = new Set(prev.map(m => m.id));
                        const trulyNew = newMessages.filter(m => !existingIds.has(m.id));
                        return trulyNew.length > 0 ? prev.concat(trulyNew) : prev;
                    }

                    // Append only messages newer than what we have
                    const newerMessages = newMessages.slice(lastExistingIndex + 1);
                    return newerMessages.length > 0 ? prev.concat(newerMessages) : prev;
                });
            }

            // Set cursor and hasMore: on loadMore, or if this is the initial load (cursor undefined)
            // During polling, keep existing cursor and hasMore unchanged
            if (loadMore || chatCursor === undefined) {
                setChatCursor(data.nextCursor);
                setHasMoreChat(data.hasMore);
            }
        } catch (e) {
            console.error('Failed to load chat');
        }
    };

    const loadMoreChat = async () => {
        if (loadingMoreChat || !hasMoreChat) return;

        // Save scroll position before loading
        const container = chatContainerRef.current;
        const scrollHeightBefore = container?.scrollHeight || 0;

        setLoadingMoreChat(true);
        await loadChat(true);
        setLoadingMoreChat(false);

        // Restore scroll position after prepending
        requestAnimationFrame(() => {
            if (container) {
                const scrollHeightAfter = container.scrollHeight;
                container.scrollTop = scrollHeightAfter - scrollHeightBefore;
            }
        });
    };

    const loadDmMessages = async (partnerId: string, loadMore = false) => {
        try {
            const cursor = loadMore ? dmCursor : undefined;
            const data = await api.getDirectMessages(partnerId, cursor);
            const newMessages = [...data.messages].reverse(); // oldest first

            if (loadMore) {
                // Disable auto-scroll when loading more
                shouldAutoScrollDm.current = false;

                // Prepend older messages, with deduplication
                setDmMessages(prev => {
                    const existingIds = new Set(prev.map(m => m.id));
                    const uniqueNew = newMessages.filter(m => !existingIds.has(m.id));
                    return uniqueNew.concat(prev);
                });
            } else {
                // Polling update: merge new messages at the end, keep old ones
                shouldAutoScrollDm.current = isNearBottom(dmContainerRef.current);
                setDmMessages(prev => {
                    if (prev.length === 0) return newMessages;

                    // Find the newest message ID in our current list
                    const lastExistingId = prev[prev.length - 1]?.id;

                    // Find messages in newMessages that are newer than our last one
                    const lastExistingIndex = newMessages.findIndex(m => m.id === lastExistingId);

                    if (lastExistingIndex === -1) {
                        // If we can't find overlap, keep old messages and add all new ones
                        const existingIds = new Set(prev.map(m => m.id));
                        const trulyNew = newMessages.filter(m => !existingIds.has(m.id));
                        return trulyNew.length > 0 ? prev.concat(trulyNew) : prev;
                    }

                    // Append only messages newer than what we have
                    const newerMessages = newMessages.slice(lastExistingIndex + 1);
                    return newerMessages.length > 0 ? prev.concat(newerMessages) : prev;
                });

                // Mark as read only on initial load
                await api.markDmConversationRead(partnerId);
                setDmUnreadCounts(prev => {
                    const next = new Map(prev);
                    next.set(partnerId, 0);
                    return next;
                });
            }

            // Set cursor and hasMore: on loadMore, or if this is the initial load (cursor undefined)
            // During polling, keep existing cursor and hasMore unchanged
            if (loadMore || dmCursor === undefined) {
                setDmCursor(data.nextCursor);
                setHasMoreDm(data.hasMore);
            }
        } catch (e) {
            console.error('Failed to load DMs');
        }
    };

    const loadMoreDm = async () => {
        if (loadingMoreDm || !hasMoreDm || !selectedDmPartner) return;

        // Save scroll position before loading
        const container = dmContainerRef.current;
        const scrollHeightBefore = container?.scrollHeight || 0;

        setLoadingMoreDm(true);
        await loadDmMessages(selectedDmPartner.id, true);
        setLoadingMoreDm(false);

        // Restore scroll position after prepending
        requestAnimationFrame(() => {
            if (container) {
                const scrollHeightAfter = container.scrollHeight;
                container.scrollTop = scrollHeightAfter - scrollHeightBefore;
            }
        });
    };

    const loadDmConversations = async () => {
        try {
            const data = await api.getDmConversations();
            const counts = new Map<string, number>();
            data.conversations.forEach((c: any) => counts.set(c.partnerId, c.unreadCount));
            setDmUnreadCounts(counts);
        } catch (e) {
            console.error('Failed to load DM conversations');
        }
    };

    const handleSelectDmPartner = (member: Member) => {
        if (member.id === currentUser?.userId) return;
        setSelectedDmPartner(member);
        loadDmMessages(member.id);
    };

    const handleSendDm = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newDmMessage.trim() || sendingDm || !selectedDmPartner) return;
        try {
            setSendingDm(true);
            await api.sendDirectMessage(selectedDmPartner.id, newDmMessage.trim());
            setNewDmMessage('');
            await loadDmMessages(selectedDmPartner.id);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSendingDm(false);
        }
    };

    useEffect(() => {
        if (selectedDmPartner) {
            dmChatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [dmMessages]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || sending) return;
        try {
            setSending(true);
            await api.sendCoalitionMessage(newMessage.trim());
            setNewMessage('');
            await loadChat();
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSending(false);
        }
    };

    if (loading) return (
        <div className="coalition-panel">
            <div className="panel-header">
                <h3>COALITION COMMAND</h3>
                <button onClick={onClose} className="close-btn">×</button>
            </div>
            <div className="panel-content loading">Synchronizing secure frequencies...</div>
        </div>
    );

    return (
        <div className="coalition-panel">
            <div className="panel-header">
                <h3>COALITION COMMAND {coalition && <span className="tag-bracket">[{coalition.tag}]</span>}</h3>
                <div className="panel-tabs">
                    {coalition ? (
                        <>
                            <button className={tab === 'info' ? 'active' : ''} onClick={() => setTab('info')}>Information</button>
                            <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>Secure Comms</button>
                            <button className={tab === 'rankings' ? 'active' : ''} onClick={() => setTab('rankings')}>Rankings</button>
                            {isLeadership && <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Settings</button>}
                        </>
                    ) : (
                        <>
                            <button className={tab === 'rankings' ? 'active' : ''} onClick={() => setTab('rankings')}>Global Rankings</button>
                            <button className={tab === 'search' ? 'active' : ''} onClick={() => setTab('search')}>Join/Found</button>
                        </>
                    )}
                </div>
                <button onClick={onClose} className="close-btn">×</button>
            </div>

            <div className="panel-content">
                {error && <div className="error-banner">{error}<button onClick={() => setError(null)}>×</button></div>}
                {success && <div className="success-banner">{success}<button onClick={() => setSuccess(null)}>×</button></div>}

                {tab === 'rankings' ? (
                    <div className="coalition-rankings">
                        <h4>Global Coalition Standings</h4>
                        <div className="rankings-table-container">
                            <table className="rankings-table">
                                <thead>
                                    <tr>
                                        <th>Rank</th>
                                        <th>Coalition</th>
                                        <th>Members</th>
                                        <th>Total XP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rankings.map((r, idx) => (
                                        <tr key={r.id} className={coalition?.id === r.id ? 'current' : ''}>
                                            <td className="r-rank">#{idx + 1}</td>
                                            <td className="r-name">
                                                <span className="s-tag">[{r.tag}]</span> {r.name}
                                            </td>
                                            <td className="r-members">{r.memberCount}/{maxMembers}</td>
                                            <td className="r-xp">{r.totalXp.toLocaleString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : coalition ? (
                    tab === 'info' ? (
                        <div className="coalition-info">
                            <div className="info-header">
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h2>{coalition.name} {coalition.isLocked && <span style={{ fontSize: '0.8rem', color: '#ffcc00' }}>🔒 Private</span>}</h2>
                                        <p className="desc">{coalition.description || "No coalition directive set."}</p>
                                    </div>
                                    {isLeadership && (
                                        <div className="invite-section">
                                            <input
                                                type="text"
                                                placeholder="Username to invite..."
                                                value={inviteUsername}
                                                onChange={e => setInviteUsername(e.target.value)}
                                            />
                                            <button onClick={handleInvite}>Invite</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="member-list">
                                <h4>Personnel ({coalition.members.length}/{maxMembers})</h4>
                                <div className="member-grid">
                                    {coalition.members.sort((a, b) => {
                                        const order = { LEADER: 0, OFFICER: 1, MEMBER: 2 };
                                        return order[a.coalitionRole] - order[b.coalitionRole];
                                    }).map(m => (
                                        <div key={m.id} className={`member-card ${m.coalitionRole.toLowerCase()}`}>
                                            <div className="m-rank">
                                                {m.coalitionRole === 'LEADER' ? '⭐ Leader' : m.coalitionRole === 'OFFICER' ? '🎖️ Officer' : 'Member'}
                                            </div>
                                            <div className="m-name">{m.username}</div>
                                            <div className="m-level">Level {m.level} ({m.xp.toLocaleString()} XP)</div>

                                            {/* Admin Actions */}
                                            {isLeadership && m.id !== currentUser?.userId && (
                                                <div className="member-actions">
                                                    {myRole === 'LEADER' && m.coalitionRole === 'MEMBER' && (
                                                        <button className="act-btn promote" onClick={() => handlePromote(m.id)}>Promote</button>
                                                    )}
                                                    {myRole === 'LEADER' && m.coalitionRole === 'OFFICER' && (
                                                        <button className="act-btn demote" onClick={() => handleDemote(m.id)}>Demote</button>
                                                    )}
                                                    {(myRole === 'LEADER' || (myRole === 'OFFICER' && m.coalitionRole === 'MEMBER')) && (
                                                        <button className="act-btn kick" onClick={() => handleKick(m.id)}>Kick</button>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="info-footer">
                                <button className="leave-btn" onClick={handleLeave}>Leave Coalition</button>
                            </div>
                        </div>
                    ) : tab === 'chat' ? (
                        <div className="coalition-chat comms-layout">
                            {/* Left: Member List */}
                            <div className="members-column">
                                <h4>PERSONNEL</h4>
                                <div className="member-dm-list">
                                    {coalition.members.filter(m => m.id !== currentUser?.userId).map(member => {
                                        const unread = dmUnreadCounts.get(member.id) || 0;
                                        return (
                                            <div
                                                key={member.id}
                                                className={`dm-member-item ${selectedDmPartner?.id === member.id ? 'selected' : ''}`}
                                                onClick={() => handleSelectDmPartner(member)}
                                            >
                                                <span className="dm-role-icon">
                                                    {member.coalitionRole === 'LEADER' ? '👑' : member.coalitionRole === 'OFFICER' ? '⚔️' : '•'}
                                                </span>
                                                <span className="dm-member-name">{member.username}</span>
                                                {unread > 0 && <span className="dm-unread-badge">{unread}</span>}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Center: Coalition Chat */}
                            <div className="coalition-chat-column">
                                <h4>COALITION BROADCAST</h4>
                                <div className="chat-messages" ref={chatContainerRef}>
                                    {hasMoreChat ? (
                                        <button className="load-more-btn" onClick={loadMoreChat} disabled={loadingMoreChat}>
                                            {loadingMoreChat ? 'Loading...' : '↑ Load older messages'}
                                        </button>
                                    ) : messages.length > 0 && (
                                        <div className="end-of-history">— End of message history —</div>
                                    )}
                                    {messages.map(msg => (
                                        <div key={msg.id} className={`chat-bubble ${msg.userId === currentUser?.userId ? 'own' : ''}`}>
                                            <div className="chat-meta">
                                                <span className="c-user">{msg.user.username}</span>
                                                <span className="c-time">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <div className="chat-text">{msg.content}</div>
                                        </div>
                                    ))}
                                    <div ref={chatEndRef} />
                                </div>
                                <form className="chat-input" onSubmit={handleSendMessage}>
                                    <input
                                        type="text"
                                        placeholder="Transmit to coalition..."
                                        value={newMessage}
                                        onChange={e => setNewMessage(e.target.value)}
                                        maxLength={500}
                                    />
                                    <button type="submit" disabled={sending}>{sending ? '...' : 'Send'}</button>
                                </form>
                            </div>

                            {/* Right: DM Chat */}
                            <div className="dm-column">
                                <h4>{selectedDmPartner ? `DM: ${selectedDmPartner.username}` : 'DIRECT MESSAGES'}</h4>
                                {selectedDmPartner ? (
                                    <>
                                        <div className="dm-messages" ref={dmContainerRef}>
                                            {hasMoreDm ? (
                                                <button className="load-more-btn" onClick={loadMoreDm} disabled={loadingMoreDm}>
                                                    {loadingMoreDm ? 'Loading...' : '↑ Load older messages'}
                                                </button>
                                            ) : dmMessages.length > 0 && (
                                                <div className="end-of-history">— End of message history —</div>
                                            )}
                                            {dmMessages.length === 0 ? (
                                                <div className="dm-empty">No messages yet. Start the conversation!</div>
                                            ) : (
                                                dmMessages.map(msg => (
                                                    <div key={msg.id} className={`chat-bubble ${msg.senderId === currentUser?.userId ? 'own' : ''}`}>
                                                        <div className="chat-meta">
                                                            <span className="c-user">{msg.sender.username}</span>
                                                            <span className="c-time">{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        </div>
                                                        <div className="chat-text">{msg.content}</div>
                                                    </div>
                                                ))
                                            )}
                                            <div ref={dmChatEndRef} />
                                        </div>
                                        <form className="chat-input" onSubmit={handleSendDm}>
                                            <input
                                                type="text"
                                                placeholder="Private message..."
                                                value={newDmMessage}
                                                onChange={e => setNewDmMessage(e.target.value)}
                                                maxLength={500}
                                            />
                                            <button type="submit" disabled={sendingDm}>{sendingDm ? '...' : 'Send'}</button>
                                        </form>
                                    </>
                                ) : (
                                    <div className="dm-placeholder">
                                        <p>Select a member to start a private conversation.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                    ) : (
                        <div className="coalition-settings">
                            <h4>Coalition Administration</h4>
                            <div className="settings-form">
                                <div className="settings-group">
                                    <label>Privacy Status</label>
                                    <div className="toggle-group">
                                        <button
                                            className={!settingsLocked ? 'active' : ''}
                                            onClick={() => setSettingsLocked(false)}
                                        >🔓 Public (Joinable)</button>
                                        <button
                                            className={settingsLocked ? 'active' : ''}
                                            onClick={() => setSettingsLocked(true)}
                                        >🔒 Private (Invite Only)</button>
                                    </div>
                                </div>
                                <div className="settings-group">
                                    <label>Coalition Directive</label>
                                    <textarea
                                        value={settingsDesc}
                                        onChange={e => setSettingsDesc(e.target.value)}
                                        maxLength={200}
                                        placeholder="Enter coalition description..."
                                    />
                                </div>
                                <button className="save-settings-btn" onClick={handleUpdateSettings}>Apply Changes</button>
                            </div>
                        </div>
                    )
                ) : (
                    <div className="coalition-recruitment">
                        <div className="recruit-search">
                            <h4>Join Existing Coalition</h4>
                            <div className="search-bar">
                                <input
                                    type="text"
                                    placeholder="Search by name or tag..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                                />
                                <button onClick={handleSearch}>Search</button>
                            </div>
                            <div className="search-results">
                                {searchResults.length === 0 ? (
                                    <div className="empty-results">No coalitions found matching your search.</div>
                                ) : (
                                    searchResults.map(c => (
                                        <div key={c.id} className="search-card">
                                            <div className="s-info">
                                                <span className="s-tag">[{c.tag}]</span>
                                                <span className="s-name">{c.name}</span>
                                                <span className="s-members">{c._count?.members || 0}/{maxMembers} members</span>
                                                {c.isLocked && <span className="s-locked">🔒 Invite Only</span>}
                                            </div>
                                            {!c.isLocked && <button onClick={() => handleJoin(c.id)}>Join</button>}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div className="recruit-create">
                            <h4>Found New Coalition</h4>
                            <p className="cost-notice">Founding Cost: 50,000 Credits</p>
                            <div className="create-form">
                                <input
                                    type="text"
                                    placeholder="Coalition Name"
                                    value={foundingName}
                                    onChange={e => setFoundingName(e.target.value)}
                                    maxLength={30}
                                />
                                <input
                                    type="text"
                                    placeholder="Tag (3-5 chars)"
                                    value={foundingTag}
                                    onChange={e => setFoundingTag(e.target.value.toUpperCase())}
                                    maxLength={5}
                                />
                                <textarea
                                    placeholder="Coalition Directive (Description)"
                                    value={foundingDesc}
                                    onChange={e => setFoundingDesc(e.target.value)}
                                    maxLength={200}
                                />
                                <button onClick={handleCreate} disabled={creating}>
                                    {creating ? 'Establishing Connection...' : 'Found Coalition'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

