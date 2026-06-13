/**
 * Baileys Engine Plugin for OpenWA
 *
 * Registers the BaileysAdapter as an engine plugin. Activated when
 * ENGINE_TYPE=baileys in the environment.
 *
 * Baileys (@whiskeysockets/baileys) is a pure-WebSocket WhatsApp client
 * library — no browser, no Puppeteer, no anti-bot detection. It
 * implements the same multidevice protocol that the official WA
 * desktop/web clients use, but talks directly to WhatsApp servers.
 *
 * This means: from datacenter IPs (Render, Railway, AWS), Baileys
 * connects without the "Chrome 85+" page that browser-based libraries
 * hit. The QR code shows up reliably.
 */

import { PluginContext, PluginType, IEnginePlugin } from '../../../core/plugins';
import { IWhatsAppEngine } from '../../../engine/interfaces/whatsapp-engine.interface';
import { BaileysAdapter } from '../../../engine/adapters/baileys.adapter';

export interface BaileysPluginConfig {
  sessionDataPath?: string;
  printQRInTerminal?: boolean;
}

export class BaileysPlugin implements IEnginePlugin {
  type = PluginType.ENGINE as const;
  private context?: PluginContext;

  onLoad(context: PluginContext): Promise<void> {
    this.context = context;
    context.logger.log('Baileys engine plugin loaded');
    return Promise.resolve();
  }

  onEnable(context: PluginContext): Promise<void> {
    context.logger.log('Baileys engine plugin enabled');
    return Promise.resolve();
  }

  onDisable(context: PluginContext): Promise<void> {
    context.logger.log('Baileys engine plugin disabled');
    return Promise.resolve();
  }

  createEngine(config: Record<string, unknown>): IWhatsAppEngine {
    const sessionId = config.sessionId as string;
    const sessionDataPath = (this.context?.config.sessionDataPath as string) ?? './data/sessions';
    const printQRInTerminal = (this.context?.config.printQRInTerminal as boolean) ?? true;

    return new BaileysAdapter({
      sessionId,
      sessionDataPath,
      printQRInTerminal,
    });
  }

  getFeatures(): string[] {
    return [
      'text-messages',
      'media-messages',
      'group-management',
      'message-replies',
      'contact-check',
      'no-browser-required',
    ];
  }

  healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    return Promise.resolve({
      healthy: true,
      message: 'Baileys engine (no browser, WebSocket) is available',
    });
  }
}

export default BaileysPlugin;
