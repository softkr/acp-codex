# Development Guide

## Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended) or npm
- OpenAI Codex CLI (for CLI mode testing)
- OpenAI API Key (for API mode testing)

## Getting Started

### 1. Clone and Install

```bash
git clone https://github.com/softkr/acp-codex.git
cd acp-codex
pnpm install
```

### 2. Environment Setup

The project uses `dotenv` to automatically load environment variables from `.env` files during development.

```bash
# Copy the example configuration
cp .env.example .env

# Edit .env to configure your environment
# For Codex CLI mode (recommended):
#   USE_CODEX_CLI=true
#
# For OpenAI API mode:
#   USE_CODEX_CLI=false
#   OPENAI_API_KEY=sk-your-key
```

### 3. Build and Run

```bash
# Development mode with hot reload
pnpm run dev

# Production build
pnpm run build
pnpm start

# Run tests
pnpm run test
pnpm run test:coverage

# Full validation
pnpm run validate
```

## Working with Different Modes

### Codex CLI Mode (Proto Mode)

This is the recommended mode that uses the local Codex CLI via proto mode.

**Requirements:**
- Codex CLI installed (`npm install -g @openai/codex`)
- Version 0.29.0 or later (check with `codex --version`)

**Configuration (.env):**
```env
USE_CODEX_CLI=true
# Optional: specify path if not in PATH
# CODEX_CLI_PATH=/opt/homebrew/bin/codex
```

**Key Points:**
- Uses `proto` mode for stdin/stdout communication
- No API key required
- Automatically detects Codex CLI installation
- ⚠️ Do NOT use `--json` flag (deprecated)

### OpenAI API Mode

Fallback mode that makes direct API calls to OpenAI.

**Requirements:**
- Valid OpenAI API key

**Configuration (.env):**
```env
USE_CODEX_CLI=false
OPENAI_API_KEY=sk-your-api-key-here
CODEX_MODEL=gpt-5
CODEX_TEMPERATURE=0.1
CODEX_MAX_TOKENS=2000
```

### Switching Between Modes

```bash
# Quick switch to CLI mode
sed -i '' 's/USE_CODEX_CLI=false/USE_CODEX_CLI=true/' .env

# Quick switch to API mode
sed -i '' 's/USE_CODEX_CLI=true/USE_CODEX_CLI=false/' .env

# Verify current mode
grep USE_CODEX_CLI .env
```

## Debugging

### Enable Debug Logging

```bash
# Via environment variable
ACP_DEBUG=true pnpm run dev

# Or in .env file
echo "ACP_DEBUG=true" >> .env
```

### Log to File

```bash
# In .env
ACP_LOG_FILE=./logs/acp-codex.log
```

### Common Debug Commands

```bash
# Check Codex CLI installation
which codex
codex --version

# Run diagnostics
pnpm run diagnose

# Test with verbose output
ACP_DEBUG=true pnpm run dev 2>&1 | tee debug.log
```

## Project Structure

```
acp-codex/
├── src/
│   ├── cli.ts              # CLI entry point (loads dotenv)
│   ├── index.ts            # Main application logic
│   ├── v2/
│   │   ├── agent/
│   │   │   ├── codex-client.ts     # OpenAI API client
│   │   │   ├── codex-cli-client.ts # Codex CLI proto mode
│   │   │   └── orchestrator.ts     # Mode switching logic
│   │   ├── protocol/       # ACP protocol implementation
│   │   ├── permissions/    # Permission system
│   │   └── logger.js       # Structured logging
│   └── diagnostics.ts      # System compatibility checks
├── dist/                   # Compiled JavaScript (gitignored)
├── test/                   # Test files
├── .env                    # Local environment (gitignored)
├── .env.example           # Environment template
└── package.json           # Dependencies and scripts
```

## Testing

### Run All Tests

```bash
pnpm run test
```

### Run with Coverage

```bash
pnpm run test:coverage
```

### Test Specific Mode

```bash
# Test CLI mode
USE_CODEX_CLI=true pnpm run test

# Test API mode (requires API key)
USE_CODEX_CLI=false OPENAI_API_KEY=sk-test pnpm run test
```

## Security Best Practices

1. **Never commit secrets:**
   - `.env` is gitignored
   - Use `.env.example` for templates
   - Never log API keys

2. **Environment-specific configs:**
   ```bash
   # Development
   cp .env.development .env
   
   # Production (use environment variables)
   export USE_CODEX_CLI=true
   export ACP_PERMISSION_MODE=acceptEdits
   ```

3. **API Key Management:**
   - Store keys in secure vaults in production
   - Use read-only keys when possible
   - Rotate keys regularly

## Troubleshooting Development Issues

### Server Shuts Down Unexpectedly

```bash
# Check for proto mode (not --json)
grep "proto" src/v2/agent/codex-cli-client.ts

# Verify dotenv is loaded
grep "dotenv/config" src/cli.ts

# Check environment
cat .env | grep USE_CODEX_CLI
```

### Module Not Found Errors

```bash
# Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install
pnpm run build
```

### Codex CLI Connection Issues

```bash
# Test Codex CLI directly
echo "test" | codex proto

# Check process
ps aux | grep codex
```

## Release Process

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Build and test:
   ```bash
   pnpm run validate
   pnpm run build
   ```
4. Commit and tag:
   ```bash
   git add -A
   git commit -m "chore: release v0.x.x"
   git tag v0.x.x
   git push origin main --tags
   ```
5. Publish to npm:
   ```bash
   pnpm publish
   ```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run validation: `pnpm run validate`
6. Submit a pull request

## Support

- GitHub Issues: https://github.com/softkr/acp-codex/issues
- Documentation: https://github.com/softkr/acp-codex#readme
