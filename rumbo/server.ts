import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route: Mobility Estimates (Uber, Cabify, etc.)
  app.post("/api/estimates", async (req, res) => {
    const { start, end } = req.body;
    
    // In a real scenario, we would call Uber and Cabify APIs here using process.env.UBER_CLIENT_ID, etc.
    // For now, we simulate the comparison logic
    
    const estimates = [
      {
        provider: "Uber",
        type: "UberX",
        price: 4500,
        currency: "CLP",
        eta: 3,
        color: "#000000"
      },
      {
        provider: "Cabify",
        type: "Lite",
        price: 4200,
        currency: "CLP",
        eta: 5,
        color: "#7350FF"
      }
    ];

    // Sort by price to find the "Best Price"
    const bestPrice = [...estimates].sort((a, b) => a.price - b.price)[0];
    
    res.json({
      estimates,
      bestPriceProvider: bestPrice.provider,
      timestamp: new Date().toISOString()
    });
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
    console.log(`Rumbo Server running on http://localhost:${PORT}`);
  });
}

startServer();
