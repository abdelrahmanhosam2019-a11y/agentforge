# AgentForge 🤖

## AI-Powered Competitive Intelligence Platform

**Stop guessing. Start knowing.**

AgentForge is a cutting-edge competitive intelligence platform that deploys AI agents to monitor your competitors 24/7. Track pricing changes, feature launches, hiring trends, and market shifts automatically — so you can make smarter business decisions faster.

---

## 🎯 What is AgentForge?

AgentForge helps businesses stay ahead of their competition by:

- **Monitoring competitor websites** for changes in pricing, features, and content
- **Analyzing market trends** across your industry
- **Generating strategic insights** powered by AI
- **Delivering automated reports** so you never miss a critical update

Whether you're a startup competing against industry giants or an established business watching new entrants, AgentForge gives you the intelligence you need to win.

---

## ✨ Key Features

### 🤖 AI-Powered Agents
Create autonomous AI agents that work for you around the clock. Each agent can monitor multiple competitors simultaneously, tracking everything from pricing pages to blog posts to job listings.

### 📊 Smart Reports
Get comprehensive reports with actionable insights. Our AI analyzes competitor data and identifies opportunities, threats, and trends that matter to your business.

### ⚡ Real-Time Monitoring
Don't wait for weekly reports. AgentForge monitors your competitors in real-time and alerts you the moment something changes.

### 🔒 Enterprise-Grade Security
Your data is protected with bank-level security. We use Supabase for authentication and database management, ensuring your competitive intelligence stays private and secure.

### 🌙 Dark Mode
Easy on the eyes, day or night. Switch between light and dark themes for comfortable viewing in any environment.

### 📱 Responsive Design
Access your competitive intelligence from anywhere. AgentForge works perfectly on desktop, tablet, and mobile devices.

### 🚀 One-Click Deployment
Get started in minutes. Deploy to Vercel with a single click and start monitoring your competitors today.

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js + @supabase/server |
| **Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth |
| **Frontend** | Vanilla JavaScript |
| **Styling** | Tailwind CSS |
| **Deployment** | Vercel |

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- A Supabase account (free tier available)
- A GitHub account (for deployment)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/agentforge.git
   cd agentforge
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your Supabase credentials:
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
   SUPABASE_SECRET_KEY=sb_secret_xxx
   SUPABASE_JWKS_URL=https://your-project.supabase.co/auth/v1/.well-known/jwks.json
   ```

4. **Set up the database**
   - Go to your Supabase Dashboard → SQL Editor
   - Paste the contents of `schema.sql`
   - Click "Run"

5. **Start the server**
   ```bash
   node server.js
   ```

6. **Open your browser**
   ```
   http://localhost:3000
   ```

---

## 🌐 Deploy to Vercel

### Option 1: One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/your-username/agentforge)

### Option 2: Manual Deploy

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Click "Import Project"
4. Select your GitHub repository
5. Add environment variables
6. Click "Deploy"

---

## 📚 API Documentation

### Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create a new account |
| `POST` | `/api/auth/login` | Sign in to your account |
| `POST` | `/api/auth/logout` | Sign out |
| `GET` | `/api/auth/me` | Get current user |

### Agent Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List all agents |
| `POST` | `/api/agents` | Create a new agent |
| `DELETE` | `/api/agents/:id` | Delete an agent |
| `POST` | `/api/agents/:id/run` | Run an agent |

### Report Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/reports` | List all reports |
| `GET` | `/api/reports/:id` | Get a specific report |

---

## 🗄️ Database Schema

### Tables

- **users** - User accounts (managed by Supabase Auth)
- **agents** - AI monitoring agents
- **reports** - Generated intelligence reports
- **subscriptions** - User subscription plans

### Key Features

- Row Level Security (RLS) ensures users can only access their own data
- Automatic UUID generation for all records
- Cascading deletes for data integrity
- Optimized indexes for fast queries

---

## 🔐 Security

- All API endpoints are protected with JWT authentication
- Row Level Security (RLS) enforced at the database level
- Secrets never committed to version control
- Environment variables for sensitive configuration

---

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- [Supabase](https://supabase.com) - Backend infrastructure
- [@supabase/server](https://github.com/supabase/server) - Server-side authentication
- [Tailwind CSS](https://tailwindcss.com) - UI styling
- [Vercel](https://vercel.com) - Deployment platform

---

## 📧 Contact

**Abdelrahman Hossam** - abdelrahmanhosam2019@gmail.com

Project Link: [https://github.com/your-username/agentforge](https://github.com/your-username/agentforge)

---

⭐ Star this repo if you find it useful!
