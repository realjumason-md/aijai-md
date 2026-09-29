#!/bin/bash
# aijai-md Railway deploy helper
# Usage: bash <(curl -s https://raw.githubusercontent.com/realjumason-md/aijai-md/main/lib/railway.sh)

set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════╗"
echo "║       aijai-md Railway Deployer       ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Install railway CLI if not present
if ! command -v railway &>/dev/null; then
    echo -e "${YELLOW}📦 Installing Railway CLI...${NC}"
    curl -fsSL https://railway.app/install.sh | sh
    export PATH="$HOME/.railway/bin:$PATH"
fi

# Check login
if ! railway whoami &>/dev/null; then
    echo -e "${YELLOW}🔑 Please login to Railway:${NC}"
    railway login
fi

echo ""
echo -e "${BOLD}📋 Enter your bot details:${NC}"
echo ""

read -r -p "${CYAN}Session ID (optional when restoring from persistent storage): ${NC}" SESSION_ID

read -r -p "${CYAN}Owner WhatsApp number (e.g. 256706106326): ${NC}" OWNER_NUMBER
OWNER_NUMBER=${OWNER_NUMBER:-256706106326}

read -r -p "${CYAN}Bot name (default: aijai-md): ${NC}" BOT_NAME
BOT_NAME=${BOT_NAME:-aijai-md}

read -r -p "${CYAN}MongoDB URL (recommended, press Enter to skip): ${NC}" MONGO_URL

read -r -p "${CYAN}Timezone (default: Africa/Kampala): ${NC}" TIMEZONE
TIMEZONE=${TIMEZONE:-Africa/Kampala}

read -r -s -p "${CYAN}Groq API key (leave blank to add it later in Railway): ${NC}" GROQ_API_KEY
echo

echo ""
echo -e "${YELLOW}🚀 Starting deployment...${NC}"
echo ""

# Clone if not in repo
if [ ! -f "railway.json" ]; then
    echo -e "${YELLOW}📦 Cloning aijai-md repo...${NC}"
    git clone https://github.com/realjumason-md/aijai-md aijai-md-deploy
    cd aijai-md-deploy
fi

# Init railway project
echo -e "${YELLOW}📱 Creating Railway project...${NC}"
railway init --name "mega-md-bot"

# Set environment variables
echo -e "${YELLOW}⚙️ Setting environment variables...${NC}"
railway variables set \
    SESSION_ID="$SESSION_ID" \
    OWNER_NUMBER="$OWNER_NUMBER" \
    BOT_NAME="$BOT_NAME" \
    TIMEZONE="$TIMEZONE" \
    AI_PROVIDER="groq" \
    COMMAND_MODE="public"

[ -n "$MONGO_URL" ] && railway variables set MONGO_URL="$MONGO_URL"
[ -n "$GROQ_API_KEY" ] && railway variables set GROQ_API_KEY="$GROQ_API_KEY"

# Deploy
echo -e "${YELLOW}📤 Deploying to Railway (this may take 3-5 minutes)...${NC}"
railway up --detach

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
echo -e "${GREEN}║        ✅ Deployment Complete!        ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
echo ""
echo -e "${BOLD}Logs:${NC}    railway logs"
echo -e "${BOLD}Status:${NC}  railway status"
echo -e "${BOLD}Open:${NC}    railway open"
echo ""
echo -e "${CYAN}📱 Scan QR or use Session ID to connect your WhatsApp!${NC}"
