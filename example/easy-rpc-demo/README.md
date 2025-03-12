# Easy RPC Demo

This is a demo project showcasing how to use the `easy-rpc` library to generate type-safe RPC clients and routers.

## Setup

```bash
# Install dependencies
pnpm install

# Run the demo
pnpm dev
```

## Project Structure

- `src/api/` - Contains API endpoint definitions
- `src/generated/` - Contains generated RPC client and router code
- `src/index.ts` - Main entry point that runs the code generation

## How it Works

1. Define your API endpoints in the `src/api/` directory
2. Run the code generation using `easy-rpc`
3. The library will generate a type-safe client and router based on your API definitions
