/**
 * It's A Simple Job - Master Client Bundle Entry Point
 * Bundles stylesheets and core service modules via Vite.
 */

// Global styles
import '../css/style.css';

// Core Service & Application Modules (loaded in deterministic order)
import './firebase-service.js';
import './stripe-service.js';
import './imgbb-service.js';
import './providers-data.js';
import './ai-engine.js';
import './app.js';
