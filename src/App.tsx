/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef, FormEvent, Component, ErrorInfo, ReactNode } from 'react';
import { TrendingUp, ArrowUpRight, ArrowDownRight, RefreshCw, ChevronDown, Clock, Calendar, AlertCircle, Globe, Send, Bot, User, Sparkles, Zap, Target, ShieldAlert, Layers, Activity, Info, Volume2, VolumeX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { db, auth, signInWithGoogle, logOut } from './firebase';
import { collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends Component<any, any> {
  constructor(props: any) {
    super(props);
    // @ts-ignore
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    // @ts-ignore
    if (this.state.hasError) {
      let message = "Something went wrong.";
      try {
        // @ts-ignore
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && parsed.operationType) {
          message = `Firestore ${parsed.operationType} error: ${parsed.error}`;
        }
      } catch (e) {
        // @ts-ignore
        message = this.state.error?.message || message;
      }
      return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4 text-white text-center">
          <div className="max-w-md space-y-4">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
            <h1 className="text-2xl font-bold">Application Error</h1>
            <p className="text-white/60">{message}</p>
            <Button onClick={() => window.location.reload()} variant="outline">Reload App</Button>
          </div>
        </div>
      );
    }

    // @ts-ignore
    return this.props.children;
  }
}

interface GannLevel {
  degree: string;
  factor: number;
  upside: number;
  downside: number;
}

interface MarketItem {
  symbol: string;
  price: number;
  change: number;
}

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isCommand?: boolean;
}

const INSTRUMENTS = [
  { label: 'NIFTY 50', value: 'NIFTY', icon: 'https://img.icons8.com/color/48/india.png' },
  { label: 'BANK NIFTY', value: 'BANKNIFTY', icon: 'https://img.icons8.com/color/48/bank.png' },
  { label: 'FIN NIFTY', value: 'FINNIFTY', icon: 'https://img.icons8.com/color/48/money-bag.png' },
  { label: 'SENSEX', value: 'SENSEX', icon: 'https://img.icons8.com/color/48/bullish.png' },
  { label: 'BTC (Bitcoin)', value: 'BTC', icon: 'https://img.icons8.com/color/48/bitcoin.png' },
  { label: 'ETH (Ethereum)', value: 'ETH', icon: 'https://img.icons8.com/color/48/ethereum.png' },
  { label: 'XAUUSD (Gold)', value: 'XAUUSD', icon: 'https://img.icons8.com/color/48/gold-bars.png' },
  { label: 'CRUDE OIL', value: 'CRUDE', icon: 'https://img.icons8.com/color/48/oil-industry.png' },
  { label: 'SILVER', value: 'SILVER', icon: 'https://img.icons8.com/color/48/silver-bars.png' },
];

interface User {
  id: string;
  phone: string;
  isAdmin: boolean;
  subscriptionActive: boolean;
  expiryDate: string | null;
  trialUsed: boolean;
}

const BinaryBackground = () => {
  return (
    <div className="fixed inset-0 -z-10 bg-black overflow-hidden pointer-events-none">
      <div className="absolute inset-0 opacity-30">
        <div className="binary-rain">
          {Array.from({ length: 30 }).map((_, i) => (
            <div 
              key={i} 
              className="binary-column" 
              style={{ 
                left: `${i * 3.33}%`, 
                animationDuration: `${10 + Math.random() * 20}s`,
                animationDelay: `-${Math.random() * 20}s`
              }}
            >
              {Array.from({ length: 60 }).map((_, j) => (
                <span key={j} className="my-0.5">{Math.round(Math.random())}</span>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-center opacity-[0.03]">
        <span className="text-[15vw] font-black text-white select-none whitespace-nowrap tracking-tighter">TREND ANALYZER</span>
      </div>
    </div>
  );
};

const CustomLogo = () => {
  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
      className="flex items-center gap-2 group cursor-pointer w-full sm:w-auto justify-center sm:justify-start"
    >
      <div className="relative">
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            opacity: [0.2, 0.4, 0.2]
          }}
          transition={{ duration: 4, repeat: Infinity }}
          className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" 
        />
        <motion.div 
          whileHover={{ scale: 1.1, rotate: 5 }}
          className="relative bg-gradient-to-br from-blue-600 to-blue-800 p-2 rounded-xl border border-white/10 shadow-2xl"
        >
          <TrendingUp className="w-6 h-6 text-white" />
        </motion.div>
      </div>
      <div className="flex flex-col">
        <motion.span 
          animate={{ 
            textShadow: ["0 0 0px rgba(255,255,255,0)", "0 0 10px rgba(59,130,246,0.5)", "0 0 0px rgba(255,255,255,0)"]
          }}
          transition={{ duration: 3, repeat: Infinity }}
          className="text-lg font-black tracking-tighter metallic-gold leading-none"
        >
          TREND
        </motion.span>
        <span className="text-[10px] font-bold tracking-[0.3em] text-blue-400/80 leading-none">ANALYZER</span>
      </div>
    </motion.div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<any>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authForm, setAuthForm] = useState({ phone: '', password: '' });
  const [authError, setAuthError] = useState('');
  const [isAdminPanel, setIsAdminPanel] = useState(false);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [guides, setGuides] = useState<any[]>([]);
  const [newGuide, setNewGuide] = useState({ title: '', content: '', imageUrl: '' });
  const [editingGuideId, setEditingGuideId] = useState<string | null>(null);
  
  const [protocols, setProtocols] = useState<any[]>([]);
  const [newProtocol, setNewProtocol] = useState({ title: '', content: '', imageUrl: '' });
  const [editingProtocolId, setEditingProtocolId] = useState<string | null>(null);

  const [adminSettings, setAdminSettings] = useState({
    subscriptionPrice: 999,
    trialDays: 3,
    isTrialEnabled: true
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedInstrument, setSelectedInstrument] = useState<string>('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Welcome to Trend Analyzer Intelligence. Select an instrument to begin analysis.', timestamp: new Date() }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isTtsEnabled, setIsTtsEnabled] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const ai = useMemo(() => new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' }), []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const marketStatus = useMemo(() => {
    // Convert current time to IST for market logic
    const istDate = new Date(currentTime.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const day = istDate.getDay();
    const hours = istDate.getHours();
    const minutes = istDate.getMinutes();
    const timeVal = hours * 100 + minutes;

    const isIndianMarket = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'].includes(selectedInstrument);
    
    if (isIndianMarket) {
      const isWeekday = day >= 1 && day <= 5;
      const isOpen = isWeekday && timeVal >= 915 && timeVal <= 1530;
      return { status: isOpen ? 'OPEN' : 'CLOSED', type: 'INDIAN' };
    }

    if (['BTC', 'ETH', 'XAUUSD', 'CRUDE', 'SILVER'].includes(selectedInstrument)) {
      let activeSession = 'NONE';
      let nextSession = '';
      let nextTime = '';
      let impact = 'LOW';

      // Global Sessions in IST
      if (timeVal >= 530 && timeVal < 1330) {
        activeSession = 'ASIAN';
        nextSession = 'LONDON';
        nextTime = '13:30';
        impact = 'MEDIUM';
      } else if (timeVal >= 1330 && timeVal < 1830) {
        activeSession = 'LONDON';
        nextSession = 'NEW YORK';
        nextTime = '18:30';
        impact = 'HIGH';
      } else if (timeVal >= 1830 || timeVal < 330) {
        activeSession = 'NEW YORK';
        nextSession = 'ASIAN';
        nextTime = '05:30';
        impact = 'HIGH';
      } else {
        activeSession = 'TRANSITION';
        nextSession = 'ASIAN';
        nextTime = '05:30';
      }

      return { status: 'LIVE', type: 'GLOBAL', activeSession, nextSession, nextTime, impact };
    }

    return null;
  }, [currentTime, selectedInstrument]);

  const upcomingEvents = useMemo(() => {
    if (!selectedInstrument) return [];
    
    const isIndian = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'SENSEX'].includes(selectedInstrument);
    const isCrypto = ['BTC', 'ETH'].includes(selectedInstrument);
    const isForex = ['XAUUSD'].includes(selectedInstrument);
    const isCommodity = ['CRUDE', 'SILVER'].includes(selectedInstrument);

    if (isIndian) {
      return [
        { title: 'RBI Policy Meeting', time: '10:00 AM', impact: 'HIGH' },
        { title: 'India GDP Data', time: '05:30 PM', impact: 'MEDIUM' }
      ];
    }
    if (isCrypto) {
      return [
        { title: 'BTC Options Expiry', time: '01:30 PM', impact: 'HIGH' },
        { title: 'Network Upgrade', time: 'Next Week', impact: 'MEDIUM' }
      ];
    }
    if (isForex || isCommodity) {
      return [
        { title: 'US CPI Release', time: '06:30 PM', impact: 'HIGH' },
        { title: 'FOMC Minutes', time: '11:30 PM', impact: 'HIGH' }
      ];
    }
    return [];
  }, [selectedInstrument]);

  const [price, setPrice] = useState<string>('');
  const [manualOpeningPrice, setManualOpeningPrice] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [marketData, setMarketData] = useState<MarketItem[]>([]);
  const [results, setResults] = useState<{
    sqrt: number;
    levels: GannLevel[];
  } | null>(null);

  const [copiedValue, setCopiedValue] = useState<string | null>(null);

  const copyToClipboard = (val: number) => {
    const text = val.toFixed(2);
    navigator.clipboard.writeText(text);
    setCopiedValue(text);
    setTimeout(() => setCopiedValue(null), 2000);
  };

  const [marketError, setMarketError] = useState<string | null>(null);

  // Fetch Market Ticker Data
  const fetchMarketData = useCallback(async () => {
    try {
      setMarketError(null);
      const res = await fetch('/api/market-data');
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch market data');
      }
      const data = await res.json();
      setMarketData(data);
    } catch (e) {
      console.error("Failed to fetch market data", e);
      setMarketError(e instanceof Error ? e.message : 'Failed to fetch market data');
    }
  }, []);

  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 60000); // Update every 60s
    return () => clearInterval(interval);
  }, [fetchMarketData]);

  const calculateGann = useCallback((overridePrice?: string) => {
    const p = parseFloat(overridePrice || manualOpeningPrice || price);
    if (isNaN(p) || p <= 0) return;

    const sqrtP = Math.sqrt(p);
    const factors = [
      { degree: '90°', factor: 0.50 },
      { degree: '135°', factor: 0.75 },
      { degree: '180°', factor: 1.00 },
      { degree: '225°', factor: 1.25 },
      { degree: '270°', factor: 1.50 },
      { degree: '360°', factor: 2.00 },
    ];

    const levels: GannLevel[] = factors.map(f => ({
      degree: f.degree,
      factor: f.factor,
      upside: Math.pow(sqrtP + f.factor, 2),
      downside: Math.pow(sqrtP - f.factor, 2),
    }));

    setResults({
      sqrt: sqrtP,
      levels
    });
  }, [price, manualOpeningPrice]);

  const [error, setError] = useState<string | null>(null);

  // Fetch Opening Price
  const fetchOpeningPrice = useCallback(async (symbol: string) => {
    if (!symbol) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/instrument-open/${symbol}`);
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to fetch price');
      }
      const data = await res.json();
      if (data.open) {
        setPrice(data.open.toString());
        // Auto calculate after fetching
        calculateGann(data.open.toString());
      } else {
        throw new Error('Price not available');
      }
    } catch (e) {
      console.error("Failed to fetch opening price", e);
      setError(e instanceof Error ? e.message : 'Failed to fetch price');
      // Clear error after 5 seconds
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsLoading(false);
    }
  }, [calculateGann]);

  // Compounding Calculator State
  const [startCapital, setStartCapital] = useState<string>('21');
  const [marginPerLot, setMarginPerLot] = useState<string>('1.8');
  const [slPoints, setSlPoints] = useState<string>('300');
  const [inrRate, setInrRate] = useState<string>('85');

  const profitPer1000Pts = 10;

  const numberToWords = (num: number): string => {
    const ones = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
      "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
    const tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

    const convert = (n: number): string => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + " " + ones[n % 10];
      if (n < 1000) return ones[Math.floor(n / 100)] + " Hundred " + convert(n % 100);
      return "";
    };

    if (num < 1000) return convert(num);
    if (num < 100000) return convert(Math.floor(num / 1000)) + " Thousand " + convert(num % 1000);
    if (num < 10000000) return convert(Math.floor(num / 100000)) + " Lakh " + convert(num % 100000);
    return convert(Math.floor(num / 10000000)) + " Crore " + convert(num % 10000000);
  };

  const getCompoundingData = () => {
    const startCap = parseFloat(startCapital) || 0;
    const margin = parseFloat(marginPerLot) || 0;
    const sl = parseFloat(slPoints) || 0;
    const rate = parseFloat(inrRate) || 0;

    let currentCap = startCap;
    let prevProfit = 0;
    let milestoneCount = 0;
    const rows = [];

    for (let day = 1; day <= 10; day++) {
      let lots = day === 1 ? 2 : Math.floor(prevProfit / ((sl / 1000) * profitPer1000Pts));
      if (lots < 1) lots = 1;

      const marginTotal = (lots * margin);
      const profit = lots * profitPer1000Pts;
      const dayStartCap = currentCap;
      currentCap = currentCap + profit;
      const capINR = currentCap * rate;

      const newMilestone = Math.floor(capINR / 100000);
      if (newMilestone > milestoneCount) milestoneCount = newMilestone;

      rows.push({
        day,
        startCap: dayStartCap,
        lots,
        marginTotal,
        sl: day === 1 ? "N/A" : sl,
        gain: 1000,
        profit,
        endCapUSD: currentCap,
        endCapINR: capINR,
        milestone: milestoneCount,
        words: numberToWords(Math.floor(capINR))
      });

      prevProfit = profit;
    }
    return rows;
  };

  const handleSendMessage = async (text: string, isCommand: boolean = false) => {
    if (!text.trim() || isAiLoading) return;

    const userMsg: ChatMessage = { role: 'user', text, timestamp: new Date(), isCommand };
    setChatMessages(prev => [...prev, userMsg]);
    if (!selectedInstrument && (text === 'hidden reversals' || text === 'impact levels')) {
      setChatMessages(prev => [...prev, { 
        role: 'model', 
        text: '⚠️ Please select an instrument first.', 
        timestamp: new Date() 
      }]);
      return;
    }

    setChatInput('');
    setIsAiLoading(true);

    const disclaimer = "\n\n“This analysis is for informational purposes only. Please conduct your own research and consult with a financial advisor before making any investment decisions. We are not responsible for any profits or losses incurred.”";

    try {
      let currentPriceInfo = "";
      let technicalData = "";
      
      if (selectedInstrument) {
        try {
          // Fetch live price for AI context accuracy
          const priceRes = await fetch(`/api/live-price/${selectedInstrument}`);
          const priceData = await priceRes.json();
          if (priceData.price) {
            currentPriceInfo = `Current Market Price for ${selectedInstrument} is ${priceData.price}.`;
          }

          // Fetch technical data for accuracy
          const techRes = await fetch(`/api/technical-analysis/${selectedInstrument}`);
          const techData = await techRes.json();
          if (techData.history && techData.history.length > 0) {
            technicalData = `Last 50 Candles of 15-Minute (15m) OHLC Data for ${selectedInstrument} (Source: Yahoo Finance API):\n` + 
              techData.history.map((h: any) => 
                `Time: ${new Date(h.date).toLocaleString()}, O: ${h.open}, H: ${h.high}, L: ${h.low}, C: ${h.close}`
              ).join('\n');
          }
        } catch (e) {
          console.error("Failed to fetch data for AI context", e);
        }
      }

      let systemInstruction = `You are Trend Analyzer Intelligence, a professional trading assistant.
      Instrument: ${selectedInstrument || 'None'}.
      ${currentPriceInfo}
      
      TECHNICAL CONTEXT:
      ${technicalData}
      
      RULES:
      1. Use the provided data to identify accurate Reversal Zones and Key Areas.
      2. CRITICAL: DO NOT use any of the following words/terms in your response: 
         "15-minute", "1hr", "4hr", "1 day", "OHLC", "imbalances", "order blocks", "fvg", "nearest swing", "ict", "Fair Value Gap".
         Use "Reversal Zone", "Imbalance Zone", "Bullish Area", "Bearish Area", "Market Swing" instead.
      3. SWING FOCUS: Only consider Reversal Zones that are created at or near major Market Swings.
      4. NEAREST ZONES: When 'hidden reversals' is requested, identify the nearest Bullish and Bearish Swings relative to the current price (${currentPriceInfo}). Only update/show the Reversal Zones associated with these specific nearest swings.
      5. Be precise with price levels. Do not hallucinate data.
      6. Always maintain a professional, technical yet accessible tone.
      7. MANDATORY: You MUST end EVERY response with the following disclaimer exactly:
      ${disclaimer}`;

      let prompt = text;

      if (isCommand) {
        if (text === 'hidden reversals') {
          prompt = `Analyze the nearest Bullish and Bearish Swings for ${selectedInstrument} based on the current price (${currentPriceInfo}). 
          Identify the specific Reversal Zones located at these swings.
          
          Format:
          **Major Reversals (At Nearest Swings):**
          * Zone: [Price Range]
          * Type: [Bullish/Bearish Swing Zone]
          * Status: ⚠️ UNFILLED
          
          **Secondary Reversals:**
          * Zone: [Price Range]
          
          **Weak Reversals:**
          * Zone: [Price Range]
          
          Strictly avoid forbidden terms. Only show zones at the nearest market swings.`;
        } else if (text === 'impact levels') {
          prompt = `Identify major Bullish and Bearish Areas for ${selectedInstrument} that are located at the nearest market swings relative to the current price (${currentPriceInfo}). 
          Use terms 'Bullish Area' and 'Bearish Area'.`;
        }
      }

      const response = await (ai as any).models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          systemInstruction: systemInstruction
        }
      });

      let responseText = response.text || "";
      
      // Ensure disclaimer is present if model forgot
      if (!responseText.includes("This analysis is for informational purposes only")) {
        responseText += disclaimer;
      }

      const modelMsg: ChatMessage = { 
        role: 'model', 
        text: responseText, 
        timestamp: new Date() 
      };
      setChatMessages(prev => [...prev, modelMsg]);

      // Automatic TTS if enabled
      if (isTtsEnabled) {
        const utterance = new SpeechSynthesisUtterance(responseText.split('“This analysis')[0]); // Speak only the content, not disclaimer
        utterance.rate = 1;
        utterance.pitch = 1;
        window.speechSynthesis.speak(utterance);
      }

    } catch (e) {
      console.error("AI Error:", e);
      setChatMessages(prev => [...prev, { 
        role: 'model', 
        text: (e instanceof Error ? e.message : 'Error connecting to intelligence system.') + disclaimer, 
        timestamp: new Date() 
      }]);
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          const userRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userRef);
          
          let phoneStr = firebaseUser.email || firebaseUser.phoneNumber || 'User';
          if (phoneStr.endsWith('@trendanalyzer.com')) {
            phoneStr = phoneStr.replace('@trendanalyzer.com', '');
          }

          const isAdminUser = 
            firebaseUser.email === 'homestaymart@gmail.com' || 
            firebaseUser.email === 'nirankarsen7@gmail.com' || 
            phoneStr === 'admin' || 
            phoneStr === 'trend@dmca.com' || 
            phoneStr === 'trend';

          let userData = {
            id: firebaseUser.uid,
            phone: phoneStr,
            isAdmin: isAdminUser,
            subscriptionActive: true,
            trialUsed: true,
            expiryDate: null
          };

          if (userSnap.exists()) {
            userData = { ...userData, ...userSnap.data() };
            // Force admin status if they are in the hardcoded list but DB says false
            if (isAdminUser && !userData.isAdmin) {
              userData.isAdmin = true;
              await updateDoc(userRef, { isAdmin: true });
            }
          } else {
            await setDoc(userRef, userData);
          }
          
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (e) {
        console.error("Auth state change error:", e);
      } finally {
        setIsAuthReady(true);
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAuthReady || !user) return;

    const unsubGuides = onSnapshot(collection(db, 'guides'), (snapshot) => {
      setGuides(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'guides');
    });

    const unsubProtocols = onSnapshot(collection(db, 'protocols'), (snapshot) => {
      setProtocols(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'protocols');
    });

    const unsubSettings = onSnapshot(doc(db, 'settings', 'admin'), (docSnap) => {
      if (docSnap.exists()) {
        setAdminSettings(docSnap.data() as any);
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'settings/admin');
    });

    let unsubUsers = () => {};
    if (user?.isAdmin) {
      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });
    }

    return () => {
      unsubGuides();
      unsubProtocols();
      unsubSettings();
      unsubUsers();
    };
  }, [isAuthReady, user]);

  const addOrUpdateGuide = async () => {
    if (!newGuide.title || !newGuide.content) return;
    try {
      if (editingGuideId) {
        await updateDoc(doc(db, 'guides', editingGuideId), newGuide);
      } else {
        await addDoc(collection(db, 'guides'), newGuide);
      }
      setNewGuide({ title: '', content: '', imageUrl: '' });
      setEditingGuideId(null);
    } catch (e) {
      handleFirestoreError(e, editingGuideId ? OperationType.UPDATE : OperationType.CREATE, editingGuideId ? `guides/${editingGuideId}` : 'guides');
    }
  };

  const deleteGuide = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'guides', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `guides/${id}`);
    }
  };

  const addOrUpdateProtocol = async () => {
    if (!newProtocol.title || !newProtocol.content) return;
    try {
      if (editingProtocolId) {
        await updateDoc(doc(db, 'protocols', editingProtocolId), newProtocol);
      } else {
        await addDoc(collection(db, 'protocols'), newProtocol);
      }
      setNewProtocol({ title: '', content: '', imageUrl: '' });
      setEditingProtocolId(null);
    } catch (e) {
      handleFirestoreError(e, editingProtocolId ? OperationType.UPDATE : OperationType.CREATE, editingProtocolId ? `protocols/${editingProtocolId}` : 'protocols');
    }
  };

  const deleteProtocol = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'protocols', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `protocols/${id}`);
    }
  };

  const updateAdminSettings = async (newSettings: any) => {
    try {
      await setDoc(doc(db, 'settings', 'admin'), newSettings);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'settings/admin');
    }
  };

  const handleAuth = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setAuthError('');
    
    const phoneInput = authForm.phone.trim();
    if (!phoneInput) {
      setAuthError('Please enter your mobile number.');
      return;
    }

    try {
      let email = phoneInput;
      if (!email.includes('@')) {
        // Treat as username/phone, remove all spaces to ensure valid email local part
        email = `${email.replace(/\s+/g, '')}@trendanalyzer.com`;
      }

      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, email, authForm.password);
      } else {
        await createUserWithEmailAndPassword(auth, email, authForm.password);
      }
    } catch (e: any) {
      console.error("Auth error", e);
      if (e.code === 'auth/operation-not-allowed') {
        setAuthError('Error: Email/Password login is not enabled in Firebase Console. Please ask the developer to enable it in Authentication -> Sign-in method.');
      } else if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        setAuthError('Invalid mobile number or password.');
      } else if (e.code === 'auth/email-already-in-use') {
        setAuthError('This mobile number is already registered.');
      } else if (e.code === 'auth/weak-password') {
        setAuthError('Password should be at least 6 characters.');
      } else if (e.code === 'auth/invalid-email') {
        setAuthError('The mobile number or email format is invalid.');
      } else {
        setAuthError('Authentication failed. Please try again.');
      }
    }
  };

  const handleGoogleAuth = async () => {
    setAuthError('');
    try {
      await signInWithGoogle();
    } catch (e) {
      setAuthError('Google authentication failed. Please try again.');
    }
  };

  const updateSubscription = async (userId: string, active: boolean, days: number) => {
    try {
      const expiry = new Date();
      expiry.setDate(expiry.getDate() + days);
      await updateDoc(doc(db, 'users', userId), {
        subscriptionActive: active,
        expiryDate: active ? expiry.toISOString() : null
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`);
    }
  };

  const compoundingData = getCompoundingData();

  if (!isAuthReady) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white font-bold">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <BinaryBackground />
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <Card className="glass-card-3d border-white/10 bg-white/5 p-8 rounded-3xl">
            <div className="flex flex-col items-center mb-8">
              <CustomLogo />
              <h2 className="text-xl font-black mt-6 text-white uppercase tracking-widest">
                {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
              </h2>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Mobile Number</label>
                <Input 
                  value={authForm.phone}
                  onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                  placeholder="Enter your mobile number"
                  className="bg-white/5 border-white/10 text-white h-12 rounded-xl"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Password</label>
                <Input 
                  type="password"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  placeholder="••••••••"
                  className="bg-white/5 border-white/10 text-white h-12 rounded-xl"
                  required
                />
              </div>

              {authError && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {authError}
                </div>
              )}

              <Button type="submit" className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-black rounded-xl transition-all shadow-lg shadow-blue-600/20">
                {authMode === 'login' ? 'LOGIN NOW' : 'REGISTER & START TRIAL'}
              </Button>
            </form>

            <div className="mt-6 text-center space-y-4">
              <button 
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-xs text-white/40 hover:text-white font-bold uppercase tracking-widest transition-colors"
              >
                {authMode === 'login' ? "Don't have an account? Register" : "Already have an account? Login"}
              </button>
              
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-[#0a0a0a] px-2 text-white/40 font-bold">Or continue with</span>
                </div>
              </div>

              <Button type="button" onClick={handleGoogleAuth} className="w-full bg-white text-black hover:bg-gray-200 font-bold h-12 rounded-xl flex items-center justify-center gap-2">
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Google
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!user.subscriptionActive && !user.isAdmin) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <BinaryBackground />
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg"
        >
          <Card className="glass-card-3d border-white/10 bg-white/5 p-8 rounded-3xl text-center">
            <ShieldAlert className="w-16 h-16 text-amber-500 mx-auto mb-6 animate-bounce" />
            <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2">Subscription Expired</h2>
            <p className="text-white/60 mb-8">Your 3-day free trial has ended. Please contact admin to activate your subscription and continue using Trend Analyzer.</p>
            
            <div className="grid grid-cols-1 gap-4 mb-8">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left">
                <div className="text-[10px] font-black text-white/40 uppercase mb-1">User ID</div>
                <div className="text-white font-bold">{user.phone}</div>
              </div>
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-left">
                <div className="text-[10px] font-black text-white/40 uppercase mb-1">Trial Status</div>
                <div className="text-amber-500 font-bold">EXPIRED</div>
              </div>
            </div>

            <Button 
              onClick={() => logOut()}
              className="w-full h-12 bg-white/10 hover:bg-white/20 text-white font-black rounded-xl"
            >
              LOGOUT
            </Button>
          </Card>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-blue-500/30 relative">
      <BinaryBackground />
      {/* Market Ticker & Status Bar */}
      <div className="bg-[#111] border-b border-white/5 sticky top-0 z-50 backdrop-blur-md bg-opacity-95 h-16 flex items-center shadow-xl">
        <div className="flex items-center w-full px-4 gap-4 sm:gap-8">
          {/* Ticker Section */}
          <div className="flex-1 overflow-hidden relative group min-w-0">
            {marketError ? (
              <div className="flex items-center gap-4">
                <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest">Market Data Offline</span>
                <button 
                  onClick={() => fetchMarketData()}
                  className="text-[10px] font-bold text-blue-500 hover:text-blue-400 flex items-center gap-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            ) : (
              <div className="flex animate-marquee hover:pause gap-12 py-1">
                {(marketData.length > 0 ? [...marketData, ...marketData] : []).map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs font-medium shrink-0">
                    <span className="text-gray-500 font-bold">{item.symbol}</span>
                    <span className="text-white font-mono">{item.price?.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    <span className={`flex items-center font-bold ${item.change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {item.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      {Math.abs(item.change).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
            {/* Fade Edges */}
            <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-[#111] to-transparent pointer-events-none z-10" />
            <div className="absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#111] to-transparent pointer-events-none z-10" />
          </div>

          {/* Upcoming High Impact Events Section */}
          <div className="hidden lg:flex items-center gap-4 flex-1 min-w-0">
            <div className="flex items-center gap-2 px-3 py-1 bg-white/5 rounded-lg border border-white/10 shrink-0">
              <Zap className="w-3 h-3 text-amber-500 animate-pulse" />
              <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Upcoming High Impact Events</span>
            </div>
            <div className="flex gap-4 overflow-hidden">
              {upcomingEvents.length > 0 ? (
                upcomingEvents.map((event, idx) => (
                  <div key={idx} className="flex items-center gap-2 shrink-0 animate-in slide-in-from-right duration-500" style={{ animationDelay: `${idx * 100}ms` }}>
                    <Badge variant="outline" className={`text-[9px] font-black uppercase ${event.impact === 'HIGH' ? 'border-red-500/30 text-red-500 bg-red-500/5' : 'border-amber-500/30 text-amber-500 bg-amber-500/5'}`}>
                      {event.impact}
                    </Badge>
                    <span className="text-[11px] font-bold text-white/80 whitespace-nowrap">{event.title}</span>
                    <span className="text-[10px] font-medium text-white/30">@{event.time}</span>
                  </div>
                ))
              ) : (
                <span className="text-[10px] font-bold text-white/20 uppercase italic">No major events scheduled for this instrument</span>
              )}
            </div>
          </div>

          {/* Live Clock & Market Status */}
          <div className="flex items-center gap-4 sm:gap-8 pl-4 sm:pl-8 border-l border-white/10 shrink-0">
            <div className="flex flex-col items-end min-w-[110px]">
              <div className="flex items-center gap-2 text-sm sm:text-base font-black text-white tracking-tight">
                <Clock className="w-4 h-4 text-blue-500" />
                {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                <Calendar className="w-3 h-3" />
                {currentTime.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>

            <div className="min-w-[140px] flex justify-end">
              {marketStatus ? (
                <div className="flex flex-col items-end">
                  {marketStatus.type === 'INDIAN' ? (
                    <div className="flex items-center gap-2.5 bg-white/[0.03] px-4 py-1.5 rounded-xl border border-white/10">
                      <div className={`w-2.5 h-2.5 rounded-full ${marketStatus.status === 'OPEN' ? 'bg-green-500 animate-pulse shadow-[0_0_12px_rgba(34,197,94,1)]' : 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]'}`} />
                      <span className={`text-xs font-black tracking-widest ${marketStatus.status === 'OPEN' ? 'text-green-500' : 'text-red-500'}`}>
                        {marketStatus.status}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-2 text-blue-400 bg-blue-500/5 px-3 py-1 rounded-lg border border-blue-500/10">
                        <Globe className="w-4 h-4 animate-spin-slow" />
                        <span className="text-[11px] font-black uppercase tracking-tighter">{marketStatus.activeSession} SESSION</span>
                      </div>
                      <div className="text-[9px] text-amber-500 font-bold uppercase tracking-tighter flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
                        Next: {marketStatus.nextSession} ({marketStatus.nextTime})
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Market Status</span>
                  <span className="text-[9px] text-gray-700 font-medium">Select an instrument</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8 space-y-8">
        {isAdminPanel ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="glass-card-3d border-white/10 bg-white/5 p-6 rounded-2xl">
                <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Subscription Price</div>
                <div className="flex items-center gap-3">
                  <Input 
                    type="number" 
                    value={adminSettings.subscriptionPrice} 
                    onChange={(e) => updateAdminSettings({ ...adminSettings, subscriptionPrice: Number(e.target.value) })}
                    className="bg-white/5 border-white/10 text-white h-10 rounded-xl"
                  />
                  <span className="text-white font-bold">INR</span>
                </div>
              </Card>
              <Card className="glass-card-3d border-white/10 bg-white/5 p-6 rounded-2xl">
                <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Trial Duration</div>
                <div className="flex items-center gap-3">
                  <Input 
                    type="number" 
                    value={adminSettings.trialDays} 
                    onChange={(e) => updateAdminSettings({ ...adminSettings, trialDays: Number(e.target.value) })}
                    className="bg-white/5 border-white/10 text-white h-10 rounded-xl"
                  />
                  <span className="text-white font-bold">Days</span>
                </div>
              </Card>
              <Card className="glass-card-3d border-white/10 bg-white/5 p-6 rounded-2xl">
                <div className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-2">Trial Status</div>
                <div className="flex items-center justify-between">
                  <span className="text-white font-bold">{adminSettings.isTrialEnabled ? 'ENABLED' : 'DISABLED'}</span>
                  <Button 
                    size="sm" 
                    onClick={() => updateAdminSettings({ ...adminSettings, isTrialEnabled: !adminSettings.isTrialEnabled })}
                    className={adminSettings.isTrialEnabled ? 'bg-red-500/20 text-red-500' : 'bg-green-500/20 text-green-500'}
                  >
                    {adminSettings.isTrialEnabled ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </Card>
            </div>

            <Card className="glass-card-3d border-white/10 bg-white/5 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-white/5 bg-white/5 flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-black tracking-tight metallic-gold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" />
                  CORE EXECUTION GUIDES
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input 
                    placeholder="Guide Title" 
                    value={newGuide.title}
                    onChange={(e) => setNewGuide({ ...newGuide, title: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                  />
                  <Input 
                    placeholder="Image URL (Optional)" 
                    value={newGuide.imageUrl}
                    onChange={(e) => setNewGuide({ ...newGuide, imageUrl: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
                <textarea 
                  placeholder="Guide Content" 
                  value={newGuide.content}
                  onChange={(e) => setNewGuide({ ...newGuide, content: e.target.value })}
                  className="w-full h-32 bg-white/5 border border-white/10 text-white rounded-xl p-4 text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                />
                <Button onClick={addOrUpdateGuide} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black">
                  {editingGuideId ? 'UPDATE GUIDE' : 'ADD NEW GUIDE'}
                </Button>
                {editingGuideId && (
                  <Button variant="outline" onClick={() => { setEditingGuideId(null); setNewGuide({title: '', content: '', imageUrl: ''}); }} className="w-full mt-2 text-white/60">
                    CANCEL EDIT
                  </Button>
                )}

                <div className="space-y-4 mt-8">
                  {guides.map((g) => (
                    <div key={g.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-white">{g.title}</h4>
                        <p className="text-xs text-white/40 line-clamp-1">{g.content}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => {
                          setEditingGuideId(g.id);
                          setNewGuide({ title: g.title, content: g.content, imageUrl: g.imageUrl || '' });
                        }}>Edit</Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteGuide(g.id)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card-3d border-white/10 bg-white/5 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-white/5 bg-white/5 flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-black tracking-tight metallic-gold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-500" />
                  THE TREND ANALYZER GROWTH PROTOCOL
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input 
                    placeholder="Protocol Title" 
                    value={newProtocol.title}
                    onChange={(e) => setNewProtocol({ ...newProtocol, title: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                  />
                  <Input 
                    placeholder="Image URL (Optional)" 
                    value={newProtocol.imageUrl}
                    onChange={(e) => setNewProtocol({ ...newProtocol, imageUrl: e.target.value })}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
                <textarea 
                  placeholder="Protocol Content" 
                  value={newProtocol.content}
                  onChange={(e) => setNewProtocol({ ...newProtocol, content: e.target.value })}
                  className="w-full h-32 bg-white/5 border border-white/10 text-white rounded-xl p-4 text-sm focus:ring-1 focus:ring-amber-500 outline-none"
                />
                <Button onClick={addOrUpdateProtocol} className="w-full bg-amber-600 hover:bg-amber-700 text-white font-black">
                  {editingProtocolId ? 'UPDATE PROTOCOL' : 'ADD NEW PROTOCOL'}
                </Button>
                {editingProtocolId && (
                  <Button variant="outline" onClick={() => { setEditingProtocolId(null); setNewProtocol({title: '', content: '', imageUrl: ''}); }} className="w-full mt-2 text-white/60">
                    CANCEL EDIT
                  </Button>
                )}

                <div className="space-y-4 mt-8">
                  {protocols.map((p) => (
                    <div key={p.id} className="p-4 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-white">{p.title}</h4>
                        <p className="text-xs text-white/40 line-clamp-1">{p.content}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => {
                          setEditingProtocolId(p.id);
                          setNewProtocol({ title: p.title, content: p.content, imageUrl: p.imageUrl || '' });
                        }}>Edit</Button>
                        <Button variant="destructive" size="sm" onClick={() => deleteProtocol(p.id)}>Delete</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="glass-card-3d border-white/10 bg-white/5 rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-white/5 bg-white/5 flex flex-row items-center justify-between">
                <CardTitle className="text-xl font-black tracking-tight metallic-gold flex items-center gap-2">
                  <User className="w-5 h-5 text-blue-500" />
                  ADMIN PANEL - USER MANAGEMENT
                </CardTitle>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsAdminPanel(false)}
                  className="bg-blue-500/10 text-blue-400 border-blue-500/20 hover:bg-blue-500/20"
                >
                  Back to App
                </Button>
              </CardHeader>
              <CardContent className="p-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-white/40">User ID</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-white/40">Status</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-white/40">Expiry</th>
                        <th className="p-3 text-[10px] font-black uppercase tracking-widest text-white/40">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map((u) => (
                        <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="p-3 font-bold">{u.phone}</td>
                          <td className="p-3">
                            <Badge className={u.subscriptionActive ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}>
                              {u.subscriptionActive ? 'ACTIVE' : 'INACTIVE'}
                            </Badge>
                          </td>
                          <td className="p-3 text-xs text-white/60">
                            {u.expiryDate ? new Date(u.expiryDate).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="p-3 flex gap-2">
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => updateSubscription(u.id, !u.subscriptionActive, 30)}
                              className="text-[10px] font-bold h-7"
                            >
                              {u.subscriptionActive ? 'Deactivate' : 'Activate 30d'}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div className="space-y-8">
            {/* New Header (Instrument Selector & Logo) */}
        <Card className="glass-card-3d border-white/10 bg-white/5 rounded-2xl overflow-hidden">
          <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-6 w-full sm:w-auto">
              <CustomLogo />
              
              <div className="w-full h-px sm:w-px sm:h-8 bg-white/10" />

              <div className="space-y-1 w-full sm:w-auto">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Instrument</label>
                <Select value={selectedInstrument} onValueChange={(val) => {
                  setSelectedInstrument(val);
                  fetchOpeningPrice(val);
                }}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white h-10 w-full sm:w-[240px] rounded-xl focus:ring-blue-500/50">
                    <SelectValue placeholder="Select Instrument" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#111] border-white/10 text-white">
                    {INSTRUMENTS.map((inst) => (
                      <SelectItem key={inst.value} value={inst.value} className="focus:bg-blue-600 focus:text-white">
                        <div className="flex items-center gap-2">
                          <img src={inst.icon} alt="" className="w-4 h-4" />
                          {inst.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {user?.isAdmin && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsAdminPanel(!isAdminPanel)}
                  className="bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20"
                >
                  {isAdminPanel ? 'Main App' : 'Admin Panel'}
                </Button>
              )}
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{user?.phone}</span>
                <button 
                  onClick={() => logOut()}
                  className="text-[9px] text-white/40 hover:text-white/60 font-bold uppercase transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Area (60/40 Split) */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-8 items-start">
          {/* LEFT SECTION (60%) - Levels Panel */}
          <div className="lg:col-span-6 space-y-8">
            <Card className="glass-card-3d rounded-3xl overflow-hidden border-white/10 bg-white/5">
              <CardHeader className="pb-2 border-b border-white/5 bg-white/5 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-xl font-black tracking-tight metallic-gold flex items-center gap-2">
                    <Layers className="w-5 h-5 text-amber-500" />
                    📊 LEVELS PANEL
                  </CardTitle>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Smart Generated Zones</p>
                </div>
                {selectedInstrument && (
                  <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                    {selectedInstrument} | LIVE ANALYSIS
                  </Badge>
                )}
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Enter Opening Price</label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={manualOpeningPrice}
                        onChange={(e) => {
                          setManualOpeningPrice(e.target.value);
                          calculateGann();
                        }}
                        placeholder="Manual Price Input"
                        className="bg-white/5 border-white/10 text-white h-10 rounded-xl focus:ring-blue-500/50"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Target className="w-4 h-4 text-white/20" />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Auto-Fetched Price</label>
                    <div className="flex items-center gap-2 bg-white/5 border border-white/10 h-10 px-4 rounded-xl">
                      <span className="text-sm font-bold text-blue-400">{price || '---'}</span>
                      <RefreshCw 
                        className={`w-3 h-3 text-white/20 cursor-pointer hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`} 
                        onClick={() => fetchOpeningPrice(selectedInstrument)}
                      />
                    </div>
                  </div>
                </div>

                {!results ? (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/10">
                      <Target className="w-8 h-8 text-white/20" />
                    </div>
                    <p className="text-sm text-white/40 font-medium italic">Select instrument and generate levels to see analysis</p>
                    <Button 
                      onClick={() => calculateGann()}
                      disabled={!selectedInstrument}
                      className="bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl px-8"
                    >
                      Generate Levels
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {results.levels.map((level, idx) => (
                      <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        key={idx} 
                        className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3 hover:bg-white/10 transition-all group cursor-pointer"
                        onClick={() => copyToClipboard(level.upside)}
                      >
                        <div className="flex justify-between items-center">
                          <Badge className={idx < 3 ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400"}>
                            {idx < 3 ? "Primary Zone" : "Secondary Zone"}
                          </Badge>
                          <Info className="w-3 h-3 text-white/10 group-hover:text-white/30 transition-colors" />
                        </div>
                        <div className="flex justify-between items-end">
                          <div>
                            <p className="text-[10px] text-white/40 font-bold uppercase">Upside Zone</p>
                            <p className="text-xl font-black text-green-400 group-hover:text-green-300 transition-colors">
                              {level.upside.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-[10px] text-white/40 font-bold uppercase">Downside Zone</p>
                            <p className="text-xl font-black text-red-400 group-hover:text-red-300 transition-colors">
                              {level.downside.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </p>
                          </div>
                        </div>
                        <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                          <span className="text-[9px] text-white/20 font-bold uppercase">Status: ⚠️ UNFILLED</span>
                          <Zap className="w-3 h-3 text-amber-500 animate-pulse" />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Compounding Tracker (Moved here or kept below) */}
            <Card className="glass-card-3d rounded-3xl overflow-hidden border-white/10 bg-white/5">
              <CardHeader className="border-b border-white/5 bg-white/5 py-6">
                <CardTitle className="text-2xl font-black text-center tracking-tight metallic-gold">Compounding Strategy Tracker</CardTitle>
                <p className="text-center text-xs text-white/40 font-bold uppercase tracking-widest mt-1">10-Day Growth Projection</p>
              </CardHeader>
              <CardContent className="p-6 space-y-10">
                {/* Inputs Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: 'Start Capital', unit: 'USD', value: startCapital, setter: setStartCapital },
                    { label: 'Margin / Lot', unit: 'USD', value: marginPerLot, setter: setMarginPerLot },
                    { label: 'SL Points', unit: 'Pts', value: slPoints, setter: setSlPoints },
                    { label: 'USD → INR', unit: 'Rate', value: inrRate, setter: setInrRate },
                  ].map((field, idx) => (
                    <div key={idx} className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-3 transition-all hover:bg-white/10">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-white/40">{field.label}</label>
                        <Badge variant="outline" className="text-[9px] border-white/10 text-white/30 px-1.5 py-0">{field.unit}</Badge>
                      </div>
                      <Input
                        type="number"
                        value={field.value}
                        onChange={(e) => field.setter(e.target.value)}
                        className="bg-transparent border-none text-xl font-bold text-white h-auto p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  ))}
                </div>
                {/* Table part remains same but inside this card */}
                <div className="overflow-x-auto -mx-6 sm:mx-0">
                  <div className="inline-block min-w-full align-middle">
                    <div className="overflow-hidden rounded-2xl border border-white/10">
                      <table className="min-w-full divide-y divide-white/5">
                        <thead>
                          <tr className="bg-white/5">
                            {['Day', 'Start', 'Lots', 'Margin', 'SL', 'Profit', 'End Cap (USD)', 'End Cap (INR)'].map((h) => (
                              <th key={h} className="px-4 py-4 text-left text-[10px] font-bold uppercase tracking-widest text-white/30">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 bg-transparent">
                          {compoundingData.map((row) => {
                            let rowClass = "";
                            if (row.milestone >= 3) rowClass = "milestone-green-active";
                            else if (row.milestone > 0) rowClass = "milestone-active";

                            return (
                              <tr key={row.day} className={`${rowClass} hover:bg-white/5 transition-colors group`}>
                                <td className="px-4 py-5 text-sm font-bold text-white/20">#{row.day}</td>
                                <td className="px-4 py-5 text-sm font-mono text-white/40">${row.startCap.toLocaleString()}</td>
                                <td className="px-4 py-5">
                                  <span className="inline-flex items-center justify-center bg-blue-500/10 text-blue-400 text-xs font-black px-2.5 py-1 rounded-lg ring-1 ring-blue-500/20">
                                    {row.lots}
                                  </span>
                                </td>
                                <td className="px-4 py-5 text-sm font-mono text-white/30">${row.marginTotal.toLocaleString()}</td>
                                <td className="px-4 py-5 text-sm text-white/30">{row.sl}</td>
                                <td className="px-4 py-5">
                                  <div className="flex flex-col">
                                    <span className="text-sm font-bold text-green-400">+${row.profit.toLocaleString()}</span>
                                    <span className="text-[10px] text-white/20 font-medium">Gain: {row.gain}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-5 text-sm font-black text-white">${row.endCapUSD.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="px-4 py-5 min-w-[240px]">
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                      {row.milestone > 0 && (
                                        <div className="bg-gradient-to-br from-[#bf953f] via-[#fcf6ba] to-[#aa771c] text-black font-black text-[9px] px-2 py-0.5 rounded-md shadow-md border border-[#aa771c]/30">
                                          M{row.milestone}
                                        </div>
                                      )}
                                      <span className={`font-black text-lg tracking-tight ${row.milestone > 0 ? 'text-green-400' : 'text-white'}`}>
                                        {row.endCapINR.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 })}
                                      </span>
                                    </div>
                                    <div className="scrolling-text-container h-4">
                                      <span className="scrolling-text-inner text-[9px] text-green-400/40 font-bold uppercase tracking-wider italic">
                                        {row.words} Rupees Only
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Growth Protocol Section */}
            <Card className="glass-card-3d border-white/10 bg-white/5 rounded-2xl overflow-hidden flex flex-col max-h-[400px]">
              <CardHeader className="border-b border-white/5 bg-white/5 sticky top-0 z-10">
                <CardTitle className="text-xl font-black tracking-tight metallic-gold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-amber-500" />
                  THE TREND ANALYZER GROWTH PROTOCOL
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
                {protocols.map((protocol) => (
                  <div key={protocol.id} className="space-y-4">
                    <h3 className="text-lg font-bold text-white">{protocol.title}</h3>
                    {protocol.imageUrl && (
                      <div className="relative h-48 overflow-hidden rounded-xl border border-white/10">
                        <img 
                          src={protocol.imageUrl} 
                          alt={protocol.title} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <p className="text-sm text-white/60 leading-relaxed">{protocol.content}</p>
                    <div className="w-full h-px bg-white/5 mt-4" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT SECTION (40%) - AI Intelligence */}
          <div className="lg:col-span-4 space-y-8">
            <Card className="glass-card-3d rounded-3xl overflow-hidden border-white/10 bg-white/5 flex flex-col h-[700px]">
              <CardHeader className="pb-4 border-b border-white/5 bg-white/5">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-black tracking-tight metallic-gold flex items-center gap-2">
                    <Bot className="w-5 h-5 text-blue-500" />
                    🤖 Trend Analyzer Intelligence
                  </CardTitle>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => {
                        setIsTtsEnabled(!isTtsEnabled);
                        if (isTtsEnabled) window.speechSynthesis.cancel();
                      }}
                      className={`p-1.5 rounded-lg transition-all ${isTtsEnabled ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40 hover:text-white/60'}`}
                      title={isTtsEnabled ? "Disable Voice" : "Enable Voice"}
                    >
                      {isTtsEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </button>
                    <div className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                      <span className="text-[9px] font-bold text-green-500 uppercase">AI Online</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-1">Your Personal Trading Copilot</p>
              </CardHeader>
              
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
                <AnimatePresence initial={false}>
                  {chatMessages.map((msg, idx) => (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      key={idx}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white rounded-tr-none' 
                          : 'bg-white/5 border border-white/10 text-white/90 rounded-tl-none'
                      }`}>
                        <div className="flex items-center gap-2 mb-1 opacity-50 text-[10px] font-bold uppercase">
                          {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                          {msg.role === 'user' ? 'You' : <span className="text-blue-500">Trend Analyzer intelligence</span>}
                          <span className="ml-auto">{msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className="whitespace-pre-wrap leading-relaxed">
                          {msg.role === 'model' ? (
                            <>
                              {msg.text.split('“This analysis')[0].split('\n').map((line, lIdx) => {
                                if (line.includes('Zone:')) {
                                  const isBullish = line.toLowerCase().includes('bullish') || 
                                                   (chatMessages[idx-1]?.text.toLowerCase().includes('bullish')) ||
                                                   (msg.text.toLowerCase().includes('bullish') && msg.text.indexOf('Bullish') < msg.text.indexOf(line));
                                  
                                  // Simple heuristic: if line before or current line has bullish, green. Else if bearish, red.
                                  const colorClass = line.toLowerCase().includes('bullish') ? 'text-green-500' : 
                                                    line.toLowerCase().includes('bearish') ? 'text-red-500' : 
                                                    'text-blue-400';

                                  return (
                                    <div key={lIdx}>
                                      {line.split('Zone:')[0]}
                                      <span className={colorClass}>Zone:</span>
                                      {line.split('Zone:')[1]}
                                    </div>
                                  );
                                }
                                return <div key={lIdx}>{line}</div>;
                              })}
                              {msg.text.includes('“This analysis') && (
                                <div className="mt-4 p-3 rounded-xl bg-orange-600/10 border border-orange-600/30 text-orange-500 text-[11px] font-black italic leading-snug shadow-[0_0_15px_rgba(255,165,0,0.1)]">
                                  “This analysis{msg.text.split('“This analysis')[1]}
                                </div>
                              )}
                            </>
                          ) : msg.text}
                        </div>
                        {msg.role === 'model' && msg.text.length > 50 && (
                          <div className="mt-3 pt-3 border-t border-white/5 flex gap-2">
                            <Button variant="ghost" className="h-7 px-2 text-[9px] font-bold uppercase text-blue-400 hover:text-blue-300 hover:bg-blue-500/10">
                              📌 Add to Chart
                            </Button>
                            <Button variant="ghost" className="h-7 px-2 text-[9px] font-bold uppercase text-amber-400 hover:text-amber-300 hover:bg-amber-500/10">
                              📊 Save Analysis
                            </Button>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isAiLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white/5 border border-white/10 p-3 rounded-2xl rounded-tl-none flex items-center gap-3">
                      <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce" />
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                      <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">Analyzing Market...</span>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </CardContent>

              <div className="p-4 bg-white/5 border-t border-white/5 space-y-3">
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    { label: 'Hidden Reversals', cmd: 'hidden reversals', icon: <ShieldAlert className="w-3 h-3" /> },
                    { label: 'Impact Levels', cmd: 'impact levels', icon: <Zap className="w-3 h-3" /> },
                    { label: 'Trend Check', cmd: 'What is the current trend?', icon: <TrendingUp className="w-3 h-3" /> }
                  ].map((s) => (
                    <button
                      key={s.cmd}
                      onClick={() => handleSendMessage(s.cmd, s.cmd.includes('reversals') || s.cmd.includes('impact'))}
                      className="whitespace-nowrap bg-white/5 border border-white/10 hover:bg-white/10 px-3 py-1.5 rounded-full text-[10px] font-bold text-white/60 hover:text-white transition-all flex items-center gap-1.5"
                    >
                      {s.icon}
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(chatInput)}
                    placeholder="Ask intelligence or select command..."
                    className="bg-white/5 border-white/10 text-white h-12 rounded-xl pr-12 focus:ring-blue-500/50"
                  />
                  <button 
                    onClick={() => handleSendMessage(chatInput)}
                    disabled={!chatInput.trim() || isAiLoading}
                    className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center justify-center transition-all disabled:opacity-50"
                  >
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <Select onValueChange={(val: string) => handleSendMessage(val, true)}>
                      <SelectTrigger className="h-6 bg-transparent border-none text-[9px] font-black uppercase text-white/40 hover:text-white/60 p-0 w-auto gap-1">
                        <SelectValue placeholder="⚡ Commands" />
                      </SelectTrigger>
                      <SelectContent className="bg-[#111] border-white/10 text-white">
                        <SelectItem value="hidden reversals" className="text-[10px] font-bold">Hidden Reversals</SelectItem>
                        <SelectItem value="impact levels" className="text-[10px] font-bold">Impact Levels</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="text-[9px] font-bold text-white/20 uppercase">Powered by Gemini AI</span>
                </div>
              </div>
            </Card>

            {/* Core Execution Guide Section */}
            <Card className="glass-card-3d border-white/10 bg-white/5 rounded-2xl overflow-hidden flex flex-col max-h-[400px]">
              <CardHeader className="border-b border-white/5 bg-white/5 sticky top-0 z-10">
                <CardTitle className="text-xl font-black tracking-tight metallic-gold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-500" />
                  CORE EXECUTION GUIDE
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-white/10">
                {guides.map((guide) => (
                  <div key={guide.id} className="space-y-4">
                    <h3 className="text-lg font-bold text-white">{guide.title}</h3>
                    {guide.imageUrl && (
                      <div className="relative h-48 overflow-hidden rounded-xl border border-white/10">
                        <img 
                          src={guide.imageUrl} 
                          alt={guide.title} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <p className="text-sm text-white/60 leading-relaxed">{guide.content}</p>
                    <div className="w-full h-px bg-white/5 mt-4" />
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )}
  </div>
</div>
  );
}
