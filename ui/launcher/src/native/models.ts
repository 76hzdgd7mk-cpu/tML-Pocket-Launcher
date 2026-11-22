import type { Preferences } from '../domain/types';

export interface NativeModDependency {
  name: string;
  title: string;
  requiredVersion: string;
  installedVersion: string;
  optional: boolean;
  status: 'missing' | 'outdated' | 'disabled' | 'enabled';
}

export interface NativeMod {
  id: string;
  title: string;
  version: string;
  loaderVersion: string;
  author: string;
  description: string;
  deps: string[];
  dependencies?: NativeModDependency[];
  side: number;
  size: number;
  enabled: boolean;
  error?: string;
  builtin?: boolean;
}
export interface NativePack {
  name: string;
  mods: string[];
}
export interface NativePatch {
  builtin?: boolean;
  required?: boolean;
  version?: string;
  id: string;
  name: string;
  description: string;
  targetVersion: string;
  launchArguments: string[];
  enabled: boolean;
}
export interface NativePreferences extends Partial<Preferences> {
  renderScale?: number;
  wifiOnly?: boolean;
  launchArguments?: string[];
  rendererPlugin?: string;
}
export interface NativeRenderer {
  identity: string;
  packageName: string;
  packageVersion: string;
  rendererId: string;
  displayName: string;
  description: string;
  backend: string;
}
export interface NativeInstalledVersion {
  id: string;
  version: string;
  active: boolean;
  available: boolean;
}
export interface NativeSnapshot {
  protocol: 1;
  busy: boolean;
  message: string;
  progress: number;
  error: string | null;
  retry: boolean;
  operation: string;
  launchStage?: 'resources' | 'ownership' | 'mods' | 'handoff' | null;
  ready: boolean;
  runtime: boolean;
  terraria: string | null;
  terrariaSource?: 'steam' | 'gog' | 'android' | null;
  desktopTerrariaSource?: 'steam' | 'gog' | null;
  tml: string | null;
  installedVersions?: NativeInstalledVersion[];
  mods: NativeMod[];
  packs: NativePack[];
  patches: NativePatch[];
  renderers?: NativeRenderer[];
  preferences: NativePreferences;
  appVersion: string;
}
export interface NativeRelease {
  id: string;
  tag: string;
  name: string;
  preview: boolean;
  size: number;
}
export interface ReleasePage {
  releases: NativeRelease[];
  hasMore: boolean;
}
