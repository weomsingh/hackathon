# Nexus Analyzer Pro — Multi-Format Forensics Engine

## Overview
Nexus Analyzer Pro is an advanced, browser-based forensic visualization tool designed to analyze both financial transaction networks and software code structures. 

## Key Features
- **Dual Mode Analysis**:
  - **Financial Forensics**: Detects Money Muling, Smurfing, and Laundering Rings from CSV data.
  - **Code Structural Analysis**: Visualizes syntax token relationships in source code (Java, C, Python, etc.) to identify complexity and coupling.
- **Sci-Fi Visualization**: High-performance D3.js rendering with a futuristic neon aesthetic.
- **Privacy First**: 100% Client-side processing. No data leaves your browser.

## Tech Stack
- **Core**: HTML5, CSS3 (Neon UI), Vanilla JavaScript
- **Visualization**: D3.js v7
- **Data Parsing**: PapaParse (CSV) + Custom Regex Tokenizer (Code)

## Supported Formats
1. **Financial Data (.csv)**:
   - Columns: `transaction_id`, `sender_id`, `receiver_id`, `amount`, `timestamp`
2. **Source Code**:
   - `.java`, `.c`, `.cpp`, `.h`, `.html`, `.css`, `.js`, `.py`, `.ts`, `.json`, `.xml`

## Usage
1. Open `index.html` in a modern browser.
2. Click **Initialize Upload**.
3. Select a file. The engine automatically detects the mode:
   - **CSV** -> Triggers Financial Fraud Detection.
   - **Code** -> Triggers Syntax Neural Map generation.
4. View the instant static graph network.

## Visualization Guide
- **Cyan Nodes**: Standard Accounts / Syntax Tokens.
- **Yellow Nodes**: Suspicious Accounts.
- **Purple Nodes/Links**: Confirmed Fraud Rings / High Coupling Clusters.

## Deployment
Drag `index.html` to [Netlify Drop](https://app.netlify.com/drop) for instant hosting.
