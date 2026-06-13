// PATCH for src/engine/engine.factory.ts
// Adds Baileys as a built-in engine plugin. Original is:
//
//   import { WhatsAppWebJsPlugin } from '../plugins/engines/whatsapp-web-js';
//   ...
//   const wwjsPlugin = new WhatsAppWebJsPlugin();
//   this.pluginLoader.registerBuiltInPlugin(wwjsManifest, wwjsPlugin);
//
// We add the Baileys plugin and an env-driven branch in onModuleInit.

import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IWhatsAppEngine } from './interfaces/whatsapp-engine.interface';
import { WhatsAppWebJsAdapter } from './adapters/whatsapp-web-js.adapter';
import { BaileysAdapter } from './adapters/baileys.adapter'; // PATCHED
import { PluginLoaderService, PluginType, IEnginePlugin, PluginManifest } from '../core/plugins';
import { WhatsAppWebJsPlugin } from '../plugins/engines/whatsapp-web-js';
import { BaileysPlugin } from '../plugins/engines/baileys'; // PATCHED
import { createLogger } from '../common/services/logger.service';

export interface EngineCreateOptions {
  sessionId: string;
  proxyUrl?: string;
  proxyType?: 'http' | 'https' | 'socks4' | 'socks5';
}

@Injectable()
export class EngineFactory implements OnModuleInit {
  private readonly logger = createLogger('EngineFactory');
  private readonly engineType: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly pluginLoader: PluginLoaderService,
  ) {
    this.engineType = this.configService.get<string>('engine.type') ?? 'whatsapp-web.js';
  }

  async onModuleInit(): Promise<void> {
    await this.registerBuiltInEngines();
  }

  private async registerBuiltInEngines(): Promise<void> {
    // Register WhatsApp-web.js as built-in plugin
    const wwjsManifest: PluginManifest = {
      id: 'whatsapp-web.js',
      name: 'WhatsApp Web.js Engine',
      version: '1.0.0',
      type: PluginType.ENGINE,
      description: 'Official WhatsApp-web.js engine adapter',
      main: 'index.ts',
      provides: ['whatsapp-engine'],
    };
    this.pluginLoader.registerBuiltInPlugin(wwjsManifest, new WhatsAppWebJsPlugin());

    // PATCHED: Register Baileys as built-in plugin
    const baileysManifest: PluginManifest = {
      id: 'baileys',
      name: 'Baileys Engine (no browser)',
      version: '1.0.0',
      type: PluginType.ENGINE,
      description: 'Pure WebSocket WhatsApp client — works from datacenter IPs',
      main: 'index.ts',
      provides: ['whatsapp-engine'],
    };
    this.pluginLoader.registerBuiltInPlugin(baileysManifest, new BaileysPlugin());

    // Auto-enable the configured engine
    try {
      await this.pluginLoader.enablePlugin(this.engineType);
      this.logger.log(`Engine plugin enabled: ${this.engineType}`);
    } catch (error) {
      this.logger.error(
        `Failed to enable engine plugin: ${this.engineType}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  create(options: EngineCreateOptions): IWhatsAppEngine {
    const enginePlugin = this.pluginLoader.getPlugin(this.engineType);
    if (enginePlugin?.instance && this.isEnginePlugin(enginePlugin.instance)) {
      return enginePlugin.instance.createEngine({
        sessionId: options.sessionId,
        proxyUrl: options.proxyUrl,
        proxyType: options.proxyType,
      }) as IWhatsAppEngine;
    }
    this.logger.warn(`Engine plugin ${this.engineType} not available, using fallback`);
    return this.createFallbackEngine(options);
  }

  private isEnginePlugin(instance: unknown): instance is IEnginePlugin {
    return (
      typeof instance === 'object' &&
      instance !== null &&
      'type' in instance &&
      (instance as { type: unknown }).type === PluginType.ENGINE &&
      'createEngine' in instance &&
      typeof (instance as { createEngine: unknown }).createEngine === 'function'
    );
  }

  private createFallbackEngine(options: EngineCreateOptions): IWhatsAppEngine {
    // PATCHED: Branch on engineType to pick the right fallback
    if (this.engineType === 'baileys') {
      return new BaileysAdapter({
        sessionId: options.sessionId,
        sessionDataPath: this.configService.get<string>('engine.sessionDataPath') ?? './data/sessions',
        printQRInTerminal: this.configService.get<boolean>('engine.printQRInTerminal') ?? true,
      });
    }
    return new WhatsAppWebJsAdapter({
      sessionId: options.sessionId,
      sessionDataPath: this.configService.get<string>('engine.sessionDataPath') ?? './data/sessions',
      puppeteer: {
        headless: this.configService.get<boolean>('engine.puppeteer.headless') ?? true,
        args: this.configService.get<string[]>('engine.puppeteer.args') ?? ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      proxy: options.proxyUrl
        ? { url: options.proxyUrl, type: options.proxyType ?? 'http' }
        : undefined,
    });
  }

  getAvailableEngines(): Array<{ id: string; name: string; enabled: boolean; features: string[] }> {
    const enginePlugins = this.pluginLoader.getPluginsByType(PluginType.ENGINE);
    return enginePlugins.map(plugin => ({
      id: plugin.manifest.id,
      name: plugin.manifest.name,
      enabled: this.pluginLoader.isPluginEnabled(plugin.manifest.id),
      features: plugin.instance && this.isEnginePlugin(plugin.instance) ? plugin.instance.getFeatures() : [],
    }));
  }

  getCurrentEngine(): string {
    return this.engineType;
  }
}
