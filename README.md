# MAHARAJA AI DIWALI EXPERIENCE
**Client**: Maharaja Ready-Made Store  
**Location**: Thanjavur, Tamil Nadu, India  

---

## 🌟 Overview

A luxury retail AI experience designed for Maharaja Ready-Made Store's Diwali campaign. Customers making an eligible purchase (₹5,000+) are featured in a personalized AI fashion film.

Store staff use a mobile phone (`/create`) to scan the purchased garment and photograph the customer. The system analyzes both using Google Gemini, synthesizes a 9:16 photorealistic Master Reference Image, and generates an 8-second vertical video featuring a Tamil Diwali greeting (*"இனிய தீபாவளி நல்வாழ்த்துக்கள்!"*). 

With customer display consent, tapping **GO LIVE** broadcasts the completed video onto Maharaja's main in-store TV signage (`/tv`).

---

## 🚀 Key Routes

- `/` — **Client Landing Page**: Campaign proposition, visual journey steps, branding.
- `/create` — **Mobile Operator Application**: HUD visual scanner, garment analysis, person verification, master image approval, and video generation.
- `/result/[sessionId]` — **Customer Result Page**: 9:16 vertical video preview, direct MP4 download (`Maharaja-Diwali-[sessionId].mp4`), public display consent, and **GO LIVE** trigger.
- `/tv` — **In-Store Digital Signage Player**: Setup PIN pairing (`482731`), persistent device token, audio autoplay unlock, 16:9 shell with 9:16 video player, and idle advertisement loop.
- `/admin` — **Store Control Panel**: Display pairing status, active queue monitor, single-click **"GO LIVE WITH SAMPLE VIDEO"** prototype verification button.

---

## ⚙️ Environment Configuration (`.env.local`)

```bash
# Firebase Admin Credentials (Server-side only)
FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="your-client-email"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_STORAGE_BUCKET="your-bucket.appspot.com"

# TV Display Pairing
TV_SETUP_PIN="482731"

# Configurable Google AI Models
GEMINI_ANALYSIS_MODEL="gemini-2.5-flash"
GEMINI_IMAGE_MODEL="gemini-3.1-flash-image"
GOOGLE_AI_API_KEY_PRIMARY="your-google-ai-api-key"
FAL_KEY="your-fal-api-key"

# Demo Mode (Enables graceful fallback to sample video)
DEMO_MODE="true"
```

---

## 🧪 Running Locally & Testing Go Live

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```

3. **Test In-Store Go Live Broadcast**:
   - Open **TV Display**: [http://localhost:3000/tv](http://localhost:3000/tv)
     - Enter Setup PIN: `482731`
     - Click **"START MAHARAJA SCREEN"**
   - Open **Admin Dashboard** in a second window: [http://localhost:3000/admin](http://localhost:3000/admin)
     - Click **"GO LIVE WITH SAMPLE VIDEO"**
   - The TV display will detect the queued video within 2 seconds, play the sample video with audio inside the 16:9 branded shell, report completion, and return to the Maharaja idle advertisement loop.

4. **Production Build Verification**:
   ```bash
   npm run build
   ```
