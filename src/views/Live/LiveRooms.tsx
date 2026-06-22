import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, Profile } from '../../store/authStore';
import { useLiveStore, Livestream } from '../../store/liveStore';
import { supabase } from '../../services/supabase';
import { UserProfileModal } from '../../components/UserProfileModal';
import { 
  Video, VideoOff, Mic, MicOff, Monitor, PhoneOff,
  MessageSquare, Send, Volume2, PhoneCall, Phone, Heart, FileText,
  Radio, Tv, X, Crown, BadgeCheck, UserCircle2, Camera,
  CameraOff, MonitorStop, Users, RefreshCw, Wifi, WifiOff, Maximize2, SwitchCamera
} from 'lucide-react';
import confetti from 'canvas-confetti';

const STUN_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

const DEFAULT_NOTES = '📝 Notes de réunion...\n\n• Point 1 :\n• Point 2 :\n• Action items :';

const RoleBadge: React.FC<{ role: string; small?: boolean }> = ({ role, small }) => {
  const base = small ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2.5 py-1';
  if (role === 'admin') return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-purple-500/15 border border-purple-500/25 text-purple-500 font-bold ${base}`}>
      <Crown className="w-2.5 h-2.5" /> Admin
    </span>
  );
  if (role === 'creator') return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-blue-500/15 border border-blue-500/25 text-blue-500 font-bold ${base}`}>
      <BadgeCheck className="w-2.5 h-2.5" /> Créateur
    </span>
  );
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full bg-gray-500/10 border border-gray-500/20 text-gray-500 font-bold ${base}`}>
      <UserCircle2 className="w-2.5 h-2.5" /> Membre
    </span>
  );
};

export const LiveRooms: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, profilesList, fetchProfilesList } = useAuthStore();
  const { 
    activeStreams, currentStream, donations, loading, totalEarnings,
    fetchActiveStreams, createStream, endStream, submitDonation, subscribeToDonations 
  } = useLiveStore();

  const [activeSubTab, setActiveSubTab] = useState<'calls' | 'streams'>('calls');
  const [selectedProfile, setSelectedProfile] = useState<Profile | null>(null);

  // ─── CALL STATE ───────────────────────────────────────────────────────────
  const [callJoined, setCallJoined] = useState(false);
  const [myMic, setMyMic] = useState(true);
  const [myCam, setMyCam] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [callActiveTab, setCallActiveTab] = useState<'chat' | 'notes'>('chat');
  const [notesContent, setNotesContent] = useState(DEFAULT_NOTES);
  const [callChatMessages, setCallChatMessages] = useState<{ id: string; sender: string; text: string; isSelf?: boolean }[]>([]);
  const [callChatInput, setCallChatInput] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [selectedCallUser, setSelectedCallUser] = useState<Profile | null>(null);
  const [isDialing, setIsDialing] = useState(false);
  const [lobbyCamera, setLobbyCamera] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [canScreenShare, setCanScreenShare] = useState(false);
  const [audioLevel, setAudioLevel] = useState(20);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [expandedVideo, setExpandedVideo] = useState<'remote' | 'local' | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Call WebRTC refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const activeCallRef = useRef<any>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const expandedVideoRef = useRef<HTMLVideoElement | null>(null);
  const lobbyVideoRef = useRef<HTMLVideoElement | null>(null);
  const lobbyStreamRef = useRef<MediaStream | null>(null);
  const callChatChannelRef = useRef<any>(null);
  const notesSyncRef = useRef<string>(DEFAULT_NOTES);
  const notesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── LIVESTREAM STATE ─────────────────────────────────────────────────────
  const [streamTitle, setStreamTitle] = useState('');
  const [streamDesc, setStreamDesc] = useState('');
  const [viewingStream, setViewingStream] = useState<Livestream | null>(null);
  const [liveChatInput, setLiveChatInput] = useState('');
  const [liveChatMessages, setLiveChatMessages] = useState<{ id: string; sender: string; avatar: string | null; text: string; amount?: number }[]>([]);
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [donationAmount, setDonationAmount] = useState<number>(10);
  const [donationMessage, setDonationMessage] = useState('');
  const [isSubmittingDonation, setIsSubmittingDonation] = useState(false);
  const [activeAlert, setActiveAlert] = useState<{ donor: string; amount: number; message: string | null } | null>(null);

  // Live camera/screen state
  const [liveCameraActive, setLiveCameraActive] = useState(false);
  const [liveScreenShare, setLiveScreenShare] = useState(false);
  const [liveViewerCount, setLiveViewerCount] = useState(0);

  // ── CRITICAL FIX: video refs are ALWAYS mounted (never conditionally rendered)
  // We control visibility via CSS opacity so refs are always valid
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveScreenStreamRef = useRef<MediaStream | null>(null);

  // Creator WebRTC: one RTCPeerConnection per viewer
  const creatorPCsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const creatorSignalChannelRef = useRef<any>(null);

  // Viewer WebRTC: connect to creator's stream
  const viewerPCRef = useRef<RTCPeerConnection | null>(null);
  const viewerVideoRef = useRef<HTMLVideoElement | null>(null);
  const viewerSignalChannelRef = useRef<any>(null);
  const [viewerStreamActive, setViewerStreamActive] = useState(false);

  // ─── LIFECYCLE ────────────────────────────────────────────────────────────
  useEffect(() => {
    setCanScreenShare(typeof navigator.mediaDevices?.getDisplayMedia === 'function');
    fetchProfilesList();
    fetchActiveStreams();
  }, [fetchProfilesList, fetchActiveStreams]);

  // Auto-dial when routed with state from other views
  useEffect(() => {
    const state = location.state as { dialUser?: Profile } | null;
    if (state?.dialUser) {
      const targetUser = state.dialUser;
      // Clear navigation state to prevent dialing again on refresh
      navigate(location.pathname, { replace: true, state: {} });
      // Switch tab to calls
      setActiveSubTab('calls');
      // Dial the user
      handleDialUser(targetUser);
    }
  }, [location.state, navigate]);

  // Call timer
  useEffect(() => {
    if (callJoined) {
      callTimerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (callTimerRef.current) clearInterval(callTimerRef.current);
      setCallDuration(0);
    }
    return () => { if (callTimerRef.current) clearInterval(callTimerRef.current); };
  }, [callJoined]);

  useEffect(() => {
    if (callJoined) {
      const t = setInterval(() => setAudioLevel(Math.floor(Math.random() * 80) + 10), 150);
      return () => clearInterval(t);
    }
  }, [callJoined]);

  useEffect(() => { localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = myMic; }); }, [myMic]);
  useEffect(() => { localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = myCam; }); }, [myCam]);

  useEffect(() => {
    if (isDialing) {
      ringIntervalRef.current = setInterval(playRingSound, 3000);
    } else {
      if (ringIntervalRef.current) clearInterval(ringIntervalRef.current);
    }
    return () => { if (ringIntervalRef.current) clearInterval(ringIntervalRef.current); };
  }, [isDialing]);

  // Supabase call signaling
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`calls-recv-${profile.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'calls' },
        async (payload) => {
          const call = payload.new;
          if (call.caller_id === profile.id || call.receiver_id === profile.id) {
            if (call.status === 'rejected' || call.status === 'ended') {
              hangUpLocally();
            } else if (call.status === 'active' && call.caller_id === profile.id) {
              const answer = call.signal_data?.answer;
              if (answer && peerConnectionRef.current) {
                try {
                  await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
                  setCallJoined(true);
                  setIsDialing(false);
                } catch (e) { console.error(e); }
              }
            }
            // Shared notes sync: apply remote edits for the active call only,
            // skipping our own echo (tracked via notesSyncRef).
            if (call.id === activeCallRef.current?.id && typeof call.notes === 'string' && call.notes !== notesSyncRef.current) {
              notesSyncRef.current = call.notes;
              setNotesContent(call.notes);
            }
          }
        })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      hangUpLocally();
      stopLiveCamera();
      stopLobbyCamera();
      disconnectViewerStream();
    };
  }, [profile]); // eslint-disable-line

  // Donations
  useEffect(() => {
    const stream = currentStream || viewingStream;
    if (!stream) return;
    useLiveStore.getState().fetchDonations(stream.id);
    const unsub = subscribeToDonations(stream.id, (d) => {
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, colors: ['#007AFF', '#5856D6', '#FF9500', '#FF2D55'] });
      const name = d.donor?.full_name || `@${d.donor?.username}` || 'Un membre';
      setActiveAlert({ donor: name, amount: Number(d.amount), message: d.message });
      setLiveChatMessages(prev => [...prev, { id: `don-${d.id}`, sender: 'Système', avatar: null, text: `🎉 ${name} a fait un don de ${d.amount.toFixed(2)} € !`, amount: d.amount }]);
    });
    return () => unsub();
  }, [currentStream, viewingStream, subscribeToDonations]);

  useEffect(() => {
    if (activeAlert) {
      const t = setTimeout(() => setActiveAlert(null), 5000);
      return () => clearTimeout(t);
    }
  }, [activeAlert]);

  // ─── AUDIO RING ───────────────────────────────────────────────────────────
  const playRingSound = () => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const o1 = ctx.createOscillator(); const o2 = ctx.createOscillator(); const g = ctx.createGain();
      o1.type = 'sine'; o1.frequency.value = 440; o2.type = 'sine'; o2.frequency.value = 480;
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
      g.gain.setValueAtTime(0.2, ctx.currentTime + 1.2);
      g.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
      o1.connect(g); o2.connect(g); g.connect(ctx.destination);
      o1.start(); o2.start();
      setTimeout(() => { o1.stop(); o2.stop(); ctx.close(); }, 1600);
    } catch (_) { /* blocked */ }
  };

  // ─── LOBBY CAMERA ─────────────────────────────────────────────────────────
  const startLobbyCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
      lobbyStreamRef.current = stream;
      if (lobbyVideoRef.current) lobbyVideoRef.current.srcObject = stream;
      setLobbyCamera(true);
    } catch (e) { console.warn(e); alert('Accès caméra refusé. Vérifiez les permissions du navigateur.'); }
  };

  const stopLobbyCamera = () => {
    lobbyStreamRef.current?.getTracks().forEach(t => t.stop());
    lobbyStreamRef.current = null;
    if (lobbyVideoRef.current) lobbyVideoRef.current.srcObject = null;
    setLobbyCamera(false);
  };

  // ─── LIVE CAMERA (creator) ────────────────────────────────────────────────
  // ✅ KEY FIX: <video ref={liveVideoRef}> is ALWAYS in the DOM.
  // So liveVideoRef.current is ALWAYS non-null → srcObject assignment works immediately.

  const startLiveCamera = async () => {
    try {
      // Stop screen share if active
      if (liveScreenStreamRef.current) {
        liveScreenStreamRef.current.getTracks().forEach(t => t.stop());
        liveScreenStreamRef.current = null;
        setLiveScreenShare(false);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      liveStreamRef.current = stream;

      // ✅ Direct assignment – works because video element is ALWAYS mounted
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
      }

      setLiveCameraActive(true);

      // Push updated tracks to any connected viewers
      pushTracksToViewers(stream);

    } catch (err: any) {
      console.error('Camera error:', err);
      const msg = err.name === 'NotAllowedError'
        ? 'Permission caméra refusée.\nCliquez sur l\'icône 🔒 dans la barre d\'adresse et autorisez la caméra.'
        : err.name === 'NotFoundError'
        ? 'Aucune caméra détectée sur cet appareil.'
        : `Erreur caméra : ${err.message}`;
      alert(msg);
    }
  };

  const startLiveScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 30 } },
        audio: true
      });

      liveScreenStreamRef.current = stream;

      // ✅ Direct assignment – always works
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
      }

      setLiveScreenShare(true);

      // Push screen tracks to viewers
      pushTracksToViewers(stream);

      // When user clicks "Stop sharing" in browser UI
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopLiveScreenShare();
      });
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') {
        console.error('Screen share error:', err);
      }
    }
  };

  const stopLiveScreenShare = () => {
    liveScreenStreamRef.current?.getTracks().forEach(t => t.stop());
    liveScreenStreamRef.current = null;
    setLiveScreenShare(false);
    // Revert to camera if active
    if (liveStreamRef.current && liveVideoRef.current) {
      liveVideoRef.current.srcObject = liveStreamRef.current;
      pushTracksToViewers(liveStreamRef.current);
    }
  };

  const stopLiveCamera = () => {
    liveStreamRef.current?.getTracks().forEach(t => t.stop());
    liveStreamRef.current = null;
    liveScreenStreamRef.current?.getTracks().forEach(t => t.stop());
    liveScreenStreamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    setLiveCameraActive(false);
    setLiveScreenShare(false);
  };

  // ─── CREATOR → VIEWER SIGNALING (WebRTC P2P) ─────────────────────────────
  // When creator goes live, they listen for viewer join requests on a broadcast channel.
  // Each viewer gets their own RTCPeerConnection.

  const setupCreatorSignaling = useCallback((streamId: string) => {
    if (creatorSignalChannelRef.current) {
      supabase.removeChannel(creatorSignalChannelRef.current);
    }

    const channel = supabase.channel(`live-signal-${streamId}`, {
      config: { broadcast: { self: false } }
    });

    channel
      .on('broadcast', { event: 'viewer-join' }, async ({ payload }: any) => {
        const { viewerId, offer } = payload;
        console.log('[Creator] Viewer joined:', viewerId);

        // Close existing PC for this viewer if any
        creatorPCsRef.current.get(viewerId)?.close();

        const pc = new RTCPeerConnection(STUN_SERVERS);
        creatorPCsRef.current.set(viewerId, pc);

        // Add current media tracks to this viewer's connection
        const activeStream = liveScreenStreamRef.current || liveStreamRef.current;
        if (activeStream) {
          activeStream.getTracks().forEach(t => pc.addTrack(t, activeStream));
        }

        // Trickle ICE: send candidates as they arrive
        pc.onicecandidate = ({ candidate }) => {
          if (candidate) {
            channel.send({
              type: 'broadcast',
              event: 'ice-candidate',
              payload: { viewerId, candidate, from: 'creator' }
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'connected') {
            console.log('[Creator] Viewer connected:', viewerId);
          } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            creatorPCsRef.current.delete(viewerId);
            setLiveViewerCount(c => Math.max(0, c - 1));
          }
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          // Send answer immediately — trickle ICE handles candidates separately
          channel.send({
            type: 'broadcast',
            event: 'creator-answer',
            payload: { viewerId, answer: pc.localDescription }
          });

          setLiveViewerCount(c => c + 1);
        } catch (e) {
          console.error('[Creator] Signaling error:', e);
          pc.close();
          creatorPCsRef.current.delete(viewerId);
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, ({ payload }: any) => {
        if (payload.from !== 'viewer') return;
        const targetPc = creatorPCsRef.current.get(payload.viewerId);
        if (targetPc && targetPc.remoteDescription) {
          targetPc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error);
        }
      })
      .subscribe((status: string) => {
        console.log('[Creator] Signal channel status:', status);
      });

    creatorSignalChannelRef.current = channel;
  }, []); // eslint-disable-line

  const teardownCreatorSignaling = () => {
    if (creatorSignalChannelRef.current) {
      supabase.removeChannel(creatorSignalChannelRef.current);
      creatorSignalChannelRef.current = null;
    }
    creatorPCsRef.current.forEach(pc => pc.close());
    creatorPCsRef.current.clear();
    setLiveViewerCount(0);
  };

  const pushTracksToViewers = (newStream: MediaStream) => {
    creatorPCsRef.current.forEach((pc, viewerId) => {
      if (pc.connectionState === 'closed') {
        creatorPCsRef.current.delete(viewerId);
        return;
      }
      const senders = pc.getSenders();
      newStream.getTracks().forEach(newTrack => {
        const sender = senders.find(s => s.track?.kind === newTrack.kind);
        if (sender) sender.replaceTrack(newTrack).catch(console.error);
        else pc.addTrack(newTrack, newStream);
      });
    });
  };

  // ─── VIEWER → CREATOR CONNECTION (WebRTC P2P) ────────────────────────────
  // When a viewer clicks "Rejoindre", they connect to the creator's stream.

  const connectAsViewer = useCallback(async (streamId: string) => {
    disconnectViewerStream();

    const pc = new RTCPeerConnection(STUN_SERVERS);
    viewerPCRef.current = pc;

    // When we receive tracks from the creator, show them
    pc.ontrack = (event) => {
      if (event.streams[0] && viewerVideoRef.current) {
        viewerVideoRef.current.srcObject = event.streams[0];
        setViewerStreamActive(true);
        console.log('[Viewer] Received stream from creator');
      }
    };

    // Create an offer to receive video/audio
    const offer = await pc.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: true,
    });
    await pc.setLocalDescription(offer);

    const channel = supabase.channel(`live-signal-${streamId}`, {
      config: { broadcast: { self: false } }
    });

    // Trickle ICE: send candidates as they arrive (set up before subscribing)
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        channel.send({
          type: 'broadcast',
          event: 'ice-candidate',
          payload: { viewerId: profile?.id, candidate, from: 'viewer' }
        });
      }
    };

    channel
      .on('broadcast', { event: 'creator-answer' }, async ({ payload }: any) => {
        if (payload.viewerId !== profile?.id) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload.answer));
          console.log('[Viewer] Remote description set successfully');
        } catch (e) {
          console.error('[Viewer] Error setting remote desc:', e);
        }
      })
      .on('broadcast', { event: 'ice-candidate' }, ({ payload }: any) => {
        if (payload.from !== 'creator') return;
        if (pc.remoteDescription) {
          pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error);
        }
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') {
          // Send join request with our offer (no ICE wait needed — trickle handles it)
          channel.send({
            type: 'broadcast',
            event: 'viewer-join',
            payload: { viewerId: profile?.id, offer: pc.localDescription }
          });
          console.log('[Viewer] Join request sent');
        }
      });

    viewerSignalChannelRef.current = channel;
  }, [profile]);

  const disconnectViewerStream = () => {
    if (viewerSignalChannelRef.current) {
      supabase.removeChannel(viewerSignalChannelRef.current);
      viewerSignalChannelRef.current = null;
    }
    viewerPCRef.current?.close();
    viewerPCRef.current = null;
    if (viewerVideoRef.current) viewerVideoRef.current.srcObject = null;
    setViewerStreamActive(false);
  };

  // ─── CALL WebRTC ──────────────────────────────────────────────────────────
  const hangUpLocally = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    screenStreamRef.current?.getTracks().forEach(t => t.stop());
    screenStreamRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    remoteStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setCallJoined(false);
    setIsDialing(false);
    setSelectedCallUser(null);
    setIsScreenSharing(false);
    setAudioBlocked(false);
    setShowSidePanel(false);
    setCallChatMessages([]);
    setCallChatInput('');
    if (notesDebounceRef.current) { clearTimeout(notesDebounceRef.current); notesDebounceRef.current = null; }
    notesSyncRef.current = DEFAULT_NOTES;
    setNotesContent(DEFAULT_NOTES);
    activeCallRef.current = null;
  }, []);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    remoteStreamRef.current = stream;
    const el = remoteVideoRef.current;
    if (!el) return; // will be (re)attached by the callJoined effect once mounted
    if (el.srcObject !== stream) el.srcObject = stream;
    el.muted = false;
    el.volume = 1;
    const p = el.play();
    if (p && typeof p.then === 'function') {
      p.then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
    }
  }, []);

  const makePC = (): RTCPeerConnection => {
    const pc = new RTCPeerConnection(STUN_SERVERS);
    // Collect every inbound track into a single MediaStream so audio + video
    // always play together, even if they arrive in separate ontrack events.
    const inbound = new MediaStream();
    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? inbound;
      if (!e.streams[0]) inbound.addTrack(e.track);
      attachRemoteStream(stream);
    };
    return pc;
  };

  // Manually resume audio playback if the browser blocked autoplay.
  const handleUnlockAudio = () => {
    const el = remoteVideoRef.current;
    if (!el) return;
    el.muted = false;
    el.volume = 1;
    el.play().then(() => setAudioBlocked(false)).catch(() => {});
  };

  // When the in-call view mounts (callJoined), (re)attach local + remote media.
  // The <video> elements only exist while callJoined is true, so streams set
  // during dialing/answering must be reattached here, otherwise the camera
  // preview stays black and no audio is heard.
  useEffect(() => {
    if (!callJoined) return;
    if (localVideoRef.current && localStreamRef.current && localVideoRef.current.srcObject !== localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.play().catch(() => {});
    }
    if (remoteStreamRef.current) {
      attachRemoteStream(remoteStreamRef.current);
    }
  }, [callJoined, attachRemoteStream]);

  // Mirror the selected tile's stream into the expanded (spotlight) video.
  // The original tile stays mounted, so we mute the expanded copy to avoid
  // double audio; the remote tile keeps playing the sound.
  useEffect(() => {
    if (!expandedVideo) return;
    const src = expandedVideo === 'remote' ? remoteVideoRef.current : localVideoRef.current;
    const dest = expandedVideoRef.current;
    if (src?.srcObject && dest) {
      dest.srcObject = src.srcObject;
      dest.muted = true;
      dest.play().catch(() => {});
    }
  }, [expandedVideo, isScreenSharing, myCam, callJoined]);

  // Close the spotlight automatically if the call ends.
  useEffect(() => {
    if (!callJoined) setExpandedVideo(null);
  }, [callJoined]);

  // ─── IN-CALL CHAT (DB-backed, realtime postgres_changes per call) ─────────
  // Messages live in public.call_messages. Both participants load the history
  // and subscribe to INSERTs filtered by call_id, so the same proven realtime
  // path as the call signaling delivers chat reliably between them.
  useEffect(() => {
    if (!callJoined) return;
    const callId = activeCallRef.current?.id;
    if (!callId) return;

    let cancelled = false;

    const appendRow = (row: any) => {
      setCallChatMessages(prev => {
        if (prev.some(m => m.id === row.id)) return prev;
        return [...prev, {
          id: row.id,
          sender: row.sender_name || 'Membre',
          text: row.content,
          isSelf: row.sender_id === profile?.id,
        }];
      });
    };

    const loadHistory = async () => {
      const { data } = await supabase
        .from('call_messages')
        .select('*')
        .eq('call_id', callId)
        .order('created_at', { ascending: true });
      if (cancelled || !data) return;
      setCallChatMessages(data.map((row: any) => ({
        id: row.id,
        sender: row.sender_name || 'Membre',
        text: row.content,
        isSelf: row.sender_id === profile?.id,
      })));
    };
    loadHistory();

    const channel = supabase
      .channel(`call-chat-${callId}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'call_messages', filter: `call_id=eq.${callId}` },
        (payload) => appendRow(payload.new))
      .subscribe();

    callChatChannelRef.current = channel;

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
      callChatChannelRef.current = null;
    };
  }, [callJoined, profile]);

  const handleDialUser = async (user: Profile) => {
    if (!profile) return;
    try {
      setSelectedCallUser(user);
      setIsDialing(true);
      stopLobbyCamera();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      const pc = makePC();
      peerConnectionRef.current = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      let sent = false;
      const send = async () => {
        if (sent) return; sent = true;
        const { data, error } = await supabase.from('calls').insert({
          caller_id: profile.id, receiver_id: user.id, status: 'dialing',
          signal_data: { offer: pc.localDescription }
        }).select().single();
        if (error) { console.error(error); hangUpLocally(); }
        else activeCallRef.current = data;
      };
      pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') send(); };
      setTimeout(send, 2000);
    } catch (err: any) {
      hangUpLocally();
      alert(err.name === 'NotAllowedError' ? 'Permission caméra/micro refusée.' : `Erreur : ${err.message}`);
    }
  };

  // Note: handleAcceptCall and handleDeclineCall are now managed globally by the Layout component

  const handleHangUp = async () => {
    if (activeCallRef.current) await supabase.from('calls').update({ status: 'ended' }).eq('id', activeCallRef.current.id);
    hangUpLocally();
  };

  const handleScreenShareToggle = async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      if (peerConnectionRef.current && localStreamRef.current) {
        const camTrack = localStreamRef.current.getVideoTracks()[0];
        const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender && camTrack) await sender.replaceTrack(camTrack);
        if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      }
      setIsScreenSharing(false);
    } else {
      try {
        const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
        screenStreamRef.current = screen;
        const screenTrack = screen.getVideoTracks()[0];
        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(screenTrack);
        }
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = new MediaStream([screenTrack, ...localStreamRef.current.getAudioTracks()]);
        }
        screenTrack.addEventListener('ended', () => handleScreenShareToggle());
        setIsScreenSharing(true);
      } catch (e) { /* cancelled */ }
    }
  };

  const handleFlipCamera = async () => {
    if (!localStreamRef.current || !peerConnectionRef.current) return;
    const newFacing = facingMode === 'user' ? 'environment' : 'user';
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { exact: newFacing } },
        audio: false,
      });
      const newVideoTrack = newStream.getVideoTracks()[0];
      const sender = peerConnectionRef.current.getSenders().find(s => s.track?.kind === 'video');
      if (sender) await sender.replaceTrack(newVideoTrack);
      localStreamRef.current.getVideoTracks().forEach(t => t.stop());
      localStreamRef.current.removeTrack(localStreamRef.current.getVideoTracks()[0]);
      localStreamRef.current.addTrack(newVideoTrack);
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current;
      setFacingMode(newFacing);
    } catch {
      // Some devices don't have two cameras or don't support exact facing mode
    }
  };

  // ─── LIVESTREAM HANDLERS ──────────────────────────────────────────────────
  const handleLaunchStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!streamTitle.trim()) return;
    const stream = await createStream(streamTitle, streamDesc);
    if (stream) {
      setStreamTitle(''); setStreamDesc('');
      setLiveChatMessages([{ id: 'sys-1', sender: 'Système', avatar: null, text: '🔴 Le livestream a commencé !' }]);
      // Auto-start live camera so tracks are immediately available for P2P viewers
      await startLiveCamera();
    }
  };

  const handleStopStream = async () => {
    stopLiveCamera();
    if (currentStream) await endStream(currentStream.id);
  };

  const handleViewStream = async (stream: Livestream) => {
    setViewingStream(stream);
    setViewerStreamActive(false);
    // Try to connect to real WebRTC stream
    await connectAsViewer(stream.id);
  };

  const handleLeaveStream = () => {
    disconnectViewerStream();
    setViewingStream(null);
  };

  const handleSendLiveChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!liveChatInput.trim()) return;
    setLiveChatMessages(prev => [...prev, { id: `chat-${Date.now()}`, sender: profile?.full_name || `@${profile?.username}` || 'Moi', avatar: profile?.avatar_url || null, text: liveChatInput.trim() }]);
    setLiveChatInput('');
  };

  const handleSendCallMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = callChatInput.trim();
    const callId = activeCallRef.current?.id;
    if (!text || !callId || !profile) return;
    const sender = profile.full_name || (profile.username ? `@${profile.username}` : 'Moi');
    setCallChatInput('');
    // The realtime INSERT subscription renders the message for both sides
    // (including the sender), so we don't append optimistically here.
    const { error } = await supabase.from('call_messages').insert({
      call_id: callId, sender_id: profile.id, sender_name: sender, content: text,
    });
    if (error) { console.error('Failed to send call message:', error); setCallChatInput(text); }
  };

  const handleNotesChange = (content: string) => {
    setNotesContent(content);
    notesSyncRef.current = content;
    const callId = activeCallRef.current?.id;
    if (!callId) return;
    if (notesDebounceRef.current) clearTimeout(notesDebounceRef.current);
    notesDebounceRef.current = setTimeout(() => {
      supabase.from('calls').update({ notes: content }).eq('id', callId)
        .then(({ error }) => { if (error) console.error('Failed to sync notes:', error); });
    }, 500);
  };

  const handleDonationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const stream = currentStream || viewingStream;
    if (!stream) return;
    setIsSubmittingDonation(true);
    const donation = await submitDonation(stream.id, donationAmount, donationMessage);
    setIsSubmittingDonation(false);
    if (donation) { setShowDonationModal(false); setDonationMessage(''); }
    else alert('Erreur lors du don.');
  };

  const formatDuration = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  // Creator signaling channel reactive lifecycle
  useEffect(() => {
    if (currentStream) {
      setupCreatorSignaling(currentStream.id);
    }
    return () => {
      teardownCreatorSignaling();
    };
  }, [currentStream, setupCreatorSignaling]);

  // Auto-accept call when routed from global Layout notification
  useEffect(() => {
    const state = location.state as { acceptCall?: boolean; activeCall?: any; callerProfile?: Profile } | null;
    if (state?.acceptCall && state.activeCall && state.callerProfile) {
      const callRow = state.activeCall;
      const caller = state.callerProfile;
      // Clear navigation state
      navigate(location.pathname, { replace: true, state: {} });
      // Set subtab to calls
      setActiveSubTab('calls');
      
      const join = async () => {
        setSelectedCallUser(caller);
        activeCallRef.current = callRow;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
          localStreamRef.current = stream;
          if (localVideoRef.current) localVideoRef.current.srcObject = stream;
          const pc = makePC();
          peerConnectionRef.current = pc;
          stream.getTracks().forEach(t => pc.addTrack(t, stream));
          await pc.setRemoteDescription(new RTCSessionDescription(callRow.signal_data?.offer));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          let sent = false;
          const send = async () => {
            if (sent) return; sent = true;
            const { error } = await supabase.from('calls').update({
              status: 'active', signal_data: { offer: callRow.signal_data?.offer, answer: pc.localDescription }
            }).eq('id', callRow.id);
            if (error) { hangUpLocally(); } else setCallJoined(true);
          };
          pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') send(); };
          setTimeout(send, 2000);
        } catch (err: any) {
          hangUpLocally();
          alert(err.name === 'NotAllowedError' ? 'Permission caméra/micro refusée.' : `Erreur : ${err.message}`);
        }
      };
      
      join();
    }
  }, [location.state, navigate]); // eslint-disable-line

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-2 relative min-h-[700px]">

      {/* Profile Modal */}
      {selectedProfile && (
        <UserProfileModal user={selectedProfile} currentUserId={profile?.id} onClose={() => setSelectedProfile(null)}
          onCallWebRTC={(u) => { setSelectedProfile(null); handleDialUser(u); }} />
      )}

      {/* Expanded video spotlight — full window, works on desktop & mobile.
          object-contain so a shared screen is shown in its entirety. */}
      {callJoined && expandedVideo && (
        <div className="fixed inset-0 z-[60] bg-black/95 backdrop-blur-sm flex items-center justify-center"
          onClick={() => setExpandedVideo(null)}>
          <video ref={expandedVideoRef} autoPlay playsInline muted
            className="max-w-full max-h-full w-full h-full object-contain" />
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
            <span className="bg-black/60 text-white text-xs px-3 py-1.5 rounded-full font-bold backdrop-blur flex items-center gap-2">
              {expandedVideo === 'remote'
                ? <><Video className="w-3.5 h-3.5" /> {selectedCallUser?.full_name || selectedCallUser?.username}</>
                : <>{isScreenSharing ? <Monitor className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />} Moi {isScreenSharing && '(Écran)'}</>}
            </span>
          </div>
          <button onClick={(e) => { e.stopPropagation(); setExpandedVideo(null); }}
            title="Réduire" className="absolute top-4 right-4 z-10 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 transition backdrop-blur">
            <X className="w-6 h-6" />
          </button>
          <span className="absolute bottom-5 left-1/2 -translate-x-1/2 z-10 text-white/40 text-[11px] font-medium pointer-events-none">
            Touchez ou cliquez pour réduire
          </span>
        </div>
      )}

      {/* Donation Alert */}
      {activeAlert && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 pointer-events-none">
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white p-5 rounded-3xl shadow-2xl border border-white/10 flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center text-2xl shrink-0">💝</div>
            <div>
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-white/60">Nouveau Don !</p>
              <p className="font-extrabold text-base">{activeAlert.donor} · {activeAlert.amount.toFixed(2)} €</p>
              {activeAlert.message && <p className="text-xs italic text-white/70 mt-0.5">"{activeAlert.message}"</p>}
            </div>
          </div>
        </div>
      )}

      {/* Note: Incoming Call Widget is now managed globally by the Layout component */}

      {/* ── Tabs Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-black/5 dark:border-white/5 pb-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">Espace Live Skuuul</h1>
          <p className="text-xs font-medium text-ios-label-secondaryLight dark:text-ios-label-secondaryDark mt-1">
            Appels vidéo WebRTC · Livestreams P2P · Dons en direct
          </p>
        </div>
        <div className="flex bg-black/5 dark:bg-white/5 p-1 rounded-2xl border border-black/5 dark:border-white/5 gap-1">
          <button onClick={() => setActiveSubTab('calls')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${activeSubTab === 'calls' ? 'bg-white dark:bg-neutral-800 text-blue-500 shadow-sm' : 'text-ios-label-secondaryLight hover:text-ios-label-primaryLight'}`}>
            <PhoneCall className="w-3.5 h-3.5" /> Call Rooms
          </button>
          <button onClick={() => { setActiveSubTab('streams'); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${activeSubTab === 'streams' ? 'bg-white dark:bg-neutral-800 text-red-500 shadow-sm' : 'text-ios-label-secondaryLight hover:text-ios-label-primaryLight'}`}>
            <Tv className="w-3.5 h-3.5" /> Livestream & Dons
          </button>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          SUBTAB 1: CALL ROOMS
      ════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'calls' && (
        <div className="min-h-[520px] md:h-[calc(100vh-14rem)]">

          {/* Lobby */}
          {!callJoined && !isDialing && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:h-full">
              <div className="md:col-span-1 flex flex-col gap-4">
                <div className="glass-panel p-5 rounded-2xl border border-black/5 dark:border-white/5 shadow-ios-soft space-y-4 flex-1">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[10px] font-extrabold uppercase tracking-wider">
                    🛡️ Skuuul Calling
                  </span>
                  <h3 className="text-base font-extrabold">Salons d'appels vidéo</h3>
                  <ul className="text-xs font-semibold space-y-1.5 text-ios-label-secondaryLight dark:text-ios-label-secondaryDark">
                    <li className="flex items-center gap-2"><Video className="w-3.5 h-3.5 text-blue-400 shrink-0" /> Vidéo HD WebRTC</li>
                    <li className="flex items-center gap-2"><Monitor className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> Partage d'écran réel</li>
                    <li className="flex items-center gap-2"><MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" /> Chat & Notes</li>
                    <li className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-orange-400 shrink-0" /> Appel téléphonique</li>
                  </ul>
                </div>

                {/* Lobby camera preview — video ALWAYS in DOM */}
                <div className="glass-panel p-4 rounded-2xl border border-black/5 dark:border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight">Aperçu Caméra</span>
                    <button onClick={lobbyCamera ? stopLobbyCamera : startLobbyCamera}
                      className={`text-xs font-bold px-3 py-1 rounded-lg transition flex items-center gap-1.5 ${lobbyCamera ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20' : 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20'}`}>
                      {lobbyCamera ? <><CameraOff className="w-3 h-3" /> Arrêter</> : <><Camera className="w-3 h-3" /> Tester</>}
                    </button>
                  </div>
                  <div className="aspect-video rounded-xl bg-neutral-900 overflow-hidden relative flex items-center justify-center">
                    {/* Always mounted */}
                    <video ref={lobbyVideoRef} autoPlay playsInline muted
                      className={`absolute inset-0 w-full h-full object-cover transition-opacity ${lobbyCamera ? 'opacity-100' : 'opacity-0'}`}
                      style={{ transform: 'scaleX(-1)' }} />
                    {!lobbyCamera && (
                      <div className="flex flex-col items-center gap-2 text-neutral-600 relative z-10">
                        <CameraOff className="w-8 h-8" />
                        <span className="text-xs font-semibold">Désactivé</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Member list */}
              <div className="md:col-span-2 glass-panel p-4 sm:p-5 rounded-2xl border border-black/5 dark:border-white/5 flex flex-col overflow-hidden shadow-ios-soft min-h-[360px] md:min-h-0 max-h-[65vh] md:max-h-none">
                <div className="flex items-center justify-between mb-4 shrink-0">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" /> Membres Disponibles
                  </h3>
                  <button onClick={fetchProfilesList} className="p-1.5 text-ios-label-secondaryLight hover:text-ios-label-primaryLight transition rounded-lg hover:bg-black/5">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
                  {profilesList.filter(u => u.id !== profile?.id && !u.is_banned).map(u => (
                    <div key={u.id} className="flex items-center justify-between p-3.5 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 dark:border-white/5 hover:bg-black/8 transition">
                      <button onClick={() => setSelectedProfile(u)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.username} className="w-11 h-11 rounded-xl object-cover border border-black/10 shrink-0" />
                        ) : (
                          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center text-blue-500 font-bold text-base shrink-0">
                            {u.username[0].toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold truncate">{u.full_name || u.username}</span>
                            {u.is_premium && <span className="text-amber-400 text-xs">⭐</span>}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                            <RoleBadge role={u.role} small />
                            <span className="text-[10px] text-ios-label-secondaryLight font-semibold">Nv.{u.level}</span>
                            {u.phone && <span className="text-[10px] text-emerald-500 font-semibold flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />Tel</span>}
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 ml-3">
                        <button onClick={(e) => { e.stopPropagation(); handleDialUser(u); }}
                          className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20 transition"
                          title={`Appeler ${u.full_name || u.username} sur Skuuul`}>
                          <Phone className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDialUser(u)}
                          className="p-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 text-white hover:opacity-90 transition shadow-sm"
                          title={`Appel Vidéo ${u.full_name || u.username}`}>
                          <PhoneCall className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {profilesList.filter(u => u.id !== profile?.id && !u.is_banned).length === 0 && (
                    <div className="text-center py-16 text-ios-label-secondaryLight text-sm flex flex-col items-center gap-3">
                      <Users className="w-10 h-10 opacity-30" />Aucun autre membre.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Dialing */}
          {isDialing && selectedCallUser && (
            <div className="min-h-[520px] md:h-full rounded-2xl border border-white/5 flex flex-col items-center justify-center gap-8 p-6" style={{ background: 'linear-gradient(145deg, #0f1117, #111827)' }}>
              <div className="relative">
                <div className="absolute inset-[-12px] bg-blue-500/20 rounded-full animate-ping" />
                <div className="absolute inset-[-24px] bg-blue-500/10 rounded-full animate-pulse" />
                {selectedCallUser.avatar_url ? (
                  <img src={selectedCallUser.avatar_url} alt={selectedCallUser.username} className="w-28 h-28 rounded-2xl object-cover border-4 border-blue-400 relative z-10" />
                ) : (
                  <div className="w-28 h-28 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-4xl border-4 border-blue-400 relative z-10">
                    {selectedCallUser.username[0].toUpperCase()}
                  </div>
                )}
              </div>
              <div className="text-center">
                <h2 className="text-white text-2xl font-extrabold">{selectedCallUser.full_name || selectedCallUser.username}</h2>
                <p className="text-blue-400 text-sm font-semibold flex items-center justify-center gap-2 mt-1.5 animate-pulse">
                  <Volume2 className="w-4 h-4" /> Appel en cours...
                </p>
              </div>
              <button onClick={handleHangUp} className="p-5 rounded-full bg-red-500 text-white shadow-2xl hover:bg-red-600 transition">
                <PhoneOff className="w-7 h-7" />
              </button>
            </div>
          )}

          {/* Connected call */}
          {callJoined && selectedCallUser && (
            <div className="min-h-[520px] md:h-full flex flex-col md:flex-row gap-4">
              <div className="flex-1 flex flex-col gap-3 min-w-0">
                <div className="glass-panel px-4 py-2.5 rounded-xl border border-black/5 dark:border-white/5 flex justify-between items-center text-xs font-semibold">
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" /><span className="truncate">Appel Sécurisé WebRTC</span></div>
                  <div className="flex items-center gap-3 text-ios-label-secondaryLight shrink-0">
                    {isScreenSharing && <span className="text-blue-500 font-bold hidden sm:flex items-center gap-1"><Monitor className="w-3 h-3" /> Partage actif</span>}
                    <span className="font-mono text-emerald-500 font-bold">{formatDuration(callDuration)}</span>
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-neutral-950 p-3 rounded-2xl min-h-[280px]">
                  <div onClick={() => setExpandedVideo('remote')}
                    className="group relative rounded-xl overflow-hidden bg-neutral-900 border border-white/5 min-h-[160px] cursor-pointer">
                    {/* Remote video + audio — NOT muted so the other person is heard */}
                    <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute rounded-full border-4 border-emerald-400/30 transition-all duration-150 pointer-events-none left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                      style={{ width: `${100 + audioLevel}px`, height: `${100 + audioLevel}px`, opacity: audioLevel > 30 ? 0.5 : 0 }} />
                    <button onClick={(e) => { e.stopPropagation(); setExpandedVideo('remote'); }}
                      title="Agrandir" className="absolute top-3 right-3 z-20 p-2 rounded-lg bg-black/55 text-white backdrop-blur hover:bg-black/75 transition opacity-100 md:opacity-0 md:group-hover:opacity-100">
                      <Maximize2 className="w-4 h-4" />
                    </button>
                    <div className="absolute bottom-3 left-3 bg-black/60 text-white text-[10px] px-2.5 py-1 rounded-full font-semibold z-20 backdrop-blur flex items-center gap-1.5">
                      {audioLevel > 35 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />}
                      {selectedCallUser.full_name || selectedCallUser.username}
                    </div>
                    {/* Audio autoplay fallback — browsers may block sound until a tap */}
                    {audioBlocked && (
                      <button onClick={(e) => { e.stopPropagation(); handleUnlockAudio(); }}
                        className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-black/70 text-white backdrop-blur-sm">
                        <Volume2 className="w-8 h-8 animate-pulse" />
                        <span className="text-xs font-bold">Toucher pour activer le son</span>
                      </button>
                    )}
                  </div>
                  <div onClick={() => setExpandedVideo('local')}
                    className="group relative rounded-xl overflow-hidden bg-neutral-900 border border-white/5 flex items-center justify-center min-h-[160px] cursor-pointer">
                    <video ref={localVideoRef} autoPlay playsInline muted
                      className={`absolute inset-0 w-full h-full object-cover ${(!myCam && !isScreenSharing) ? 'opacity-0' : 'opacity-100'}`}
                      style={{ transform: (!isScreenSharing && facingMode === 'user') ? 'scaleX(-1)' : 'none' }} />
                    {!myCam && !isScreenSharing && (
                      <div className="flex flex-col items-center gap-3 relative z-10">
                        {profile?.avatar_url ? <img src={profile.avatar_url} alt="Moi" className="w-20 h-20 rounded-full object-cover border-2 border-white/10" />
                          : <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-2xl">{profile?.username?.[0]?.toUpperCase()}</div>}
                        <span className="text-white/50 text-xs font-bold">Caméra désactivée</span>
                      </div>
                    )}
                    {(myCam || isScreenSharing) && (
                      <button onClick={(e) => { e.stopPropagation(); setExpandedVideo('local'); }}
                        title="Agrandir" className="absolute top-3 right-3 z-20 p-2 rounded-lg bg-black/55 text-white backdrop-blur hover:bg-black/75 transition opacity-100 md:opacity-0 md:group-hover:opacity-100">
                        <Maximize2 className="w-4 h-4" />
                      </button>
                    )}
                    <div className="absolute bottom-3 left-3 bg-black/60 text-white text-[10px] px-2.5 py-1 rounded-full font-semibold z-20 backdrop-blur">
                      Moi {!myMic && '(Muet)'}
                    </div>
                  </div>
                </div>
                <div className="glass-panel p-3 sm:p-4 rounded-2xl border border-black/5 dark:border-white/5 flex justify-between items-center gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    {canScreenShare && (
                      <button onClick={handleScreenShareToggle}
                        className={`p-3 rounded-xl transition border text-sm font-bold flex items-center gap-2 ${isScreenSharing ? 'bg-blue-500/15 border-blue-500/25 text-blue-500' : 'bg-black/5 dark:bg-white/5 border-black/5 text-ios-label-secondaryLight hover:bg-black/10'}`}>
                        {isScreenSharing ? <MonitorStop className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                        <span className="hidden sm:inline">{isScreenSharing ? 'Arrêter' : 'Partager'}</span>
                      </button>
                    )}
                    {myCam && !isScreenSharing && (
                      <button onClick={handleFlipCamera} title="Retourner caméra"
                        className="p-3 rounded-xl transition border bg-black/5 dark:bg-white/5 border-black/5 text-ios-label-secondaryLight hover:bg-black/10">
                        <SwitchCamera className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <button onClick={() => setMyMic(!myMic)} title={myMic ? 'Couper le micro' : 'Activer le micro'} className={`p-3 sm:p-3.5 rounded-full transition border ${myMic ? 'bg-black/5 dark:bg-white/5 border-black/5 hover:bg-black/10' : 'bg-red-500 border-red-500 text-white shadow-lg'}`}>
                      {myMic ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                    </button>
                    <button onClick={() => setMyCam(!myCam)} title={myCam ? 'Couper la caméra' : 'Activer la caméra'} className={`p-3 sm:p-3.5 rounded-full transition border ${myCam ? 'bg-black/5 dark:bg-white/5 border-black/5 hover:bg-black/10' : 'bg-red-500 border-red-500 text-white shadow-lg'}`}>
                      {myCam ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                    </button>
                    <button onClick={handleHangUp} title="Raccrocher" className="p-3 sm:p-3.5 rounded-full bg-red-500 text-white shadow-lg hover:bg-red-600 transition">
                      <PhoneOff className="w-5 h-5" />
                    </button>
                  </div>
                  <button onClick={() => setShowSidePanel(s => !s)}
                    className="p-3 rounded-xl bg-black/5 dark:bg-white/5 border border-black/5 text-ios-label-secondaryLight hover:bg-black/10 text-xs font-bold flex items-center gap-1.5 shrink-0 md:hidden">
                    <MessageSquare className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Side panel: Chat / Notes — toggleable on mobile, always shown on desktop */}
              <div className={`${showSidePanel ? 'flex' : 'hidden'} md:flex w-full md:w-72 glass-panel border border-black/5 dark:border-white/5 rounded-2xl overflow-hidden flex-col h-[60vh] md:h-auto`}>
                <div className="border-b border-black/5 dark:border-white/5 bg-black/5 p-2 flex justify-between items-center gap-2">
                  <div className="flex bg-black/5 dark:bg-white/5 rounded-lg p-0.5 gap-0.5">
                    <button onClick={() => setCallActiveTab('chat')}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition ${callActiveTab === 'chat' ? 'bg-white dark:bg-neutral-800 text-blue-500 shadow-sm' : 'text-ios-label-secondaryLight'}`}>
                      <MessageSquare className="w-3.5 h-3.5" /> Chat
                    </button>
                    <button onClick={() => setCallActiveTab('notes')}
                      className={`px-3 py-1.5 rounded-md text-[11px] font-bold flex items-center gap-1.5 transition ${callActiveTab === 'notes' ? 'bg-white dark:bg-neutral-800 text-blue-500 shadow-sm' : 'text-ios-label-secondaryLight'}`}>
                      <FileText className="w-3.5 h-3.5" /> Notes
                    </button>
                  </div>
                  <button onClick={() => setShowSidePanel(false)} className="md:hidden p-1.5 hover:bg-black/5 dark:hover:bg-white/5 rounded-lg text-ios-label-secondaryLight">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1 min-h-0 p-3 overflow-hidden flex flex-col">
                  {callActiveTab === 'chat' ? (
                    <div className="flex flex-col h-full gap-2 min-h-0">
                      <div className="flex-1 min-h-0 space-y-2 overflow-y-auto mb-2">
                        {callChatMessages.map(m => (
                          <div key={m.id} className={`text-xs p-2.5 rounded-xl border ${m.isSelf ? 'bg-blue-500/10 border-blue-500/15 ml-4' : 'bg-black/5 dark:bg-white/5 border-black/5'}`}>
                            <span className="font-bold block mb-0.5">{m.sender}</span>
                            <p className="text-ios-label-secondaryLight leading-relaxed break-words">{m.text}</p>
                          </div>
                        ))}
                        {callChatMessages.length === 0 && <p className="text-center text-xs text-ios-label-secondaryLight py-8">Aucun message...</p>}
                      </div>
                      <form onSubmit={handleSendCallMessage} className="border-t border-black/5 pt-2 flex gap-1.5 shrink-0">
                        <input type="text" placeholder="Message..." value={callChatInput} onChange={e => setCallChatInput(e.target.value)}
                          className="flex-1 min-w-0 bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2 text-xs border focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button type="submit" className="p-2 bg-blue-500 text-white rounded-xl shrink-0"><Send className="w-3.5 h-3.5" /></button>
                      </form>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col min-h-0">
                      <textarea value={notesContent} onChange={e => handleNotesChange(e.target.value)}
                        className="w-full flex-1 min-h-0 bg-transparent p-2 text-xs rounded-xl focus:outline-none font-mono leading-relaxed resize-none" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════
          SUBTAB 2: LIVESTREAM & DONS
      ════════════════════════════════════════════════════════════ */}
      {activeSubTab === 'streams' && (
        <div className="space-y-6">

          {/* CREATOR DASHBOARD */}
          {(profile?.role === 'admin' || profile?.role === 'creator') && !viewingStream && (
            <div className="grid md:grid-cols-3 gap-5 items-start">

              {/* Controls */}
              <div className="md:col-span-1 glass-panel p-5 rounded-2xl border border-black/5 dark:border-white/5 shadow-ios-soft">
                {!currentStream ? (
                  <form onSubmit={handleLaunchStream} className="space-y-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-500 text-[10px] font-extrabold uppercase tracking-wider">
                      🔴 Streamer Dashboard
                    </span>
                    <h3 className="text-base font-extrabold">Lancer un Livestream</h3>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider mb-1">Titre</label>
                      <input type="text" required value={streamTitle} onChange={e => setStreamTitle(e.target.value)}
                        placeholder="ex: Q&A PostgreSQL..." className="w-full glass-input px-3 py-2.5 text-xs rounded-xl font-medium" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider mb-1">Description</label>
                      <textarea value={streamDesc} onChange={e => setStreamDesc(e.target.value)}
                        className="w-full glass-input px-3 py-2.5 text-xs rounded-xl font-medium h-20 resize-none" />
                    </div>
                    <button type="submit" className="w-full bg-gradient-to-r from-red-500 to-pink-500 text-white font-extrabold py-3 rounded-xl shadow-lg active:scale-95 text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                      <Radio className="w-4 h-4 animate-pulse" /> Démarrer
                    </button>
                  </form>
                ) : (
                  <div className="space-y-4">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500 text-white text-[10px] font-extrabold uppercase tracking-widest animate-pulse">
                      🔴 En Direct
                    </span>
                    <div>
                      <p className="text-xs text-ios-label-secondaryLight mb-0.5">Titre</p>
                      <p className="font-extrabold text-sm">{currentStream.title}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 bg-black/5 dark:bg-white/5 p-3 rounded-xl border border-black/5">
                      <div><p className="text-[9px] font-bold text-ios-label-secondaryLight uppercase">Dons</p><p className="text-sm font-extrabold text-emerald-500">{totalEarnings.toFixed(2)}€</p></div>
                      <div><p className="text-[9px] font-bold text-ios-label-secondaryLight uppercase">Viewers</p><p className="text-sm font-extrabold text-blue-500">{liveViewerCount}</p></div>
                      <div><p className="text-[9px] font-bold text-ios-label-secondaryLight uppercase">XP</p><p className="text-sm font-extrabold text-amber-500">{Math.floor(totalEarnings * 5)}</p></div>
                    </div>

                    {/* ✅ Camera / Screen controls */}
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase text-ios-label-secondaryLight tracking-wider">Source Vidéo</p>
                      <button
                        onClick={liveCameraActive ? stopLiveCamera : startLiveCamera}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition border ${liveCameraActive ? 'bg-red-500/15 text-red-500 border-red-500/25 hover:bg-red-500/25' : 'bg-blue-500/15 text-blue-500 border-blue-500/25 hover:bg-blue-500/25'}`}
                      >
                        {liveCameraActive
                          ? <><CameraOff className="w-4 h-4" /> Désactiver la caméra</>
                          : <><Camera className="w-4 h-4" /> 🎥 Activer la caméra</>}
                      </button>
                      <button
                        onClick={liveScreenShare ? stopLiveScreenShare : startLiveScreenShare}
                        className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition border ${liveScreenShare ? 'bg-indigo-500/15 text-indigo-500 border-indigo-500/25 hover:bg-indigo-500/25' : 'bg-black/5 dark:bg-white/5 text-ios-label-secondaryLight border-black/5 hover:bg-black/10'}`}
                      >
                        {liveScreenShare
                          ? <><MonitorStop className="w-4 h-4" /> Arrêter le partage</>
                          : <><Monitor className="w-4 h-4" /> 🖥️ Partager l'écran</>}
                      </button>
                    </div>

                    <button onClick={handleStopStream} className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 text-red-500 font-bold py-2.5 rounded-xl text-xs transition">
                      Terminer le livestream
                    </button>
                  </div>
                )}
              </div>

              {/* ✅ LIVE PREVIEW — video ALWAYS mounted, visibility via CSS */}
              <div className="md:col-span-2 space-y-4">
                {currentStream ? (
                  <div className="grid md:grid-cols-2 gap-4" style={{ minHeight: '420px' }}>

                    {/* Camera/screen preview */}
                    <div className="rounded-2xl overflow-hidden bg-neutral-950 border border-white/5 relative flex flex-col" style={{ minHeight: '240px' }}>
                      {/* 🔑 Video element is ALWAYS here — never conditionally rendered */}
                      <video
                        ref={liveVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${(liveCameraActive || liveScreenShare) ? 'opacity-100' : 'opacity-0'}`}
                      />

                      {/* Overlay badges */}
                      <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
                        <span className="bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-widest flex items-center gap-1 animate-pulse">
                          <span className="w-1.5 h-1.5 bg-white rounded-full" /> Live
                        </span>
                        {liveScreenShare && <span className="bg-indigo-500/90 text-white text-[9px] px-2 py-0.5 rounded-full font-bold">Écran</span>}
                        {liveCameraActive && !liveScreenShare && <span className="bg-blue-500/90 text-white text-[9px] px-2 py-0.5 rounded-full font-bold">Caméra</span>}
                      </div>

                      {/* Viewers indicator */}
                      {liveViewerCount > 0 && (
                        <div className="absolute top-3 right-3 z-10">
                          <span className="bg-black/60 text-white text-[9px] px-2 py-1 rounded-full backdrop-blur font-semibold flex items-center gap-1">
                            <Wifi className="w-3 h-3 text-emerald-400" /> {liveViewerCount} spectateur{liveViewerCount > 1 ? 's' : ''}
                          </span>
                        </div>
                      )}

                      {/* Placeholder when no video active */}
                      {!liveCameraActive && !liveScreenShare && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <div className="text-center space-y-3 p-6">
                            <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-2xl mx-auto">🎥</div>
                            <p className="text-white/40 text-xs font-semibold">Activez votre caméra ou<br />partagez votre écran pour diffuser</p>
                          </div>
                        </div>
                      )}

                      {/* Bottom info bar */}
                      {(liveCameraActive || liveScreenShare) && (
                        <div className="absolute bottom-3 left-3 right-3 z-10 flex justify-between items-center">
                          <span className="bg-black/60 text-white/80 text-[9px] px-2 py-1 rounded-full backdrop-blur font-semibold">
                            {liveScreenShare ? '🖥️ Partage d\'écran' : '📷 Caméra HD 720p'}
                          </span>
                          <span className="bg-emerald-500/20 text-emerald-400 text-[9px] px-2 py-1 rounded-full border border-emerald-500/30 font-bold">
                            LIVE P2P
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Donation log */}
                    <div className="glass-panel p-4 rounded-2xl border border-black/5 dark:border-white/5 flex flex-col overflow-hidden">
                      <h3 className="text-xs font-extrabold uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Heart className="w-4 h-4 text-pink-500 fill-current" /> Journal des Dons
                      </h3>
                      <div className="flex-1 overflow-y-auto space-y-2">
                        {donations.map(d => (
                          <div key={d.id} className="p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-xs">
                            <div className="flex justify-between items-center">
                              <span className="font-bold">{d.donor?.full_name || `@${d.donor?.username}`}</span>
                              <span className="font-extrabold text-emerald-500">+{d.amount.toFixed(2)} €</span>
                            </div>
                            {d.message && <p className="text-ios-label-secondaryLight mt-0.5 italic">"{d.message}"</p>}
                          </div>
                        ))}
                        {donations.length === 0 && <div className="text-center py-10 text-xs text-ios-label-secondaryLight">Aucun don reçu.</div>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="glass-panel p-10 rounded-2xl border border-black/5 dark:border-white/5 text-center space-y-4">
                    <div className="w-14 h-14 bg-red-500/10 text-red-500 rounded-xl flex items-center justify-center text-2xl mx-auto animate-pulse">📻</div>
                    <div>
                      <h3 className="font-extrabold text-base">Vous êtes hors ligne</h3>
                      <p className="text-xs text-ios-label-secondaryLight mt-1 max-w-sm mx-auto">Remplissez le formulaire et lancez la diffusion. Votre caméra/écran sera partagé en P2P avec vos spectateurs.</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* VIEWER — catalog + stream player.
              Visible to EVERYONE (members, creators, admins) so all roles can
              browse and join active livestreams. Creators/admins also keep their
              dashboard above this block when they are not currently watching. */}
          {(
            <div>
              {viewingStream ? (
                <div className="grid md:grid-cols-3 gap-5">
                  <div className="md:col-span-2 flex flex-col gap-4">
                    <div className="glass-panel p-4 rounded-2xl border border-black/5 dark:border-white/5 flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center text-red-500 font-bold">
                          {viewingStream.creator?.username[0].toUpperCase()}
                        </div>
                        <div>
                          <span className="font-extrabold text-sm block">{viewingStream.title}</span>
                          <span className="text-[10px] text-ios-label-secondaryLight">Par {viewingStream.creator?.full_name || viewingStream.creator?.username}</span>
                        </div>
                      </div>
                      <button onClick={handleLeaveStream} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition">
                        <X className="w-4 h-4 text-ios-label-secondaryLight" />
                      </button>
                    </div>

                    {/* Viewer video area — video ALWAYS mounted */}
                    <div className="aspect-video rounded-2xl overflow-hidden bg-neutral-950 border border-black/10 relative flex flex-col">
                      {/* ✅ Real P2P stream video — always in DOM */}
                      <video
                        ref={viewerVideoRef}
                        autoPlay
                        playsInline
                        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${viewerStreamActive ? 'opacity-100' : 'opacity-0'}`}
                      />

                      {/* Status bar top */}
                      <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10">
                        <span className="bg-red-500 text-white text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest flex items-center gap-1.5 animate-pulse">
                          <span className="w-1.5 h-1.5 bg-white rounded-full" /> En Direct
                        </span>
                        <span className={`text-[9px] px-2.5 py-1 rounded-full font-bold flex items-center gap-1.5 ${viewerStreamActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-black/50 text-white/60 backdrop-blur'}`}>
                          {viewerStreamActive ? <><Wifi className="w-3 h-3" /> Stream P2P reçu</> : <><WifiOff className="w-3 h-3" /> Connexion en cours...</>}
                        </span>
                      </div>

                      {/* Placeholder when not yet connected */}
                      {!viewerStreamActive && (
                        <div className="absolute inset-0 flex items-center justify-center z-10">
                          <div className="text-center space-y-3">
                            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                            <p className="text-white/60 text-xs font-semibold">Connexion au créateur...</p>
                            <p className="text-white/30 text-[10px]">Le créateur doit avoir sa caméra active</p>
                          </div>
                        </div>
                      )}

                      {/* Bottom bar */}
                      <div className="absolute bottom-4 left-4 right-4 flex justify-between items-center z-10">
                        <p className="text-white/40 text-[10px] italic max-w-xs">{viewingStream.description || 'Aucune description.'}</p>
                        <button onClick={() => setShowDonationModal(true)}
                          className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-extrabold shadow-lg flex items-center gap-1.5 hover:opacity-90 transition">
                          <Heart className="w-4 h-4 fill-current text-pink-300 animate-pulse" /> Soutenir
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Live chat */}
                  <div className="md:col-span-1 glass-panel border border-black/5 dark:border-white/5 rounded-2xl overflow-hidden flex flex-col">
                    <div className="border-b border-black/5 bg-black/5 p-3 flex justify-between items-center">
                      <span className="text-xs font-bold uppercase tracking-wider text-ios-label-secondaryLight">Chat du live</span>
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                    </div>
                    <div className="flex-1 p-3 overflow-y-auto flex flex-col h-[350px]">
                      <div className="space-y-2 flex-1 overflow-y-auto mb-2">
                        {liveChatMessages.map(m => {
                          const isSys = m.sender === 'Système';
                          return (
                            <div key={m.id} className={`text-xs p-2 rounded-xl border ${isSys ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500 font-bold' : 'bg-black/5 dark:bg-white/5 border-black/5'}`}>
                              {!isSys && <span className="font-bold block mb-0.5">{m.sender}</span>}
                              <p className="text-ios-label-secondaryLight leading-relaxed">{m.text}</p>
                            </div>
                          );
                        })}
                      </div>
                      <form onSubmit={handleSendLiveChatMessage} className="border-t border-black/5 pt-2.5 flex gap-1.5">
                        <input type="text" placeholder="Écrire..." value={liveChatInput} onChange={e => setLiveChatInput(e.target.value)}
                          className="flex-1 bg-black/5 dark:bg-white/5 rounded-xl px-3 py-2 text-xs border focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        <button type="submit" className="p-2 bg-blue-500 text-white rounded-xl"><Send className="w-3.5 h-3.5" /></button>
                      </form>
                    </div>
                  </div>
                </div>
              ) : (
                /* Stream catalog */
                <div className="space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-extrabold uppercase tracking-wider flex items-center gap-2">
                      <Radio className="w-4 h-4 text-red-500" /> Lives en cours
                    </h3>
                    <button onClick={fetchActiveStreams} className="p-1.5 text-ios-label-secondaryLight hover:text-ios-label-primaryLight transition rounded-lg hover:bg-black/5">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {loading ? (
                    <div className="text-center py-12"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>
                  ) : (
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
                      {activeStreams.filter(stream => stream.creator_id !== profile?.id).map(stream => (
                        <div key={stream.id} className="glass-panel rounded-2xl border border-black/5 dark:border-white/5 overflow-hidden shadow-ios-soft">
                          <div className="aspect-video bg-neutral-900 flex items-center justify-center relative border-b border-black/5">
                            <span className="absolute top-3 left-3 bg-red-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                              <span className="w-1.5 h-1.5 bg-white rounded-full" /> En Direct
                            </span>
                            <Tv className="w-10 h-10 text-white/15" />
                          </div>
                          <div className="p-4 space-y-3">
                            <div>
                              <h3 className="font-extrabold text-sm line-clamp-1">{stream.title}</h3>
                              <p className="text-xs text-ios-label-secondaryLight line-clamp-2 mt-0.5">{stream.description || 'Aucune description.'}</p>
                            </div>
                            <div className="flex justify-between items-center border-t border-black/5 pt-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center font-bold text-xs text-blue-500">
                                  {stream.creator?.username[0].toUpperCase()}
                                </div>
                                <span className="text-[10px] font-bold text-ios-label-secondaryLight">{stream.creator?.full_name || stream.creator?.username}</span>
                              </div>
                              <button onClick={() => handleViewStream(stream)}
                                className="bg-blue-500 text-white px-3 py-1.5 rounded-xl text-xs font-bold hover:opacity-90 transition">
                                Rejoindre
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                      {activeStreams.filter(stream => stream.creator_id !== profile?.id).length === 0 && (
                        <div className="col-span-full glass-panel p-12 rounded-2xl border border-black/5 dark:border-white/5 text-center space-y-4">
                          <div className="w-14 h-14 bg-black/5 dark:bg-white/5 rounded-xl flex items-center justify-center text-2xl mx-auto">📺</div>
                          <div>
                            <h3 className="font-extrabold text-base">Aucun livestream actif</h3>
                            <p className="text-xs text-ios-label-secondaryLight max-w-sm mx-auto mt-1">Revenez plus tard.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* DONATION MODAL */}
      {showDonationModal && (viewingStream || currentStream) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
          <div className="w-full max-w-md rounded-3xl border border-white/10 shadow-2xl overflow-hidden relative" style={{ background: 'linear-gradient(145deg, #111827, #0f1117)' }}>
            <button onClick={() => setShowDonationModal(false)} className="absolute top-4 right-4 p-1.5 bg-white/5 hover:bg-white/10 rounded-full text-white/60">
              <X className="w-4 h-4" />
            </button>
            <form onSubmit={handleDonationSubmit} className="p-6 space-y-5">
              <div className="text-center space-y-1">
                <span className="text-3xl">💝</span>
                <h3 className="text-white font-extrabold text-lg">Soutenir le Créateur</h3>
                <p className="text-white/50 text-xs">Soutenez {(viewingStream || currentStream)?.creator?.full_name || (viewingStream || currentStream)?.creator?.username}</p>
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider">Montant (€)</label>
                <div className="grid grid-cols-5 gap-2">
                  {[5, 10, 25, 50, 100].map(amt => (
                    <button key={amt} type="button" onClick={() => setDonationAmount(amt)}
                      className={`py-2 rounded-xl text-xs font-bold border transition ${donationAmount === amt ? 'bg-blue-500 border-blue-500 text-white' : 'bg-white/5 border-white/5 text-white/60 hover:bg-white/10'}`}>
                      {amt}€
                    </button>
                  ))}
                </div>
                <input type="number" min="1" required value={donationAmount} onChange={e => setDonationAmount(Math.max(1, Number(e.target.value)))}
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-center font-bold mt-2" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1">Message (optionnel)</label>
                <textarea value={donationMessage} onChange={e => setDonationMessage(e.target.value)} maxLength={150}
                  placeholder="Merci pour ce super live ! 🔥"
                  className="w-full bg-white/5 border border-white/5 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 h-20 resize-none" />
              </div>
              <button type="submit" disabled={isSubmittingDonation}
                className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-extrabold py-3.5 rounded-xl shadow-lg active:scale-95 disabled:opacity-50 text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                {isSubmittingDonation
                  ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <><Heart className="w-4 h-4 fill-current text-pink-300" /> Confirmer {donationAmount.toFixed(2)} €</>}
              </button>
              <div className="text-center">
                <span className="text-[9px] font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-0.5 rounded-full border border-emerald-400/20">
                  ✨ Vous gagnez {donationAmount * 5} XP
                </span>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
