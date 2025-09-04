#!/bin/bash

echo "🚀 OpenAI Codex CLI Installation Script"
echo "======================================="

# Detect OS
OS=""
ARCH=""

if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="darwin"
    if [[ $(uname -m) == "arm64" ]]; then
        ARCH="aarch64"
        echo "✅ Detected: macOS Apple Silicon (M1/M2/M3)"
    else
        ARCH="x86_64"
        echo "✅ Detected: macOS Intel"
    fi
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux-musl"
    if [[ $(uname -m) == "aarch64" ]]; then
        ARCH="aarch64"
        echo "✅ Detected: Linux ARM64"
    else
        ARCH="x86_64"
        echo "✅ Detected: Linux x86_64"
    fi
else
    echo "❌ Unsupported OS: $OSTYPE"
    exit 1
fi

# Check if codex is already installed
if command -v codex &> /dev/null; then
    echo "✅ Codex CLI is already installed"
    codex --version
    exit 0
fi

echo ""
echo "Choose installation method:"
echo "1) npm (recommended)"
echo "2) Homebrew (macOS only)"
echo "3) Download binary from GitHub"
read -p "Select option (1-3): " choice

case $choice in
    1)
        echo "Installing via npm..."
        npm install -g @openai/codex
        ;;
    2)
        if [[ "$OS" != "darwin" ]]; then
            echo "❌ Homebrew is only available on macOS"
            exit 1
        fi
        echo "Installing via Homebrew..."
        brew install codex
        ;;
    3)
        echo "Downloading binary from GitHub..."
        BINARY_NAME="codex-${ARCH}-${OS}.tar.gz"
        if [[ "$OS" == "darwin" ]]; then
            BINARY_NAME="codex-${ARCH}-apple-${OS}.tar.gz"
        else
            BINARY_NAME="codex-${ARCH}-unknown-${OS}.tar.gz"
        fi
        
        echo "📥 Downloading $BINARY_NAME..."
        curl -L -o /tmp/codex.tar.gz \
            "https://github.com/openai/codex/releases/latest/download/${BINARY_NAME}"
        
        echo "📦 Extracting..."
        tar -xzf /tmp/codex.tar.gz -C /tmp/
        
        echo "📁 Installing to /usr/local/bin..."
        sudo mv /tmp/codex-* /usr/local/bin/codex
        sudo chmod +x /usr/local/bin/codex
        
        echo "🧹 Cleaning up..."
        rm /tmp/codex.tar.gz
        ;;
    *)
        echo "❌ Invalid option"
        exit 1
        ;;
esac

# Verify installation
if command -v codex &> /dev/null; then
    echo ""
    echo "✅ Codex CLI installed successfully!"
    codex --version
    echo ""
    echo "Next steps:"
    echo "1. Run 'codex' to sign in with your ChatGPT account"
    echo "2. Configure Zed with USE_CODEX_CLI=true"
else
    echo "❌ Installation failed. Please try manual installation."
    exit 1
fi
