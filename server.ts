import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new (YahooFinance as any)({ suppressNotices: ['yahooSurvey'] });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Simple in-memory storage for demo (would use a file or DB in production)
  // In this environment, we can use a global variable or a file.
  // Let's use a simple object for now.
  // Admin settings (in-memory for now)
  let adminSettings = {
    subscriptionPrice: 999,
    trialDays: 3,
    isTrialEnabled: true
  };

  let guides: any[] = [
    { 
      id: '1', 
      title: 'Welcome to Trend Analyzer', 
      content: 'Learn how to use our advanced reversal zones and market swing analysis to improve your trading execution.',
      imageUrl: 'https://picsum.photos/seed/trading/800/400'
    }
  ];

  let protocols: any[] = [
    {
      id: '1',
      title: 'Phase 1: Foundation',
      content: 'Establish your risk management rules and stick to the daily loss limit.',
      imageUrl: ''
    }
  ];

  const users: any[] = [
    { id: '1', phone: 'admin', password: 'password', isAdmin: true, trialUsed: true, subscriptionActive: true, expiryDate: null }
  ];

  // API Routes
  app.get("/api/admin/settings", (req, res) => {
    res.json(adminSettings);
  });

  app.post("/api/admin/settings", (req, res) => {
    adminSettings = { ...adminSettings, ...req.body };
    res.json({ success: true, settings: adminSettings });
  });

  app.get("/api/guides", (req, res) => {
    res.json(guides);
  });

  app.post("/api/admin/guides", (req, res) => {
    const { title, content, imageUrl } = req.body;
    const newGuide = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      content,
      imageUrl
    };
    guides.push(newGuide);
    res.json(newGuide);
  });

  app.put("/api/admin/guides/:id", (req, res) => {
    const index = guides.findIndex(g => g.id === req.params.id);
    if (index !== -1) {
      guides[index] = { ...guides[index], ...req.body };
      res.json(guides[index]);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.delete("/api/admin/guides/:id", (req, res) => {
    guides = guides.filter(g => g.id !== req.params.id);
    res.json({ success: true });
  });

  app.get("/api/protocols", (req, res) => {
    res.json(protocols);
  });

  app.post("/api/admin/protocols", (req, res) => {
    const { title, content, imageUrl } = req.body;
    const newProtocol = {
      id: Math.random().toString(36).substr(2, 9),
      title,
      content,
      imageUrl
    };
    protocols.push(newProtocol);
    res.json(newProtocol);
  });

  app.put("/api/admin/protocols/:id", (req, res) => {
    const index = protocols.findIndex(p => p.id === req.params.id);
    if (index !== -1) {
      protocols[index] = { ...protocols[index], ...req.body };
      res.json(protocols[index]);
    } else {
      res.status(404).json({ error: "Not found" });
    }
  });

  app.delete("/api/admin/protocols/:id", (req, res) => {
    protocols = protocols.filter(p => p.id !== req.params.id);
    res.json({ success: true });
  });

  app.post("/api/auth/register", (req, res) => {
    const { phone, password } = req.body;
    const existingUser = users.find(u => u.phone === phone);
    if (existingUser) {
      return res.status(400).json({ error: "User already exists" });
    }
    
    const newUser = {
      id: Math.random().toString(36).substr(2, 9),
      phone,
      password,
      isAdmin: false,
      trialUsed: adminSettings.isTrialEnabled,
      trialStartDate: new Date().toISOString(),
      subscriptionActive: adminSettings.isTrialEnabled,
      expiryDate: adminSettings.isTrialEnabled 
        ? new Date(Date.now() + adminSettings.trialDays * 24 * 60 * 60 * 1000).toISOString() 
        : new Date().toISOString()
    };
    users.push(newUser);
    res.json({ user: newUser });
  });

  app.post("/api/auth/login", (req, res) => {
    const { phone, password } = req.body;
    
    // Admin check
    if (phone === 'trend@dmca.com' && password === 'Dmca@75328') {
      return res.json({ user: { id: 'admin', phone: 'trend@dmca.com', isAdmin: true, subscriptionActive: true } });
    }

    const user = users.find(u => u.phone === phone && u.password === password);
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Check trial expiry
    const now = new Date();
    const expiry = new Date(user.expiryDate);
    if (now > expiry && !user.isAdmin) {
      user.subscriptionActive = false;
    }

    res.json({ user });
  });

  app.get("/api/admin/users", (req, res) => {
    // In a real app, check admin token
    res.json(users);
  });

  app.post("/api/admin/update-subscription", (req, res) => {
    const { userId, active, days } = req.body;
    const user = users.find(u => u.id === userId);
    if (user) {
      user.subscriptionActive = active;
      if (days) {
        user.expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      }
    }
    res.json({ success: true });
  });

  app.get("/api/market-data", async (req, res) => {
    console.log("Fetching market ticker data...");
    try {
      const symbols = ['^NSEI', '^NSEBANK', '^BSESN', 'BTC-USD', 'GC=F', 'CL=F', 'ETH-USD'];
      
      // Attempt to fetch with a timeout
      const fetchWithTimeout = async (symbol: string) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          const quote: any = await yahooFinance.quote(symbol, {}, { fetchOptions: { signal: controller.signal } } as any);
          return {
            symbol: symbol === '^NSEI' ? 'NIFTY' : 
                    symbol === '^NSEBANK' ? 'BANKNIFTY' : 
                    symbol === '^BSESN' ? 'SENSEX' : 
                    symbol === 'BTC-USD' ? 'BTC' : 
                    symbol === 'GC=F' ? 'GOLD' : 
                    symbol === 'CL=F' ? 'CRUDE' : 
                    symbol === 'ETH-USD' ? 'ETH' : symbol,
            price: quote.regularMarketPrice || quote.price,
            change: quote.regularMarketChangePercent || 0,
          };
        } catch (e) {
          console.error(`Error fetching ticker for ${symbol}:`, e instanceof Error ? e.message : e);
          return null;
        } finally {
          clearTimeout(timeout);
        }
      };

      const results = [];
      for (const symbol of symbols) {
        const res = await fetchWithTimeout(symbol);
        if (res) results.push(res);
        // Small delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      if (results.length === 0) {
        throw new Error("All symbol fetches failed");
      }

      res.json(results);
    } catch (error) {
      console.error("Market data fetch error:", error);
      res.status(500).json({ 
        error: "Failed to fetch market data",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  app.get("/api/instrument-open/:symbol", async (req, res) => {
    const { symbol } = req.params;
    let yahooSymbol = symbol;
    
    // Map common names to Yahoo symbols
    const mapping: Record<string, string> = {
      'NIFTY': '^NSEI',
      'BANKNIFTY': '^NSEBANK',
      'FINNIFTY': 'NIFTY_FIN_SERVICE.NS',
      'SENSEX': '^BSESN',
      'BTC': 'BTC-USD',
      'XAUUSD': 'GC=F',
      'ETH': 'ETH-USD',
      'CRUDE': 'CL=F',
      'SILVER': 'SI=F'
    };

    if (mapping[symbol]) {
      yahooSymbol = mapping[symbol];
    }

    try {
      console.log(`Fetching price for: ${yahooSymbol}`);
      const quote: any = await yahooFinance.quote(yahooSymbol);
      // For levels panel, we strictly need the current day opening price
      const openPrice = quote.regularMarketOpen || quote.price;
      
      if (!openPrice) {
        console.error(`No price found for ${yahooSymbol}`, quote);
        return res.status(404).json({ error: "Price not found" });
      }

      console.log(`Found opening price for ${yahooSymbol}: ${openPrice}`);
      res.json({ 
        symbol, 
        open: openPrice 
      });
    } catch (error) {
      console.error(`Error fetching ${yahooSymbol}:`, error);
      res.status(500).json({ error: "Failed to fetch opening price" });
    }
  });

  app.get("/api/live-price/:symbol", async (req, res) => {
    const { symbol } = req.params;
    let yahooSymbol = symbol;
    
    const mapping: Record<string, string> = {
      'NIFTY': '^NSEI',
      'BANKNIFTY': '^NSEBANK',
      'FINNIFTY': 'NIFTY_FIN_SERVICE.NS',
      'SENSEX': '^BSESN',
      'BTC': 'BTC-USD',
      'XAUUSD': 'GC=F',
      'ETH': 'ETH-USD',
      'CRUDE': 'CL=F',
      'SILVER': 'SI=F'
    };

    if (mapping[symbol]) {
      yahooSymbol = mapping[symbol];
    }

    try {
      const quote: any = await yahooFinance.quote(yahooSymbol);
      const livePrice = quote.regularMarketPrice || quote.price;
      
      res.json({ 
        symbol, 
        price: livePrice 
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch live price" });
    }
  });

  app.get("/api/technical-analysis/:symbol", async (req, res) => {
    const { symbol } = req.params;
    let yahooSymbol = symbol;
    
    const mapping: Record<string, string> = {
      'NIFTY': '^NSEI',
      'BANKNIFTY': '^NSEBANK',
      'FINNIFTY': 'NIFTY_FIN_SERVICE.NS',
      'SENSEX': '^BSESN',
      'BTC': 'BTC-USD',
      'XAUUSD': 'GC=F',
      'ETH': 'ETH-USD',
      'CRUDE': 'CL=F',
      'SILVER': 'SI=F'
    };

    if (mapping[symbol]) {
      yahooSymbol = mapping[symbol];
    }

    try {
      console.log(`Fetching technical data for: ${yahooSymbol}`);
      
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - 3); // Last 3 days for 15m data

      // Use 15m interval for better ICT/FVG accuracy
      const result = await yahooFinance.chart(yahooSymbol, {
        period1: startDate,
        period2: endDate,
        interval: '15m'
      });

      const history = result.quotes.map((q: any) => ({
        date: q.date,
        open: q.open,
        high: q.high,
        low: q.low,
        close: q.close,
        volume: q.volume
      })).filter((q: any) => q.open !== null);
      
      res.json({ 
        symbol, 
        history: history.slice(-50) // Last 50 candles of 15m data
      });
    } catch (error) {
      console.error(`Error fetching technical for ${yahooSymbol}:`, error);
      res.status(500).json({ error: "Failed to fetch technical data" });
    }
  });
  
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
